import { test, expect } from '@playwright/test';

// AUTH REQUIRED: /send and /receive are behind the (app) layout guard.
// The (app)/+layout.server.ts redirects to /onboarding if no session exists.
//
// The seed script (scripts/seed.ts) creates users and appUsers but NOT sessions.
// To enable these tests, one of these approaches is needed:
//   1. Extend seed.ts to insert a row into the `session` table and inject
//      the token via page.context().addCookies() with cookie name `better-auth.session_token`
//   2. Create a Playwright fixture that calls Better Auth's API to mint a session
//   3. Add a dev-only API endpoint that creates sessions for testing
//
// The QR generate button text is send.cta = "Generate QR" (EN).
// CopyButton renders a button with children text qr.copy_link = "Copy link".
// After clicking, sr-only text switches to "Copied" for ~500ms then reverts to "Copy".

test.describe('CopyButton', () => {
	test.skip(true, 'Requires auth session — implement session seeding first');

	test('CopyButton visible after generating QR on /send', async ({ page }) => {
		await page.goto('/send');
		await page.locator('input[type="number"]').fill('10');
		await page.getByRole('button', { name: 'Generate QR' }).click();
		await expect(page.getByRole('button', { name: /copy link/i })).toBeVisible();
	});

	test('clicking CopyButton shows copied state briefly', async ({ page }) => {
		await page.goto('/send');
		await page.locator('input[type="number"]').fill('10');
		await page.getByRole('button', { name: 'Generate QR' }).click();

		const copyBtn = page.getByRole('button', { name: /copy link/i });
		await copyBtn.click();
		// UseClipboard sets status='success' → sr-only text changes to "Copied"
		await expect(copyBtn.locator('.sr-only')).toHaveText('Copied');
		// After animationDuration (~500ms) reverts
		await page.waitForTimeout(700);
		await expect(copyBtn.locator('.sr-only')).toHaveText('Copy');
	});

	test('CopyButton visible on /receive after generating QR', async ({ page }) => {
		await page.goto('/receive');
		await page.locator('input[type="number"]').fill('5');
		await page.getByRole('button', { name: 'Generate QR' }).click();
		await expect(page.getByRole('button', { name: /copy link/i })).toBeVisible();
	});
});
