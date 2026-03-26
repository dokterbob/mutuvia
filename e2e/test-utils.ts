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
