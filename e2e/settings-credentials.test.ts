// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Page } from '@playwright/test';
import { test, expect, goto, getOTP, clearOTPs, deleteTestUser } from './test-utils.js';
import { sqlite } from './auth.js';
import { makePlaceholderEmail } from '../src/lib/placeholder-email.js';

// ── Low-level OTP fetchers ────────────────────────────────────────────────────

/**
 * Poll the verification table for a phone OTP. Better Auth stores it under
 * the raw E164 phone number as the identifier (no prefix).
 */
async function getPhoneOTP(
	phone: string,
	{ timeout = 10_000, interval = 500 }: { timeout?: number; interval?: number } = {}
): Promise<string> {
	const stmt = sqlite.prepare<{ value: string }, [string]>(
		`SELECT value FROM verification WHERE identifier = ? ORDER BY created_at DESC LIMIT 1`
	);
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		const row = stmt.get(phone);
		if (row) return row.value.split(':')[0];
		await new Promise((r) => setTimeout(r, interval));
	}
	throw new Error(`Phone OTP for ${phone} not captured within ${timeout}ms`);
}

function clearPhoneOTPs(phone: string): void {
	sqlite.prepare(`DELETE FROM verification WHERE identifier = ?`).run(phone);
}

/**
 * Poll the verification table for an email-change OTP.
 * Better Auth stores it under `change-email-otp-{currentEmail}-{newEmail}`.
 */
async function getEmailChangeOTP(
	currentEmail: string,
	newEmail: string,
	{ timeout = 10_000, interval = 500 }: { timeout?: number; interval?: number } = {}
): Promise<string> {
	const identifier = `change-email-otp-${currentEmail}-${newEmail}`;
	const stmt = sqlite.prepare<{ value: string }, [string]>(
		`SELECT value FROM verification WHERE identifier = ? ORDER BY created_at DESC LIMIT 1`
	);
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		const row = stmt.get(identifier);
		if (row) return row.value.split(':')[0];
		await new Promise((r) => setTimeout(r, interval));
	}
	throw new Error(
		`Email-change OTP (${currentEmail} → ${newEmail}) not captured within ${timeout}ms`
	);
}

// ── Shared UI helpers ─────────────────────────────────────────────────────────

/**
 * Complete the onboarding flow using an email address, landing on /home.
 */
