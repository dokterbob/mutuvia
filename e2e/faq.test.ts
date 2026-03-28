import { test, expect, type BrowserContext } from '@playwright/test';
import { goto, setupAuthenticatedUser } from './test-utils.js';

const FAQ_EMAIL = 'e2e-faq@test.example';
const FAQ_NAME = 'FAQ User';

test.describe('FAQ', () => {
	let storage: Awaited<ReturnType<BrowserContext['storageState']>>;

	test.beforeAll(async ({ browser }, testInfo) => {
		const baseURL = testInfo.project.use.baseURL!;
		const ctx = await browser.newContext({ baseURL });
		await setupAuthenticatedUser(ctx, FAQ_EMAIL, FAQ_NAME);
		storage = await ctx.storageState();
		await ctx.close();
	});

	test.describe('hamburger menu', () => {
		test('shows a menu button on the home screen', async ({ browser }, testInfo) => {
			const ctx = await browser.newContext({
				storageState: storage,
				baseURL: testInfo.project.use.baseURL!
			});
			const page = await ctx.newPage();
			try {
				await goto(page, '/home');
				// The hamburger trigger button should be visible
				await expect(page.getByRole('button', { name: /menu/i })).toBeVisible();
			} finally {
				await ctx.close();
			}
		});

		test('opens dropdown with Settings and FAQ items', async ({ browser }, testInfo) => {
			const ctx = await browser.newContext({
				storageState: storage,
				baseURL: testInfo.project.use.baseURL!
			});
			const page = await ctx.newPage();
			try {
				await goto(page, '/home');
				await page.getByRole('button', { name: /menu/i }).click();
				await expect(page.getByRole('menu')).toBeVisible();
				await expect(page.getByRole('menuitem', { name: /settings/i })).toBeVisible();
				await expect(page.getByRole('menuitem', { name: /faq/i })).toBeVisible();
			} finally {
				await ctx.close();
			}
		});

		test('Settings menu item navigates to /settings', async ({ browser }, testInfo) => {
			const ctx = await browser.newContext({
				storageState: storage,
				baseURL: testInfo.project.use.baseURL!
			});
			const page = await ctx.newPage();
			try {
				await goto(page, '/home');
				await page.getByRole('button', { name: /menu/i }).click();
				await expect(page.getByRole('menu')).toBeVisible();
				await page.getByRole('menuitem', { name: /settings/i }).click();
				await expect(page).toHaveURL(/\/settings/);
			} finally {
				await ctx.close();
			}
		});

		test('FAQ menu item navigates to /faq', async ({ browser }, testInfo) => {
			const ctx = await browser.newContext({
				storageState: storage,
				baseURL: testInfo.project.use.baseURL!
			});
			const page = await ctx.newPage();
			try {
				await goto(page, '/home');
				await page.getByRole('button', { name: /menu/i }).click();
				await expect(page.getByRole('menu')).toBeVisible();
				await page.getByRole('menuitem', { name: /faq/i }).click();
				await expect(page).toHaveURL(/\/faq/);
			} finally {
				await ctx.close();
			}
		});
	});

	test.describe('FAQ page', () => {
		test('renders the FAQ title', async ({ browser }, testInfo) => {
			const ctx = await browser.newContext({
				storageState: storage,
				baseURL: testInfo.project.use.baseURL!
			});
			const page = await ctx.newPage();
			try {
				await goto(page, '/faq');
				await expect(
					page.getByRole('heading', { name: 'Frequently Asked Questions' })
				).toBeVisible();
			} finally {
				await ctx.close();
			}
		});

		test('renders all accordion trigger buttons', async ({ browser }, testInfo) => {
			const ctx = await browser.newContext({
				storageState: storage,
				baseURL: testInfo.project.use.baseURL!
			});
			const page = await ctx.newPage();
			try {
				await goto(page, '/faq');
				await expect(page.getByRole('button', { name: 'What is mutual credit?' })).toBeVisible();
				await expect(page.getByRole('button', { name: 'Is this real money?' })).toBeVisible();
				await expect(page.getByRole('button', { name: /negative balance/i })).toBeVisible();
				await expect(
					page.getByRole('button', { name: /someone does not give back/i })
				).toBeVisible();
				await expect(page.getByRole('button', { name: /who can see/i })).toBeVisible();
				await expect(page.getByRole('button', { name: /how do I send/i })).toBeVisible();
				await expect(page.getByRole('button', { name: /note field/i })).toBeVisible();
				await expect(page.getByRole('button', { name: /can I trust/i })).toBeVisible();
				await expect(page.getByRole('button', { name: /open source/i })).toBeVisible();
				await expect(page.getByRole('button', { name: /who made this/i })).toBeVisible();
				await expect(page.getByRole('button', { name: /not answered/i })).toBeVisible();
			} finally {
				await ctx.close();
			}
		});

		test('clicking a trigger reveals its answer', async ({ browser }, testInfo) => {
			const ctx = await browser.newContext({
				storageState: storage,
				baseURL: testInfo.project.use.baseURL!
			});
			const page = await ctx.newPage();
			try {
				await goto(page, '/faq');
				await page.getByRole('button', { name: 'What is mutual credit?' }).click();
				await expect(page.getByText(/shared record of who owes what/i)).toBeVisible();
			} finally {
				await ctx.close();
			}
		});

		test('single mode: opening second item closes the first', async ({ browser }, testInfo) => {
			const ctx = await browser.newContext({
				storageState: storage,
				baseURL: testInfo.project.use.baseURL!
			});
			const page = await ctx.newPage();
			try {
				await goto(page, '/faq');
				await page.getByRole('button', { name: 'What is mutual credit?' }).click();
				await expect(page.getByText(/shared record of who owes what/i)).toBeVisible();

				await page.getByRole('button', { name: 'Is this real money?' }).click();
				await expect(
					page.getByText(/shared notebook where we keep track of favours/i)
				).toBeVisible();
				await expect(page.getByText(/shared record of who owes what/i)).not.toBeVisible();
			} finally {
				await ctx.close();
			}
		});

		test('back arrow returns to /home', async ({ browser }, testInfo) => {
			const ctx = await browser.newContext({
				storageState: storage,
				baseURL: testInfo.project.use.baseURL!
			});
			const page = await ctx.newPage();
			try {
				await goto(page, '/faq');
				await page.getByRole('button', { name: /back/i }).click();
				await expect(page).toHaveURL(/\/home/);
			} finally {
				await ctx.close();
			}
		});

		test('renders translated FAQ title in Portuguese', async ({ browser }, testInfo) => {
			const ctx = await browser.newContext({
				storageState: storage,
				baseURL: testInfo.project.use.baseURL!
			});
			const page = await ctx.newPage();
			try {
				await goto(page, '/faq');
				// Switch to Portuguese via the language switcher on the home page first
				await goto(page, '/home');
				await page.getByRole('button', { name: /menu/i }).click();
				await expect(page.getByRole('menu')).toBeVisible();
				// Navigate to FAQ in Portuguese by switching language via settings
				// (Use cookie-based locale approach: visit settings and change language)
				await page.getByRole('menuitem', { name: /settings/i }).click();
				await page.getByRole('button', { name: 'Change language' }).click();
				await expect(page.getByRole('menu')).toBeVisible();
				await page.getByRole('menuitemradio', { name: 'Português' }).click();
				await goto(page, '/faq');
				await expect(page.getByRole('heading', { name: 'Perguntas Frequentes' })).toBeVisible();
			} finally {
				await ctx.close();
			}
		});
	});
});
