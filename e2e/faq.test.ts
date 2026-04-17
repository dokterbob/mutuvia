import { expect } from '@playwright/test';
import { test, goto } from './test-utils.js';

const FAQ_NAME = 'FAQ User';

// FAQ page is public — no auth required.
// Hamburger menu tests require auth to reach the home screen.
test.describe('FAQ page (public)', () => {
	test.beforeEach(async ({ page }) => {
		await goto(page, '/faq');
	});

	test('renders the FAQ title', async ({ page }) => {
		await expect(page.getByRole('heading', { name: 'Frequently Asked Questions' })).toBeVisible();
	});

	test('renders all accordion trigger buttons', async ({ page }) => {
		await expect(page.getByRole('button', { name: 'What is mutual credit?' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Is this real money?' })).toBeVisible();
		await expect(page.getByRole('button', { name: /negative balance/i })).toBeVisible();
		await expect(page.getByRole('button', { name: /does not give back/i })).toBeVisible();
		await expect(page.getByRole('button', { name: /who can see/i })).toBeVisible();
		await expect(page.getByRole('button', { name: /how do I send/i })).toBeVisible();
		await expect(page.getByRole('button', { name: /note field/i })).toBeVisible();
		await expect(page.getByRole('button', { name: /can I trust/i })).toBeVisible();
		await expect(page.getByRole('button', { name: /open source/i })).toBeVisible();
		await expect(page.getByRole('button', { name: /who made this/i })).toBeVisible();
		await expect(page.getByRole('button', { name: /not answered/i })).toBeVisible();
	});

	test('clicking a trigger reveals its answer', async ({ page }) => {
		await page.getByRole('button', { name: 'What is mutual credit?' }).click();
		await expect(page.getByText(/shared record of who owes what/i)).toBeVisible();
	});

	test('single mode: opening second item closes the first', async ({ page }) => {
		await page.getByRole('button', { name: 'What is mutual credit?' }).click();
		await expect(page.getByText(/shared record of who owes what/i)).toBeVisible();

		await page.getByRole('button', { name: 'Is this real money?' }).click();
		await expect(page.getByText(/shared notebook where we keep track of favours/i)).toBeVisible();
		await expect(page.getByText(/shared record of who owes what/i)).not.toBeVisible();
	});

	test('renders translated FAQ title in Portuguese', async ({ page }) => {
		// Set locale cookie directly to avoid needing the settings UI
		await page
			.context()
			.addCookies([{ name: 'PARAGLIDE_LOCALE', value: 'pt', domain: 'localhost', path: '/' }]);
		await goto(page, '/faq');
		await expect(page.getByRole('heading', { name: 'Perguntas Frequentes' })).toBeVisible();
	});

	test('renders translated FAQ title in Dutch', async ({ page }) => {
		await page
			.context()
			.addCookies([{ name: 'PARAGLIDE_LOCALE', value: 'nl', domain: 'localhost', path: '/' }]);
		await goto(page, '/faq');
		await expect(page.getByRole('heading', { name: 'Veelgestelde vragen' })).toBeVisible();
	});
});

test.describe('FAQ hamburger menu (authenticated)', () => {
	test.describe('menu navigation', () => {
		test('hamburger menu shows all items', async ({ withAuth }) => {
			const { context } = await withAuth({ displayName: FAQ_NAME });
			const page = await context.newPage();
			await goto(page, '/home');
			await page.getByRole('button', { name: /menu/i }).click();
			await expect(page.getByRole('menu')).toBeVisible();
			await expect(page.getByRole('menuitem', { name: /settings/i })).toBeVisible();
			await expect(page.getByRole('menuitem', { name: /faq/i })).toBeVisible();
			await expect(page.getByRole('menuitem', { name: /how it works/i })).toBeVisible();
			await expect(page.getByRole('menuitem', { name: /about/i })).toBeVisible();
			await expect(page.getByRole('link', { name: /open source/i })).toBeVisible();
			await expect(page.getByRole('menuitem', { name: /sign out/i })).toBeVisible();
		});

		test('Settings menu item navigates to /settings', async ({ withAuth }) => {
			const { context } = await withAuth({ displayName: FAQ_NAME });
			const page = await context.newPage();
			await goto(page, '/home');
			await page.getByRole('button', { name: /menu/i }).click();
			await expect(page.getByRole('menu')).toBeVisible();
			await page.getByRole('menuitem', { name: /settings/i }).click();
			await expect(page).toHaveURL(/\/settings/);
		});

		test('FAQ menu item navigates to /faq', async ({ withAuth }) => {
			const { context } = await withAuth({ displayName: FAQ_NAME });
			const page = await context.newPage();
			await goto(page, '/home');
			await page.getByRole('button', { name: /menu/i }).click();
			await expect(page.getByRole('menu')).toBeVisible();
			await page.getByRole('menuitem', { name: /faq/i }).click();
			await expect(page).toHaveURL(/\/faq/);
		});

		test('How it works navigates to /onboarding/intro1?review', async ({ withAuth }) => {
			const { context } = await withAuth({ displayName: FAQ_NAME });
			const page = await context.newPage();
			await goto(page, '/home');
			await page.getByRole('button', { name: /menu/i }).click();
			await expect(page.getByRole('menu')).toBeVisible();
			await page.getByRole('menuitem', { name: /how it works/i }).click();
			await expect(page).toHaveURL(/\/onboarding\/intro1/);
		});

		test('About navigates to /about', async ({ withAuth }) => {
			const { context } = await withAuth({ displayName: FAQ_NAME });
			const page = await context.newPage();
			await goto(page, '/home');
			await page.getByRole('button', { name: /menu/i }).click();
			await expect(page.getByRole('menu')).toBeVisible();
			await page.getByRole('menuitem', { name: /about/i }).click();
			await expect(page).toHaveURL(/\/about/);
		});
	});

	test('Sign out navigates to /onboarding', async ({ withAuth }) => {
		const { context } = await withAuth({ displayName: 'FAQ Signout User' });
		const page = await context.newPage();
		await goto(page, '/home');
		await page.getByRole('button', { name: /menu/i }).click();
		await expect(page.getByRole('menu')).toBeVisible();
		await page.getByRole('menuitem', { name: /sign out/i }).click();
		await expect(page).toHaveURL(/\/onboarding/);
	});
});
