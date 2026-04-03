import type { Page } from '@playwright/test';
import { test, expect, goto, getOTP, clearOTPs, deleteTestUser } from './test-utils.js';

async function navigateToOtpPage(page: Page, userEmail: string) {
	// ── Welcome ───────────────────────────────────────────────────────────────
	await goto(page, '/onboarding');
	await page.getByRole('button', { name: 'Get started' }).click();

	// ── Consent ───────────────────────────────────────────────────────────────
	await page.waitForURL(/\/onboarding\/consent/);
	await page.getByRole('button', { name: 'I understand, continue' }).click();

	// ── Phone (pivot to email) ────────────────────────────────────────────────
	await page.waitForURL(/\/onboarding\/phone/);
	await page.getByRole('button', { name: 'Continue with email instead' }).click();

	// ── Email ─────────────────────────────────────────────────────────────────
	await page.waitForURL(/\/onboarding\/email/);
	await page.locator('input[type="email"]').fill(userEmail);
	await page.getByRole('button', { name: 'Send code' }).click();

	// ── OTP ───────────────────────────────────────────────────────────────────
	await page.waitForURL(/\/onboarding\/otp/);
}

test.describe.serial('OTP error handling', () => {
	test.afterEach(async ({ email }) => {
		await deleteTestUser(email('user'));
		clearOTPs(email('user'));
	});

	test('wrong OTP shows error and stays on OTP page', async ({ page, email }) => {
		await navigateToOtpPage(page, email('user'));

		await page.locator('input[inputmode="numeric"]').pressSequentially('000000');

		await expect(page.locator('.text-red-600')).toBeVisible({ timeout: 10_000 });
		await expect(page).toHaveURL(/\/onboarding\/otp/);
		await expect(page.locator('input[inputmode="numeric"]')).toHaveValue('');
	});

	test('correct OTP after failed attempt succeeds', async ({ page, email }) => {
		await navigateToOtpPage(page, email('user'));

		const otp = await getOTP(email('user'));

		await page.locator('input[inputmode="numeric"]').pressSequentially('000000');
		await expect(page.locator('.text-red-600')).toBeVisible({ timeout: 10_000 });

		await page.locator('input[inputmode="numeric"]').pressSequentially(otp);
		await expect(page).toHaveURL(/\/onboarding\/verified/, { timeout: 10_000 });
	});

	test('OTP input is auto-focused on page load', async ({ page, email }) => {
		await navigateToOtpPage(page, email('user'));

		await expect(page.locator('input[inputmode="numeric"]')).toBeFocused();
	});
});