async function onboardViaEmail(page: Page, userEmail: string, displayName: string): Promise<void> {
	await goto(page, '/onboarding');
	await page.getByRole('button', { name: 'Get started' }).click();

	await page.waitForURL(/\/onboarding\/consent/);
	await page.getByRole('button', { name: 'I understand, continue' }).click();

	await page.waitForURL(/\/onboarding\/phone/);
	await page.getByRole('button', { name: 'Continue with email instead' }).click();

	await page.waitForURL(/\/onboarding\/email/);
	await page.locator('input[type="email"]').fill(userEmail);
	await page.getByRole('button', { name: 'Send code' }).click();

	await page.waitForURL(/\/onboarding\/otp/);
	const otp = await getOTP(userEmail);
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
 * Complete the onboarding flow using a phone number, landing on /home.
 * The phone must be an E164 string (e.g. "+351912345678").
 */
async function onboardViaPhone(page: Page, phone: string, displayName: string): Promise<void> {
	await goto(page, '/onboarding');
	await page.getByRole('button', { name: 'Get started' }).click();

	await page.waitForURL(/\/onboarding\/consent/);
	await page.getByRole('button', { name: 'I understand, continue' }).click();

	await page.waitForURL(/\/onboarding\/phone/);

	// The PhoneInput renders a text input; fill the national part after
	// the country selector has defaulted to Portugal (+351).
	// We type the full E164 number directly into the input — svelte-tel-input
	// parses and normalises it.
	await page.locator('input[type="tel"]').fill(phone);
	await page.getByRole('button', { name: 'Send code' }).click();

	await page.waitForURL(/\/onboarding\/otp/);
	const otp = await getPhoneOTP(phone);
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
 * Sign out via the hamburger nav-menu. Waits for redirect to /onboarding.
 */
async function signOut(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Menu' }).click();
	await expect(page.getByRole('menu')).toBeVisible();
	await page.getByRole('menuitem', { name: 'Sign out' }).click();
	await page.waitForURL(/\/onboarding/, { timeout: 10_000 });
}

/**
 * Sign back in via the email OTP onboarding flow.
 * Assumes the user already has an app_users record (skips name step).
 */
async function signInViaEmail(page: Page, userEmail: string): Promise<void> {
	await goto(page, '/onboarding');
	await page.getByRole('button', { name: 'Get started' }).click();

	await page.waitForURL(/\/onboarding\/consent/);
	await page.getByRole('button', { name: 'I understand, continue' }).click();

	await page.waitForURL(/\/onboarding\/phone/);
	await page.getByRole('button', { name: 'Continue with email instead' }).click();

	await page.waitForURL(/\/onboarding\/email/);
	await page.locator('input[type="email"]').fill(userEmail);
	await page.getByRole('button', { name: 'Send code' }).click();

	await page.waitForURL(/\/onboarding\/otp/);
	const otp = await getOTP(userEmail);
	await page.locator('input[inputmode="numeric"]').pressSequentially(otp);

	// Existing user with an app_users record is redirected straight to /home.
	await page.waitForURL(/\/home/, { timeout: 10_000 });
}

/**
 * Sign back in via the phone OTP onboarding flow.
 */
async function signInViaPhone(page: Page, phone: string): Promise<void> {
	await goto(page, '/onboarding');
	await page.getByRole('button', { name: 'Get started' }).click();

	await page.waitForURL(/\/onboarding\/consent/);
	await page.getByRole('button', { name: 'I understand, continue' }).click();

	await page.waitForURL(/\/onboarding\/phone/);
	await page.locator('input[type="tel"]').fill(phone);
	await page.getByRole('button', { name: 'Send code' }).click();

	await page.waitForURL(/\/onboarding\/otp/);
	const otp = await getPhoneOTP(phone);
	await page.locator('input[inputmode="numeric"]').pressSequentially(otp);

	// Existing user is redirected straight to /home.
	await page.waitForURL(/\/home/, { timeout: 10_000 });
}

/**
 * Open Settings from /home via the nav-menu.
 */
async function goToSettings(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Menu' }).click();
	await expect(page.getByRole('menu')).toBeVisible();
	await page.getByRole('menuitem', { name: 'Settings' }).click();
	await page.waitForURL(/\/settings/, { timeout: 10_000 });
}

/**
 * Add or change the email credential in the Sign-in methods card.
 *
 * @param page - Playwright page
 * @param newEmail - The new email address to set
 * @param dbCurrentEmail - The email address currently stored in the DB for this
 *   user (used to derive the Better Auth verification identifier). For a
 *   phone-only user this is the `{digits}@phone.placeholder` address; for a
 *   real-email user it is their actual email. The UI button shown depends on
 *   whether a real email is visible, not on this value.
 * @param hasRealEmail - Pass true when the user already has a non-placeholder
 *   email so the "Change" button is shown instead of "Add email".
 */
async function addOrChangeEmail(
	page: Page,
	newEmail: string,
	dbCurrentEmail: string,
	hasRealEmail = false
): Promise<void> {
	// Click either "Add email" (phone-only user) or "Change" (real-email user)
	if (hasRealEmail) {
		await page.getByRole('button', { name: 'Change' }).first().click();
	} else {
		await page.getByRole('button', { name: 'Add email' }).click();
	}

	await page.locator('input[type="email"]').fill(newEmail);
	await page.getByRole('button', { name: 'Send code' }).click();

	// Fetch OTP from the verification table (change-email flow).
	// The identifier is `change-email-otp-{dbCurrentEmail}-{newEmail}`.
	const otp = await getEmailChangeOTP(dbCurrentEmail, newEmail);
	await page.locator('input[inputmode="numeric"]').pressSequentially(otp);

	await expect(page.getByText('Email updated!')).toBeVisible({ timeout: 10_000 });
}

/**
 * Add or change the phone credential in the Sign-in methods card.
 *
 * @param hasPhone - Pass true when the user already has a phone number so the
 *   "Change" button is shown instead of "Add phone".
 */
async function addOrChangePhone(page: Page, newPhone: string, hasPhone = false): Promise<void> {
	if (hasPhone) {
		// When a phone is already set the row shows "Change". There may also be a
		// "Change" button in the email row, so pick the last one (phone row is below email).
		const changeBtns = page.getByRole('button', { name: 'Change' });
		await changeBtns.last().click();
	} else {
		await page.getByRole('button', { name: 'Add phone' }).click();
	}

	await page.locator('input[type="tel"]').fill(newPhone);
	await page.getByRole('button', { name: 'Send code' }).click();

	const otp = await getPhoneOTP(newPhone);
	await page.locator('input[inputmode="numeric"]').pressSequentially(otp);

	await expect(page.getByText('Phone updated!')).toBeVisible({ timeout: 10_000 });
}

// ── Test suite ────────────────────────────────────────────────────────────────

// Use .serial so each test starts with a fresh page state and the shared
// onboarding/sign-out helpers don't race with parallel tabs.
test.describe.serial('Credential management — Sign-in methods settings', () => {
	// Fixed test phones — unique per test via numeric suffix to avoid collisions
	// across parallel test file runs.
	const PHONE_A = '+351910000001';
	const PHONE_B = '+351910000002';
	const PHONE_C = '+351910000003';

	test.afterEach(async ({ email }) => {
		// Clean up all credentials used by this test suite
		await deleteTestUser(email('user'));
		clearOTPs(email('user'));
		await deleteTestUser(email('new-email'));
		clearOTPs(email('new-email'));
		// Phone users are registered under a placeholder email
		await deleteTestUser(makePlaceholderEmail(PHONE_A));
		await deleteTestUser(makePlaceholderEmail(PHONE_B));
		await deleteTestUser(makePlaceholderEmail(PHONE_C));
		clearPhoneOTPs(PHONE_A);
		clearPhoneOTPs(PHONE_B);
		clearPhoneOTPs(PHONE_C);
	});

	// ── Test 1: Phone-signup user adds an email ───────────────────────────────

	test('Given phone-only signup, when user adds email in settings, then sign-in with new email lands on home', async ({
		page,
		email
	}) => {
		const newEmail = email('user');

		// Given: onboarded via phone
		await onboardViaPhone(page, PHONE_A, 'Phone User');

		// When: navigate to Settings and add an email.
		// The DB stores the placeholder email for phone-only users.
		await goToSettings(page);
		await expect(page.getByText('Sign-in methods')).toBeVisible();
		await addOrChangeEmail(page, newEmail, makePlaceholderEmail(PHONE_A), false);

		// Sign out
		await goto(page, '/home');
		await signOut(page);

		// Then: signing in with the new email should land on /home
		await signInViaEmail(page, newEmail);
		await expect(page).toHaveURL(/\/home/);
	});

	// ── Test 2: Email-signup user adds a phone ────────────────────────────────

	test('Given email-only signup, when user adds phone in settings, then sign-in with new phone lands on home', async ({
		page,
		email
	}) => {
		const userEmail = email('user');

		// Given: onboarded via email
		await onboardViaEmail(page, userEmail, 'Email User');

		// When: navigate to Settings and add a phone number
		await goToSettings(page);
		await expect(page.getByText('Sign-in methods')).toBeVisible();
		await addOrChangePhone(page, PHONE_B);

		// Sign out
		await goto(page, '/home');
		await signOut(page);

		// Then: signing in with the new phone should land on /home
		await signInViaPhone(page, PHONE_B);
		await expect(page).toHaveURL(/\/home/);
	});

	// ── Test 3: Change phone ──────────────────────────────────────────────────

	test('Given phone-only signup, when user changes phone in settings, then sign-in with new phone lands on home', async ({
		page
	}) => {
		// Given: onboarded via phone (PHONE_B)
		await onboardViaPhone(page, PHONE_B, 'Phone Changer');

		// When: navigate to Settings and change to a new phone number
		await goToSettings(page);
		await expect(page.getByText('Sign-in methods')).toBeVisible();
		await addOrChangePhone(page, PHONE_C, true);

		// Sign out
		await goto(page, '/home');
		await signOut(page);

		// Then: signing in with the new phone should land on /home
		await signInViaPhone(page, PHONE_C);
		await expect(page).toHaveURL(/\/home/);
	});

	// ── Test 4: Change email ──────────────────────────────────────────────────

	test('Given email-only signup, when user changes email in settings, then sign-in with new email lands on home', async ({
		page,
		email
	}) => {
		const originalEmail = email('user');
		const newEmail = email('new-email');

		// Given: onboarded via email
		await onboardViaEmail(page, originalEmail, 'Email Changer');

		// When: navigate to Settings and change to a new email address
		await goToSettings(page);
		await expect(page.getByText('Sign-in methods')).toBeVisible();
		await addOrChangeEmail(page, newEmail, originalEmail, true);

		// Sign out
		await goto(page, '/home');
		await signOut(page);

		// Then: signing in with the new email should land on /home
		await signInViaEmail(page, newEmail);
		await expect(page).toHaveURL(/\/home/);
	});
});
