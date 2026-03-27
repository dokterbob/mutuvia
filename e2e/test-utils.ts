import type { Page } from '@playwright/test';

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

/**
 * Run through the full onboarding flow for a given email + display name,
 * finishing at /home. Used in beforeAll hooks to create authenticated sessions
 * for multi-user e2e tests without repeating the onboarding steps in each test.
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
	const otp = await getOTP(page, email);
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

/**
 * Poll the dev-only OTP endpoint until the captured OTP for `identifier`
 * appears (after the client calls sendVerificationOtp). Throws if the OTP
 * doesn't arrive within the timeout.
 */
export async function getOTP(
	page: Page,
	identifier: string,
	{ timeout = 10_000, interval = 500 }: { timeout?: number; interval?: number } = {}
): Promise<string> {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		const res = await page.request.get(
			`/api/test/otp?identifier=${encodeURIComponent(identifier)}`
		);
		if (res.ok()) {
			const { otp } = await res.json();
			return otp as string;
		}
		await page.waitForTimeout(interval);
	}
	throw new Error(`OTP for ${identifier} not captured within ${timeout}ms`);
}

/**
 * Remove the test user (and all dependent records) via the dev-only cleanup
 * endpoint. Safe to call when the user doesn't exist.
 */
export async function deleteTestUser(page: Page, email: string = TEST_EMAIL): Promise<void> {
	await page.request.delete(`/api/test/users?email=${encodeURIComponent(email)}`);
}
