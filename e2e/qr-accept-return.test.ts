// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Covers the signed-out → sign-in/sign-up → back-to-/accept/[token] round
// trip and what happens once the scanner returns: auto-accept for a fast
// "send" QR, a resume-and-confirm step for "receive" (paying) and for "How
// it works" (full onboarding), the existing-user shortcut through the
// onboarding layout, a QR expiring mid-onboarding, and a creator signing in
// from their own link. See src/routes/accept/[token]/+page.server.ts and
// src/lib/server/qr-return.ts for the behaviour under test.

import type { Page } from '@playwright/test';
import {
	test,
	expect,
	goto,
	createPendingQr,
	getOTP,
	deleteTestUser,
	expirePendingQr
} from './test-utils.js';

const CREATOR_NAME = 'Return QR Creator';

/**
 * Full ("How it works") onboarding via email OTP, including the intro
 * screens — unlike the fast track, which skips straight to the name step.
 * Assumes the caller already triggered `startFullOnboarding` (e.g. by
 * clicking "How it works" on /accept/[token]), landing on bare /onboarding.
 */
async function completeFullOnboardingViaEmail(
	page: Page,
	email: string,
	displayName: string
): Promise<void> {
	await page.waitForURL(/\/onboarding$/);
	await page.getByRole('button', { name: 'Get started' }).click();

	await page.waitForURL(/\/onboarding\/consent/);
	await page.getByRole('button', { name: 'I understand, continue' }).click();

	await page.waitForURL(/\/onboarding\/phone/);
	await page.getByRole('button', { name: /continue with email/i }).click();

	await page.waitForURL(/\/onboarding\/email/);
	await page.locator('input[type="email"]').fill(email);
	await page.getByRole('button', { name: /send code/i }).click();

	await page.waitForURL(/\/onboarding\/otp/);
	const otp = await getOTP(email);
	await page.locator('input[inputmode="numeric"]').pressSequentially(otp);

	await page.waitForURL(/\/onboarding\/verified/, { timeout: 10_000 });
	await page.getByRole('button', { name: /continue/i }).click();
	await page.getByRole('button', { name: /got it/i }).click();
	await page.getByRole('button', { name: /understood/i }).click();

	await page.waitForURL(/\/onboarding\/name/, { timeout: 10_000 });
	await page.locator('input[name="displayName"]').fill(displayName);
	await page.getByRole('button', { name: /enter the community/i }).click();
}

