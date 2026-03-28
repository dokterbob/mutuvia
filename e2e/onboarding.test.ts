import { test, expect } from '@playwright/test';
import { goto, getOTP, deleteTestUser, clearOTPs, TEST_EMAIL } from './test-utils.js';

test.describe.serial('Onboarding flow', () => {
	test.afterEach(async () => {
		await deleteTestUser(TEST_EMAIL);
		clearOTPs();
	});

	test('complete onboarding via email — happy path', async ({ page }) => {
		// ── Welcome ──────────────────────────────────────────────────────────────
		await goto(page, '/onboarding');
		await expect(page.getByRole('heading', { name: /Together, we are more/i })).toBeVisible();
		await page.getByRole('button', { name: 'Get started' }).click();

		// ── Consent ──────────────────────────────────────────────────────────────
		await expect(page).toHaveURL(/\/onboarding\/consent/);
		await expect(page.getByText("What you're agreeing to")).toBeVisible();
		await page.getByRole('button', { name: 'I understand, continue' }).click();

		// ── Phone (pivot to email) ────────────────────────────────────────────────
		await expect(page).toHaveURL(/\/onboarding\/phone/);
		await page.getByRole('button', { name: 'Continue with email instead' }).click();

		// ── Email ─────────────────────────────────────────────────────────────────
		await expect(page).toHaveURL(/\/onboarding\/email/);
		await page.locator('input[type="email"]').fill(TEST_EMAIL);
		await page.getByRole('button', { name: 'Send code' }).click();

		// ── OTP ───────────────────────────────────────────────────────────────────
		await expect(page).toHaveURL(/\/onboarding\/otp/);
		const otp = await getOTP(TEST_EMAIL);
		// The OTP input is a single hidden input overlaid on the digit boxes.
		// pressSequentially fires individual input events which trigger auto-submit.
		await page.locator('input[inputmode="numeric"]').pressSequentially(otp);

		// ── Verified ──────────────────────────────────────────────────────────────
		await expect(page).toHaveURL(/\/onboarding\/verified/, { timeout: 10_000 });
		await expect(page.getByText("You're verified")).toBeVisible();
		await page.getByRole('button', { name: 'Continue' }).click();

		// ── Intro 1 ───────────────────────────────────────────────────────────────
		await expect(page).toHaveURL(/\/onboarding\/intro1/);
		await expect(page.getByText('A ledger of trust')).toBeVisible();
		await page.getByRole('button', { name: 'Got it' }).click();

		// ── Intro 2 ───────────────────────────────────────────────────────────────
		await expect(page).toHaveURL(/\/onboarding\/intro2/);
		await expect(page.getByText('Negative is normal')).toBeVisible();
		await page.getByRole('button', { name: 'Understood' }).click();

		// ── Name ──────────────────────────────────────────────────────────────────
		await expect(page).toHaveURL(/\/onboarding\/name/);
		await page.locator('input[name="displayName"]').fill('E2E Tester');
		await page.getByRole('button', { name: 'Enter the community' }).click();

		// ── Home ──────────────────────────────────────────────────────────────────
		await expect(page).toHaveURL(/\/home/, { timeout: 10_000 });
		await expect(
			page.getByText(/Good (morning|afternoon|evening|night), E2E Tester/)
		).toBeVisible();
	});

	test('fully onboarded user is redirected away from onboarding', async ({ page }) => {
		// Run the full flow first to create the user + appUser
		await goto(page, '/onboarding');
		await page.getByRole('button', { name: 'Get started' }).click();
		await expect(page).toHaveURL(/\/onboarding\/consent/);
		await page.getByRole('button', { name: 'I understand, continue' }).click();
		await expect(page).toHaveURL(/\/onboarding\/phone/);
		await page.getByRole('button', { name: 'Continue with email instead' }).click();
		await page.locator('input[type="email"]').fill(TEST_EMAIL);
		await page.getByRole('button', { name: 'Send code' }).click();
		await expect(page).toHaveURL(/\/onboarding\/otp/);
		const otp = await getOTP(TEST_EMAIL);
		await page.locator('input[inputmode="numeric"]').pressSequentially(otp);
		await expect(page).toHaveURL(/\/onboarding\/verified/, { timeout: 10_000 });
		await page.getByRole('button', { name: 'Continue' }).click();
		await page.getByRole('button', { name: 'Got it' }).click();
		await page.getByRole('button', { name: 'Understood' }).click();
		await page.locator('input[name="displayName"]').fill('E2E Tester');
		await page.getByRole('button', { name: 'Enter the community' }).click();
		await expect(page).toHaveURL(/\/home/, { timeout: 10_000 });

		// Now re-visit onboarding — should redirect straight to /home
		await page.goto('/onboarding');
		await expect(page).toHaveURL(/\/home/);
	});
});
