import { test, expect, type BrowserContext } from '@playwright/test';
import { goto, setupAuthenticatedUser } from './test-utils.js';

const TEST_EMAIL = 'e2e-copy-button@test.example';
const TEST_NAME = 'Copy Tester';

test.describe.serial('CopyButton', () => {
	let userStorage: Awaited<ReturnType<BrowserContext['storageState']>>;

	test.beforeAll(async ({ browser }, testInfo) => {
		const baseURL = testInfo.project.use.baseURL!;
		const ctx = await browser.newContext({ baseURL });
		await setupAuthenticatedUser(ctx, TEST_EMAIL, TEST_NAME);
		userStorage = await ctx.storageState();
		await ctx.close();
	});

	test('CopyButton visible after generating QR on /send', async ({ browser }, testInfo) => {
		const baseURL = testInfo.project.use.baseURL!;
		const ctx = await browser.newContext({ storageState: userStorage, baseURL });
		const page = await ctx.newPage();

		try {
			await goto(page, '/send');

			const consentBtn = page.getByRole('button', { name: "I understand, let's go" });
			if (await consentBtn.isVisible()) {
				await consentBtn.click();
			}

			await page.locator('input[name="amount"]').fill('10');
			await page.getByRole('button', { name: 'Generate QR' }).click();

			await expect(page.getByText(/\/accept\//)).toBeVisible({ timeout: 10_000 });
			await expect(page.getByRole('button', { name: /copy link/i })).toBeVisible();
		} finally {
			await ctx.close();
		}
	});

	test('clicking CopyButton shows copied state briefly', async ({ browser }, testInfo) => {
		const baseURL = testInfo.project.use.baseURL!;
		const ctx = await browser.newContext({ storageState: userStorage, baseURL });
		const page = await ctx.newPage();

		try {
			await goto(page, '/send');

			const consentBtn = page.getByRole('button', { name: "I understand, let's go" });
			if (await consentBtn.isVisible()) {
				await consentBtn.click();
			}

			await page.locator('input[name="amount"]').fill('10');
			await page.getByRole('button', { name: 'Generate QR' }).click();

			await expect(page.getByText(/\/accept\//)).toBeVisible({ timeout: 10_000 });

			const copyBtn = page.getByRole('button', { name: /copy link/i });
			await copyBtn.click();
			// UseClipboard sets status='success' → sr-only text changes to "Copied"
			await expect(copyBtn.locator('.sr-only')).toHaveText('Copied');
			// After animationDuration (~500ms) reverts
			await page.waitForTimeout(700);
			await expect(copyBtn.locator('.sr-only')).toHaveText('Copy');
		} finally {
			await ctx.close();
		}
	});

	test('CopyButton visible on /receive after generating QR', async ({ browser }, testInfo) => {
		const baseURL = testInfo.project.use.baseURL!;
		const ctx = await browser.newContext({ storageState: userStorage, baseURL });
		const page = await ctx.newPage();

		try {
			await goto(page, '/receive');

			await page.locator('input[name="amount"]').fill('5');
			await page.getByRole('button', { name: 'Generate QR' }).click();

			await expect(page.getByText(/\/accept\//)).toBeVisible({ timeout: 10_000 });
			await expect(page.getByRole('button', { name: /copy link/i })).toBeVisible();
		} finally {
			await ctx.close();
		}
	});
});
