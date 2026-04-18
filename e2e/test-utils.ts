import type { Page, BrowserContext } from '@playwright/test';
import { test as base } from '@playwright/test';
import { basename } from 'path';
import type { TestHelpers } from 'better-auth/plugins';
import * as jose from 'jose';
import { auth, sqlite } from './auth.js';
import { E2E_BASE_URL, E2E_QR_JWT_SECRET } from './config.js';
import pkg from '../package.json' with { type: 'json' };

export { expect } from '@playwright/test';

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

// Each test file gets unique emails via the `email` fixture.
// Do NOT add shared email exports here — they cause parallel collisions.

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
 *
 * Pass an optional options object to override the defaults:
 *   - `direction` (default: `'send'`)
 *   - `amount` in cents (default: `500`)
 */
export async function createPendingQr(
	initiatingAppUserId: string,
	senderName: string,
	{ direction = 'send', amount = 500 }: { direction?: 'send' | 'receive'; amount?: number } = {}
): Promise<{ token: string; qrId: string }> {
	const qrId = crypto.randomUUID();
	const now = Math.floor(Date.now() / 1000);

	sqlite
		.prepare(
			`INSERT INTO pending_qr (id, initiating_user_id, direction, amount, status, created_at, expires_at)
			 VALUES (?, ?, ?, ?, 'pending', ?, ?)`
		)
		.run(qrId, initiatingAppUserId, direction, amount, now, now + 600);

	const secret = new TextEncoder().encode(E2E_QR_JWT_SECRET);
	const token = await new jose.SignJWT({ amt: amount, dir: direction, dn: senderName })
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
 * Clear the OTP verification record for a specific email. Call between tests to
 * prevent a stale OTP from a previous test from being read.
 * Scoped to one email to avoid clobbering OTPs from parallel tests.
 */
export function clearOTPs(email: string): void {
	sqlite.prepare(`DELETE FROM verification WHERE identifier = ?`).run(`sign-in-otp-${email}`);
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
			`INSERT INTO app_users (id, better_auth_user_id, display_name, created_at, last_seen_version)
			 VALUES (?, ?, ?, ?, ?)`
		)
		.run(id, user.id, displayName, now, pkg.version);

	return user.id;
}

/**
 * Delete the test user (and all dependent records) by email. Safe to call when
 * the user does not exist.
 */
export async function deleteTestUser(email: string): Promise<void> {
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
	sqlite.prepare(`DELETE FROM verification WHERE identifier = ?`).run(`sign-in-otp-${email}`);

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

// ── Fixture types ────────────────────────────────────────────────────────────

export type WithAuthResult = {
	context: BrowserContext;
	email: string;
	userId: string;
	appUserId: string;
};

export type WithAuthOptions = {
	displayName?: string;
} & Omit<NonNullable<Parameters<import('@playwright/test').Browser['newContext']>[0]>, 'baseURL'>;

export type TestUserResult = {
	email: string;
	userId: string;
	appUserId: string;
};

export type TestUserOptions = {
	displayName?: string;
};

// ── Playwright fixtures ───────────────────────────────────────────────────────

export const test = base.extend<{
	email: (role: string) => string;
	phone: (slot: number) => string;
	secondContext: BrowserContext;
	withAuth: (options?: WithAuthOptions) => Promise<WithAuthResult>;
	testUser: (options?: TestUserOptions) => Promise<TestUserResult>;
}>({
	// eslint-disable-next-line no-empty-pattern
	email: async ({}: object, use, testInfo) => {
		const prefix = basename(testInfo.file).replace(/\.test\.ts$/, '');
		const workerSuffix = testInfo.workerIndex > 0 ? `-w${testInfo.workerIndex}` : '';
		await use((role: string) => `e2e-${prefix}-${role}${workerSuffix}@test.example`);
	},

	/**
	 * Generates unique E164 phone numbers per worker, preventing parallel-worker
	 * collisions on shared verification records. Each slot maps to a distinct
	 * number: phone(1), phone(2), … are stable within one worker and distinct
	 * across workers. Portuguese mobile (+351 91x) format.
	 *
	 * Usage: const phone = phone(1) → '+351910000001' on worker 0,
	 *                                  '+351910000011' on worker 1, etc.
	 */
	// eslint-disable-next-line no-empty-pattern
	phone: async ({}: object, use, testInfo) => {
		const w = testInfo.workerIndex;
		await use((slot: number) => `+35191${String(w * 1000 + slot).padStart(7, '0')}`);
	},
	secondContext: async ({ browser }, use, testInfo) => {
		const ctx = await browser.newContext({ baseURL: testInfo.project.use.baseURL! });
		await use(ctx);
		await ctx.close();
	},

	/**
	 * Factory fixture: each call creates a unique user + authenticated BrowserContext.
	 * All resources are cleaned up automatically after the test.
	 */
	withAuth: async ({ browser }, use, testInfo) => {
		const teardowns: (() => Promise<void>)[] = [];

		await use(async ({ displayName = 'Test User', ...contextOptions }: WithAuthOptions = {}) => {
			const uniqueEmail = `e2e-${crypto.randomUUID()}@test.example`;
			// Register user teardown immediately — deleteTestUser is a no-op if the user
			// doesn't exist yet, so early registration ensures cleanup even if setup throws.
			teardowns.push(async () => {
				await deleteTestUser(uniqueEmail);
			});
			const ctx = await browser.newContext({
				...contextOptions,
				baseURL: testInfo.project.use.baseURL!
			});
			// Register context teardown immediately so it's always closed, even if setup below throws
			teardowns.push(async () => {
				await ctx.close().catch(() => {});
			});
			const userId = await setupAuthenticatedUser(ctx, uniqueEmail, displayName);
			const appUserId = getAppUserId(userId);

			return { context: ctx, email: uniqueEmail, userId, appUserId };
		});

		for (const td of teardowns.reverse()) {
			await td();
		}
	},

	/**
	 * Factory fixture: each call creates a unique user in the DB (no browser context).
	 * Useful for tests that only need a user ID for DB operations.
	 */
	// eslint-disable-next-line no-empty-pattern
	testUser: async ({}: object, use) => {
		const teardowns: (() => Promise<void>)[] = [];

		await use(async ({ displayName = 'Test User' }: TestUserOptions = {}) => {
			const uniqueEmail = `e2e-${crypto.randomUUID()}@test.example`;
			const userId = await createTestUser(uniqueEmail, displayName);
			const appUserId = getAppUserId(userId);

			teardowns.push(async () => {
				await deleteTestUser(uniqueEmail);
			});

			return { email: uniqueEmail, userId, appUserId };
		});

		for (const td of teardowns.reverse()) {
			await td();
		}
	}
});