test.describe('QR accept/[token] signed-out return flow', () => {
	// New-user scanners/payers are created via the onboarding UI, not the
	// `testUser` fixture, so they need explicit cleanup (unlike the
	// `testUser`-created creators below, which clean up on their own).
	test.afterEach(async ({ email }) => {
		await deleteTestUser(email('new-scanner'));
		await deleteTestUser(email('new-payer'));
		await deleteTestUser(email('full-onboarding-scanner'));
		await deleteTestUser(email('expiring-scanner'));
	});

	test('Given a send QR, when a signed-out new scanner taps "Accept … from …" and finishes email sign-up, then the QR auto-settles and Home shows a toast', async ({
		secondContext,
		email,
		testUser
	}) => {
		const creator = await testUser({ displayName: CREATOR_NAME });
		const { token } = await createPendingQr(creator.appUserId, CREATOR_NAME, {
			direction: 'send',
			amount: 500
		});
		const scannerEmail = email('new-scanner');

		const page = await secondContext.newPage();
		await goto(page, `/accept/${token}`);

		await expect(page.getByRole('heading', { level: 1 })).toContainText(
			`${CREATOR_NAME} wants to send you`
		);
		const fastCta = page.getByRole('button', {
			name: new RegExp(`Accept .* from ${CREATOR_NAME}`)
		});
		await expect(fastCta).toBeVisible();
		await expect(page.getByText("It's added right after.")).toBeVisible();

		await fastCta.click();
		await page.waitForURL(/\/onboarding\/phone/);
		await page.getByRole('button', { name: /continue with email/i }).click();

		await page.waitForURL(/\/onboarding\/email/);
		await page.locator('input[type="email"]').fill(scannerEmail);
		await page.getByRole('button', { name: /send code/i }).click();

		await page.waitForURL(/\/onboarding\/otp/);
		const otp = await getOTP(scannerEmail);
		await page.locator('input[inputmode="numeric"]').pressSequentially(otp);

		// Fast track: skips the intro screens, straight to verified → name.
		await page.waitForURL(/\/onboarding\/verified/, { timeout: 10_000 });
		await page.getByRole('button', { name: /continue/i }).click();

		await page.waitForURL(/\/onboarding\/name/, { timeout: 10_000 });
		await page.locator('input[name="displayName"]').fill('Return New Scanner');
		await page.getByRole('button', { name: /enter the community/i }).click();

		// New users return via the name step's own consumeQrReturnTo, land back
		// on /accept/[token], then its "fast" + "send" auto-accept fires and
		// redirects to /home — no manual Accept click needed.
		await expect(page).toHaveURL(/\/home/, { timeout: 10_000 });
		await expect(
			page.getByText(new RegExp(`from ${CREATOR_NAME} added to your balance`))
		).toBeVisible();

		// Ledger actually moved: the scanner's balance is now positive.
		await expect(page.getByText('The community owes you')).toBeVisible();
	});

	test('Given a receive QR, when a signed-out new payer taps "Sign in to review" and finishes email sign-up, then they land on the resume confirm and nothing settles until they tap Pay', async ({
		secondContext,
		email,
		withAuth
	}) => {
		const creator = await withAuth({ displayName: CREATOR_NAME });
		const { token } = await createPendingQr(creator.appUserId, CREATOR_NAME, {
			direction: 'receive',
			amount: 300
		});
		const payerEmail = email('new-payer');

		// Creator's own view of the still-pending request.
		const creatorPage = await creator.context.newPage();
		await goto(creatorPage, '/home');
		await expect(creatorPage.getByText('Requesting')).toBeVisible();

		const page = await secondContext.newPage();
		await goto(page, `/accept/${token}`);

		await expect(page.getByRole('heading', { level: 1 })).toContainText(
			`${CREATOR_NAME} is requesting`
		);
		const signInCta = page.getByRole('button', { name: /sign in to review/i });
		await expect(signInCta).toBeVisible();
		await expect(page.getByText("You'll confirm before anything is paid.")).toBeVisible();

		await signInCta.click();
		await page.waitForURL(/\/onboarding\/phone/);
		await page.getByRole('button', { name: /continue with email/i }).click();

		await page.waitForURL(/\/onboarding\/email/);
		await page.locator('input[type="email"]').fill(payerEmail);
		await page.getByRole('button', { name: /send code/i }).click();

		await page.waitForURL(/\/onboarding\/otp/);
		const otp = await getOTP(payerEmail);
		await page.locator('input[inputmode="numeric"]').pressSequentially(otp);

		await page.waitForURL(/\/onboarding\/verified/, { timeout: 10_000 });
		await page.getByRole('button', { name: /continue/i }).click();

		await page.waitForURL(/\/onboarding\/name/, { timeout: 10_000 });
		await page.locator('input[name="displayName"]').fill('Return New Payer');
		await page.getByRole('button', { name: /enter the community/i }).click();

		// Resume state: "Last step" banner + a "Pay …" CTA — direction
		// 'receive' never auto-accepts, even on the fast track.
		await page.waitForURL(/\/accept\//, { timeout: 10_000 });
		await expect(page.getByText(/Last step/)).toBeVisible();
		const payButton = page.getByRole('button', {
			name: new RegExp(`Pay ${CREATOR_NAME}`)
		});
		await expect(payButton).toBeVisible();

		// Still pending on the creator's side — nothing settled yet.
		await creatorPage.reload();
		await expect(creatorPage.getByText('Requesting')).toBeVisible();

		await payButton.click();
		await expect(page).toHaveURL(/\/home/, { timeout: 10_000 });
		await expect(page.getByText(new RegExp(`You paid ${CREATOR_NAME}`))).toBeVisible();

		// Settled — gone from the creator's pending list.
		await creatorPage.reload();
		await expect(creatorPage.getByText('Requesting')).not.toBeVisible();
	});

	test('Given a send QR, when an EXISTING user signs in from the accept link, then the onboarding layout returns them straight to it and the fast-track auto-accept still settles', async ({
		secondContext,
		testUser
	}) => {
		const creator = await testUser({ displayName: CREATOR_NAME });
		const existingUser = await testUser({ displayName: 'Return Existing User' });
		const { token } = await createPendingQr(creator.appUserId, CREATOR_NAME, {
			direction: 'send',
			amount: 400
		});

		const page = await secondContext.newPage();
		await goto(page, `/accept/${token}`);

		const fastCta = page.getByRole('button', {
			name: new RegExp(`Accept .* from ${CREATOR_NAME}`)
		});
		await fastCta.click();
		await page.waitForURL(/\/onboarding\/phone/);
		await page.getByRole('button', { name: /continue with email/i }).click();

		await page.waitForURL(/\/onboarding\/email/);
		await page.locator('input[type="email"]').fill(existingUser.email);
		await page.getByRole('button', { name: /send code/i }).click();

		await page.waitForURL(/\/onboarding\/otp/);
		const otp = await getOTP(existingUser.email);
		await page.locator('input[inputmode="numeric"]').pressSequentially(otp);

		// This user already has an app_users row, so the onboarding *layout*
		// (not the name step) consumes qr_return_to and redirects straight
		// back — the name step is never reached. The fast + send auto-accept
		// on /accept/[token] then settles it and sends them on to /home.
		await expect(page).toHaveURL(/\/home/, { timeout: 10_000 });
		await expect(
			page.getByText(new RegExp(`from ${CREATOR_NAME} added to your balance`))
		).toBeVisible();
	});

	test('Given a send QR, when a signed-out scanner picks "How it works" (full onboarding), then they return to the confirm state with NO auto-accept', async ({
		secondContext,
		email,
		testUser
	}) => {
		const creator = await testUser({ displayName: CREATOR_NAME });
		const { token } = await createPendingQr(creator.appUserId, CREATOR_NAME, {
			direction: 'send',
			amount: 600
		});
		const scannerEmail = email('full-onboarding-scanner');

		const page = await secondContext.newPage();
		await goto(page, `/accept/${token}`);

		await page.getByRole('button', { name: /how it works/i }).click();
		await completeFullOnboardingViaEmail(page, scannerEmail, 'Return Full Onboarding Scanner');

		// "How it works" never promises an auto-accept — confirm state, with
		// the resume banner and a plain "Accept" button, still pending.
		await page.waitForURL(/\/accept\//, { timeout: 10_000 });
		await expect(page.getByText(/Last step/)).toBeVisible();
		await expect(page.getByRole('button', { name: 'Accept' })).toBeVisible();

		// Confirm it really is still pending, not a race that already
		// auto-settled: reloading must show the same confirm state again.
		await page.reload();
		await expect(page.getByRole('button', { name: 'Accept' })).toBeVisible();
	});

	test('Given a QR, when it expires between starting onboarding and returning, then the accept page shows the expired-during-onboarding message', async ({
		secondContext,
		email,
		testUser
	}) => {
		const creator = await testUser({ displayName: CREATOR_NAME });
		const { token } = await createPendingQr(creator.appUserId, CREATOR_NAME, {
			direction: 'send',
			amount: 200
		});
		const scannerEmail = email('expiring-scanner');

		const page = await secondContext.newPage();
		await goto(page, `/accept/${token}`);

		const fastCta = page.getByRole('button', {
			name: new RegExp(`Accept .* from ${CREATOR_NAME}`)
		});
		await fastCta.click();
		await page.waitForURL(/\/onboarding\/phone/);

		// The QR expires here — after the accept-intent cookie was set
		// (using the QR's real, still-future expiry), but before the scanner
		// finishes signing up.
		expirePendingQr(token);

		await page.getByRole('button', { name: /continue with email/i }).click();
		await page.waitForURL(/\/onboarding\/email/);
		await page.locator('input[type="email"]').fill(scannerEmail);
		await page.getByRole('button', { name: /send code/i }).click();

		await page.waitForURL(/\/onboarding\/otp/);
		const otp = await getOTP(scannerEmail);
		await page.locator('input[inputmode="numeric"]').pressSequentially(otp);

		await page.waitForURL(/\/onboarding\/verified/, { timeout: 10_000 });
		await page.getByRole('button', { name: /continue/i }).click();

		await page.waitForURL(/\/onboarding\/name/, { timeout: 10_000 });
		await page.locator('input[name="displayName"]').fill('Return Expiring Scanner');
		await page.getByRole('button', { name: /enter the community/i }).click();

		await page.waitForURL(/\/accept\//, { timeout: 10_000 });
		await expect(
			page.getByText(new RegExp(`This QR from ${CREATOR_NAME} expired before you finished`))
		).toBeVisible();
		await expect(page.getByRole('button', { name: /back to home/i })).toBeVisible();
	});

	test('Given a send QR, when the creator signs in from their own link, then the accept page says it is their own QR and nothing happened', async ({
		secondContext,
		testUser
	}) => {
		const creator = await testUser({ displayName: CREATOR_NAME });
		const { token } = await createPendingQr(creator.appUserId, CREATOR_NAME, {
			direction: 'send',
			amount: 500
		});

		const page = await secondContext.newPage();
		await goto(page, `/accept/${token}`);

		const fastCta = page.getByRole('button', {
			name: new RegExp(`Accept .* from ${CREATOR_NAME}`)
		});
		await fastCta.click();
		await page.waitForURL(/\/onboarding\/phone/);
		await page.getByRole('button', { name: /continue with email/i }).click();

		await page.waitForURL(/\/onboarding\/email/);
		await page.locator('input[type="email"]').fill(creator.email);
		await page.getByRole('button', { name: /send code/i }).click();

		await page.waitForURL(/\/onboarding\/otp/);
		const otp = await getOTP(creator.email);
		await page.locator('input[inputmode="numeric"]').pressSequentially(otp);

		// The creator already has an app_users row, so the onboarding layout
		// sends them straight back to their own link — where self-acceptance
		// is blocked and the "expired" ⏱ view is deliberately NOT shown.
		await page.waitForURL(/\/accept\//, { timeout: 10_000 });
		await expect(page.getByText('This is your own QR, so nothing happened.')).toBeVisible();
		await expect(page.getByRole('button', { name: /back to home/i })).toBeVisible();
	});
});
