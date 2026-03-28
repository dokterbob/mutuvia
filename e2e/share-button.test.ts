import { test, expect, type BrowserContext } from '@playwright/test';
import { goto, setupAuthenticatedUser } from './test-utils.js';

const TEST_EMAIL = 'e2e-share-button@test.example';
const TEST_NAME = 'Share Tester';

test.describe.serial('Share button', () => {
	let userStorage: Awaited<ReturnType<BrowserContext['storageState']>>;

	test.beforeAll(async ({ browser }, testInfo) => {
		const baseURL = testInfo.project.use.baseURL!;
		const ctx = await browser.newContext({ baseURL });
		await setupAuthenticatedUser(ctx, TEST_EMAIL, TEST_NAME);
		userStorage = await ctx.storageState();
		await ctx.close();
	});

	test('share button visible on /send QR step when navigator.share is available', async ({
		browser
	}, testInfo) => {
		const baseURL = testInfo.project.use.baseURL!;
		const ctx = await browser.newContext({
			storageState: userStorage,
			baseURL
		});
		// Mock navigator.share before any page load
		await ctx.addInitScript(() => {
			Object.defineProperty(navigator, 'share', {
				value: () => Promise.resolve(),
				writable: true,
				configurable: true
			});
		});
		const page = await ctx.newPage();

		try {
			await goto(page, '/send');

			// Skip consent step if present
			const consentBtn = page.getByRole('button', { name: "I understand, let's go" });
			if (await consentBtn.isVisible()) {
				await consentBtn.click();
			}

			await page.locator('input[name="amount"]').fill('5');
			await page.getByRole('button', { name: 'Generate QR' }).click();

			await expect(page.getByText(/\/accept\//)).toBeVisible({ timeout: 10_000 });
			await expect(page.getByRole('button', { name: /share/i })).toBeVisible();
		} finally {
			await ctx.close();
		}
	});

	test('share button visible on /receive QR step when navigator.share is available', async ({
		browser
	}, testInfo) => {
		const baseURL = testInfo.project.use.baseURL!;
		const ctx = await browser.newContext({
			storageState: userStorage,
			baseURL
		});
		await ctx.addInitScript(() => {
			Object.defineProperty(navigator, 'share', {
				value: () => Promise.resolve(),
				writable: true,
				configurable: true
			});
		});
		const page = await ctx.newPage();

		try {
			await goto(page, '/receive');

			await page.locator('input[name="amount"]').fill('5');
			await page.getByRole('button', { name: 'Generate QR' }).click();

			await expect(page.getByText(/\/accept\//)).toBeVisible({ timeout: 10_000 });
			await expect(page.getByRole('button', { name: /share/i })).toBeVisible();
		} finally {
			await ctx.close();
		}
	});

	test('share button hidden on /send QR step when navigator.share is unavailable', async ({
		browser
	}, testInfo) => {
		const baseURL = testInfo.project.use.baseURL!;
		const ctx = await browser.newContext({
			storageState: userStorage,
			baseURL
		});
		// Explicitly remove navigator.share
		await ctx.addInitScript(() => {
			Object.defineProperty(navigator, 'share', {
				value: undefined,
				writable: true,
				configurable: true
			});
		});
		const page = await ctx.newPage();

		try {
			await goto(page, '/send');

			const consentBtn = page.getByRole('button', { name: "I understand, let's go" });
			if (await consentBtn.isVisible()) {
				await consentBtn.click();
			}

			await page.locator('input[name="amount"]').fill('5');
			await page.getByRole('button', { name: 'Generate QR' }).click();

			await expect(page.getByText(/\/accept\//)).toBeVisible({ timeout: 10_000 });
			await expect(page.getByRole('button', { name: /share/i })).not.toBeVisible();
		} finally {
			await ctx.close();
		}
	});
});
