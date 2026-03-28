import type { Page, BrowserContext } from '@playwright/test';
import { test as base } from '@playwright/test';
import type { TestHelpers } from 'better-auth/plugins';
import * as jose from 'jose';
import { auth, sqlite } from './auth.js';
import { E2E_BASE_URL, E2E_QR_JWT_SECRET } from './config.js';

/**
 * Navigate to a URL and wait for SvelteKit hydration to complete before
 * returning. Without this, Playwright may interact with server-rendered HTML
 * before client-side components (bits-ui, Svelte stores) have activated,
 * causing clicks on popovers/dropdowns to have no effect.
 *
 * The root +layout.svelte adds `document.body.classList.add('hydrated')` on
 * mount, which signals that hydration is complete.
 */
export async function goto(page: Page, url: string): Promise<void> {
	await page.goto(url);
	await page.locator('body.hydrated').waitFor();
}

/**
 * A stable email address used for e2e onboarding tests. Cleaned up after each
 * test via deleteTestUser().
 */
export const TEST_EMAIL = 'e2e-onboarding@test.example';

/** Stable emails for two-user send/receive flow tests. */
export const SENDER_EMAIL = 'e2e-sender@test.example';
export const RECEIVER_EMAIL = 'e2e-receiver@test.example';

/** Stable email for the unauthenticated QR scanner in qr-onboarding tests. */
export const SCANNER_EMAIL = 'e2e-scanner@test.example';

// ── TestHelpers accessor ──────────────────────────────────────────────────────

async function getTest(): Promise<TestHelpers> {
	const ctx = await auth.$context;
	return (ctx as { test: TestHelpers }).test;
}

// ── QR helpers ────────────────────────────────────────────────────────────────

/**
 * Look up the app_users.id for a given Better Auth user ID.
 */
export function getAppUserId(betterAuthUserId: string): string {
	const row = sqlite
		.prepare<{ id: string }, [string]>(`SELECT id FROM app_users WHERE better_auth_user_id = ?`)
		.get(betterAuthUserId);
	if (!row) throw new Error(`No app_users row for betterAuthUserId=${betterAuthUserId}`);
	return row.id;
}

/**
 * Insert a pending QR row and sign a JWT for it. Returns { token, qrId }.
 * Uses the same JWT format as src/lib/server/qr.ts (HS256, issuer=appUrl).
 */
export async function createPendingQr(
	initiatingAppUserId: string,
	senderName: string
): Promise<{ token: string; qrId: string }> {
	const qrId = crypto.randomUUID();
	const now = Math.floor(Date.now() / 1000);

	sqlite
		.prepare(
			`INSERT INTO pending_qr (id, initiating_user_id, direction, amount, status, created_at, expires_at)
			 VALUES (?, ?, 'send', 500, 'pending', ?, ?)`
		)
		.run(qrId, initiatingAppUserId, now, now + 600);

	const secret = new TextEncoder().encode(E2E_QR_JWT_SECRET);
	const token = await new jose.SignJWT({ amt: 500, dir: 'send', dn: senderName })
		.setProtectedHeader({ alg: 'HS256' })
		.setJti(qrId)
		.setIssuer(E2E_BASE_URL)
		.setIssuedAt()
		.setExpirationTime('600s')
		.sign(secret);

	return { token, qrId };
}

// ── OTP helpers ───────────────────────────────────────────────────────────────

/**
 * Poll the verification table directly until the OTP for `email` appears.
 * Better Auth stores the OTP in plain-text as the first `:` -delimited segment
 * of `verification.value` under the identifier `sign-in-otp-<email>`.
 */
export async function getOTP(
	email: string,
	{ timeout = 10_000, interval = 500 }: { timeout?: number; interval?: number } = {}
): Promise<string> {
	const identifier = `sign-in-otp-${email}`;
	const stmt = sqlite.prepare<{ value: string }, [string]>(
		`SELECT value FROM verification WHERE identifier = ? ORDER BY created_at DESC LIMIT 1`
	);

	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		const row = stmt.get(identifier);
		if (row) return row.value.split(':')[0];
		await new Promise((r) => setTimeout(r, interval));
	}
	throw new Error(`OTP for ${email} not captured within ${timeout}ms`);
}

/**
 * Clear all OTP verification records from the database. Call between tests to
 * prevent a stale OTP from a previous test from being read.
 */
export function clearOTPs(): void {
	sqlite.exec(`DELETE FROM verification WHERE identifier LIKE '%-otp-%'`);
}

// ── User helpers ──────────────────────────────────────────────────────────────

/**
 * Create a fully-initialised test user: a Better Auth user (via testUtils) and
 * a matching app_users record. Returns the Better Auth user ID.
 */
