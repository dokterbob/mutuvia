import { expect, type BrowserContext } from '@playwright/test';
import { test, goto, setupAuthenticatedUser } from './test-utils.js';

// These tests are skipped due to a Vite dev-server warm-up race: copy-button.test.ts
// sorts first alphabetically, so it runs before Vite finishes its initial
// dependency-optimisation reload. By that point better-sqlite3 (used by the
// test-side auth helper) hasn't finished setting up the schema, causing
// "no such table: user" errors. Later test files (send-receive, share-button)
// run after the server has stabilised and pass fine.
//
// Once the underlying timing issue is resolved (see #31), restore the full
// implementation (with setupAuthenticatedUser) and remove the skip.

test.describe.skip('CopyButton', () => {
	test.describe('on /send', () => {
		test.beforeEach(async ({ page }) => {
			await page.goto('/send');
			await page.locator('input[name="amount"]').fill('10');
			await page.getByRole('button', { name: 'Generate QR' }).click();
		});

		test('CopyButton visible after generating QR', async ({ page }) => {
			await expect(page.getByRole('button', { name: /copy link/i })).toBeVisible();
		});

		test('clicking CopyButton shows copied state briefly', async ({ page }) => {
			const copyBtn = page.getByRole('button', { name: /copy link/i });
			await copyBtn.click();
			await expect(copyBtn.locator('.sr-only')).toHaveText('Copied');
			await page.waitForTimeout(700);
			await expect(copyBtn.locator('.sr-only')).toHaveText('Copy');
		});
	});

	test('CopyButton visible on /receive after generating QR', async ({ page }) => {
		await page.goto('/receive');
		await page.locator('input[name="amount"]').fill('5');
		await page.getByRole('button', { name: 'Generate QR' }).click();
		await expect(page.getByRole('button', { name: /copy link/i })).toBeVisible();
	});
});

test.describe.serial('CopyButton clipboard content', () => {
	let storage: Awaited<ReturnType<BrowserContext['storageState']>>;

	test.beforeAll(async ({ browser, email }, testInfo) => {
		const baseURL = testInfo.project.use.baseURL!;
		const ctx = await browser.newContext({ baseURL });
		await setupAuthenticatedUser(ctx, email('user'), 'Copy Test User');
		storage = await ctx.storageState();
		await ctx.close();
	});

	test('Copy link on /receive copies only the QR URL', async ({ browser }, testInfo) => {
		const baseURL = testInfo.project.use.baseURL!;
		const ctx = await browser.newContext({
			storageState: storage,
			baseURL,
			permissions: ['clipboard-read', 'clipboard-write']
		});
		const page = await ctx.newPage();
		try {
			await goto(page, '/receive');
			await page.locator('input[name="amount"]').fill('5');
			await page.getByRole('button', { name: 'Generate QR' }).click();

			const urlText = page.getByText(/\/accept\//);
			await expect(urlText).toBeVisible({ timeout: 10_000 });
			const acceptUrl = (await urlText.textContent())!.trim();

			await page.getByRole('button', { name: /copy link/i }).click();
			const clipboard = await page.evaluate(() => navigator.clipboard.readText());

			expect(clipboard).toBe(acceptUrl);
		} finally {
			await ctx.close();
		}
	});

	test('Copy link on /send copies only the QR URL', async ({ browser }, testInfo) => {
		const baseURL = testInfo.project.use.baseURL!;
		const ctx = await browser.newContext({
			storageState: storage,
			baseURL,
			permissions: ['clipboard-read', 'clipboard-write']
		});
		const page = await ctx.newPage();
		try {
			await goto(page, '/send');
			await page.locator('input[name="amount"]').fill('10');
			await page.getByRole('button', { name: 'Generate QR' }).click();

			const urlText = page.getByText(/\/accept\//);
			await expect(urlText).toBeVisible({ timeout: 10_000 });
			const acceptUrl = (await urlText.textContent())!.trim();

			await page.getByRole('button', { name: /copy link/i }).click();
			const clipboard = await page.evaluate(() => navigator.clipboard.readText());

			expect(clipboard).toBe(acceptUrl);
		} finally {
			await ctx.close();
		}
	});
});
