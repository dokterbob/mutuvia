import { expect, type BrowserContext } from '@playwright/test';
import { test, goto, setupAuthenticatedUser, createPendingQr, getAppUserId } from './test-utils.js';
import { sqlite } from './auth.js';

test.describe.serial('Pending item navigation', () => {
	let userStorage: Awaited<ReturnType<BrowserContext['storageState']>>;
	let betterAuthUserId: string;

	test.beforeAll(async ({ browser, email }, testInfo) => {
		const baseURL = testInfo.project.use.baseURL!;
		const ctx = await browser.newContext({ baseURL });
		betterAuthUserId = await setupAuthenticatedUser(ctx, email('user'), 'Test User');
		userStorage = await ctx.storageState();
		await ctx.close();
	});

	test('home screen — pending send row navigates to /send detail page', async ({
		browser
	}, testInfo) => {
		const baseURL = testInfo.project.use.baseURL!;
		const appUserId = getAppUserId(betterAuthUserId);
		const { qrId } = await createPendingQr(appUserId, 'Test User');

		const ctx = await browser.newContext({ storageState: userStorage, baseURL });
		const page = await ctx.newPage();

		try {
			await goto(page, '/home');

			// The pending send row is a link showing "Sending €5.00" (or equivalent)
			const pendingLink = page.getByRole('link', { name: /Sending/ });
			await expect(pendingLink).toBeVisible({ timeout: 10_000 });
			await pendingLink.click();

			// Should navigate to /send?qrId=<qrId>
			await expect(page).toHaveURL(new RegExp(`/send\\?qrId=${qrId}`), { timeout: 10_000 });

			// QR step is visible: expiry countdown text is rendered
			await expect(page.getByText(/Expires/)).toBeVisible({ timeout: 10_000 });
		} finally {
			// Clean up the pending QR so it doesn't leak into other tests
			sqlite.prepare(`DELETE FROM pending_qr WHERE id = ?`).run(qrId);
			await ctx.close();
		}
	});

	test('history screen — pending receive row navigates to /receive detail page', async ({
		browser
	}, testInfo) => {
		const baseURL = testInfo.project.use.baseURL!;
		const appUserId = getAppUserId(betterAuthUserId);

		// createPendingQr only supports direction='send', so insert receive direction directly
		const qrId = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);
		sqlite
			.prepare(
				`INSERT INTO pending_qr (id, initiating_user_id, direction, amount, status, created_at, expires_at)
				 VALUES (?, ?, 'receive', 750, 'pending', ?, ?)`
			)
			.run(qrId, appUserId, now, now + 600);

		const ctx = await browser.newContext({ storageState: userStorage, baseURL });
		const page = await ctx.newPage();

		try {
			await goto(page, '/history');

			// Switch to the Pending tab
			await page.getByRole('button', { name: 'Pending' }).click();

			// The pending receive row is a link showing "Requesting €7.50" (or equivalent)
			const pendingLink = page.getByRole('link', { name: /Requesting/ });
			await expect(pendingLink).toBeVisible({ timeout: 10_000 });
			await pendingLink.click();

			// Should navigate to /receive?qrId=<qrId>
			await expect(page).toHaveURL(new RegExp(`/receive\\?qrId=${qrId}`), { timeout: 10_000 });

			// QR step is visible: expiry countdown text is rendered
			await expect(page.getByText(/Expires/)).toBeVisible({ timeout: 10_000 });
		} finally {
			// Clean up the pending QR so it doesn't leak into other tests
			sqlite.prepare(`DELETE FROM pending_qr WHERE id = ?`).run(qrId);
			await ctx.close();
		}
	});
});