export async function createTestUser(email: string, displayName: string): Promise<string> {
	const test = await getTest();
	const user = test.createUser({ email, emailVerified: true, name: displayName });
	await test.saveUser(user);

	const id = crypto.randomUUID();
	const now = Math.floor(Date.now() / 1000);
	sqlite
		.prepare(
			`INSERT INTO app_users (id, better_auth_user_id, display_name, created_at)
			 VALUES (?, ?, ?, ?)`
		)
		.run(id, user.id, displayName, now);

	return user.id;
}

/**
 * Delete the test user (and all dependent records) by email. Safe to call when
 * the user does not exist.
 */
export async function deleteTestUser(email: string = TEST_EMAIL): Promise<void> {
	const row = sqlite
		.prepare<{ id: string }, [string]>(`SELECT id FROM user WHERE email = ?`)
		.get(email);
	if (!row) return;

	const userId = row.id;

	// Delete app_users dependents before deleting the app_users row itself
	const appUserRow = sqlite
		.prepare<{ id: string }, [string]>(`SELECT id FROM app_users WHERE better_auth_user_id = ?`)
		.get(userId);
	if (appUserRow) {
		const appUserId = appUserRow.id;
		sqlite
			.prepare(`DELETE FROM transactions WHERE from_user_id = ? OR to_user_id = ?`)
			.run(appUserId, appUserId);
		sqlite
			.prepare(`DELETE FROM connections WHERE user_a_id = ? OR user_b_id = ?`)
			.run(appUserId, appUserId);
		sqlite.prepare(`DELETE FROM pending_qr WHERE initiating_user_id = ?`).run(appUserId);
	}

	sqlite.prepare(`DELETE FROM app_users WHERE better_auth_user_id = ?`).run(userId);

	const test = await getTest();
	await test.deleteUser(userId);
}

// ── Auth / session helpers ────────────────────────────────────────────────────

/**
 * Get Playwright-compatible session cookies for `userId`. The returned array
 * is directly usable with `context.addCookies()`.
 */
export async function getAuthCookies(
	userId: string
): Promise<Awaited<ReturnType<TestHelpers['getCookies']>>> {
	const test = await getTest();
	return test.getCookies({ userId, domain: 'localhost' });
}

/**
 * Programmatically create a user and inject auth cookies into `context`.
 * Returns the userId so the caller can reference it if needed.
 */
export async function setupAuthenticatedUser(
	context: BrowserContext,
	email: string,
	displayName: string
): Promise<string> {
	const userId = await createTestUser(email, displayName);
	const cookies = await getAuthCookies(userId);
	await context.addCookies(cookies);
	return userId;
}

// ── Onboarding UI helper ──────────────────────────────────────────────────────

/**
 * Run through the full onboarding flow for a given email + display name,
 * finishing at /home. Used only when the onboarding UI itself is under test.
 * For other test setups, prefer setupAuthenticatedUser().
 */
export async function onboardUserViaEmail(
	page: Page,
	email: string,
	displayName: string
): Promise<void> {
	await goto(page, '/onboarding');
	await page.getByRole('button', { name: 'Get started' }).click();

	await page.waitForURL(/\/onboarding\/consent/);
	await page.getByRole('button', { name: 'I understand, continue' }).click();

	await page.waitForURL(/\/onboarding\/phone/);
	await page.getByRole('button', { name: 'Continue with email instead' }).click();

	await page.waitForURL(/\/onboarding\/email/);
	await page.locator('input[type="email"]').fill(email);
	await page.getByRole('button', { name: 'Send code' }).click();

	await page.waitForURL(/\/onboarding\/otp/);
	const otp = await getOTP(email);
	await page.locator('input[inputmode="numeric"]').pressSequentially(otp);

	await page.waitForURL(/\/onboarding\/verified/, { timeout: 10_000 });
	await page.getByRole('button', { name: 'Continue' }).click();
	await page.getByRole('button', { name: 'Got it' }).click();
	await page.getByRole('button', { name: 'Understood' }).click();

	await page.waitForURL(/\/onboarding\/name/);
	await page.locator('input[name="displayName"]').fill(displayName);
	await page.getByRole('button', { name: 'Enter the community' }).click();

	await page.waitForURL(/\/home/, { timeout: 10_000 });
}

// ── Playwright fixtures ───────────────────────────────────────────────────────

/**
 * Custom test fixture that provides a fresh unauthenticated browser context
 * as `secondContext`. The context is automatically closed after each test,
 * eliminating the need for try/finally blocks.
 */
export const test = base.extend<{ secondContext: import('@playwright/test').BrowserContext }>({
	secondContext: async ({ browser }, use, testInfo) => {
		const ctx = await browser.newContext({ baseURL: testInfo.project.use.baseURL! });
		await use(ctx);
		await ctx.close();
	}
});
