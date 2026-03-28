// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect } from '@playwright/test';
import {
	test,
	goto,
	setupAuthenticatedUser,
	SENDER_EMAIL,
	SCANNER_EMAIL,
	createPendingQr,
	getAppUserId,
	getOTP,
	clearOTPs,
	deleteTestUser
} from './test-utils.js';

const SENDER_NAME = 'QR Sender';
const SCANNER_NAME = 'QR Scanner';

test.describe.serial('QR scan → onboarding → accept', () => {
	let senderAppUserId: string;

	test.beforeAll(async ({ browser }, testInfo) => {
		const baseURL = testInfo.project.use.baseURL!;
		const senderCtx = await browser.newContext({ baseURL });
		const senderBaUserId = await setupAuthenticatedUser(senderCtx, SENDER_EMAIL, SENDER_NAME);
		senderAppUserId = getAppUserId(senderBaUserId);
		await senderCtx.close();
	});

	test.beforeEach(() => {
		clearOTPs();
	});

	test.afterEach(async () => {
		await deleteTestUser(SCANNER_EMAIL);
	});

	test('unauthenticated scanner sees transaction info then completes fast-track onboarding', async ({
		secondContext
	}) => {
		// Create a pending QR from the sender
		const { token } = await createPendingQr(senderAppUserId, SENDER_NAME);
		const acceptPath = `/accept/${token}`;

		// Unauthenticated scanner opens the accept link
		const page = await secondContext.newPage();

		await goto(page, acceptPath);

		// Should see transaction info — not an immediate redirect to onboarding
		await expect(page.getByRole('heading', { level: 1 })).toContainText(
			`${SENDER_NAME} wants to send you`
		);

		// "Accept and sign in" button should be visible
		const fastCta = page.getByRole('button', { name: /accept and sign in/i });
		await expect(fastCta).toBeVisible();

		// Click it — should go to phone verification (fast track)
		await fastCta.click();
		await page.waitForURL(/\/onboarding\/phone/);

		// Switch to email for testability
		await page.getByRole('button', { name: /continue with email/i }).click();
		await page.waitForURL(/\/onboarding\/email/);
		await page.locator('input[type="email"]').fill(SCANNER_EMAIL);
		await page.getByRole('button', { name: /send code/i }).click();

		// OTP
		await page.waitForURL(/\/onboarding\/otp/);
		const otp = await getOTP(SCANNER_EMAIL);
		await page.locator('input[inputmode="numeric"]').pressSequentially(otp);

		// Verified — fast track skips the intro slides
		await page.waitForURL(/\/onboarding\/verified/, { timeout: 10_000 });
		await page.getByRole('button', { name: /continue/i }).click();

		// Should go directly to name (skipping intro1/intro2)
		await page.waitForURL(/\/onboarding\/name/, { timeout: 10_000 });
		await page.locator('input[name="displayName"]').fill(SCANNER_NAME);
		await page.getByRole('button', { name: /enter the community/i }).click();

		// KEY ASSERTION: should land back on the accept page, NOT /home
		await page.waitForURL(/\/accept\//, { timeout: 10_000 });

		// Now authenticated — should see the accept/decline UI
		await expect(page.getByRole('heading', { level: 1 })).toContainText(
			`${SENDER_NAME} wants to send you`
		);
		await expect(page.getByRole('button', { name: /^accept$/i })).toBeVisible();

		// Accept the transaction
		await page.getByRole('button', { name: /^accept$/i }).click();
		await expect(page).toHaveURL(/\/home/, { timeout: 10_000 });
	});
});
// Sender user is intentionally not cleaned up per-test — global setup deletes test.db on the next run.
