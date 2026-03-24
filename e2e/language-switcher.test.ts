import { test, expect } from '@playwright/test';
import { goto } from './test-utils';

test.describe('LanguageSwitcher', () => {
	test.beforeEach(async ({ page }) => {
		await goto(page, '/onboarding/consent');
	});

	test('renders trigger button', async ({ page }) => {
		await expect(page.getByRole('button', { name: 'Change language' })).toBeVisible();
	});

	test('opens dropdown with all 3 languages', async ({ page }) => {
		await page.getByRole('button', { name: 'Change language' }).click();
		// Wait for portal-rendered menu to mount before asserting on items
		await expect(page.getByRole('menu')).toBeVisible();
		await expect(page.getByRole('menuitemradio', { name: 'English' })).toBeVisible();
		await expect(page.getByRole('menuitemradio', { name: 'Português' })).toBeVisible();
		await expect(page.getByRole('menuitemradio', { name: 'Nederlands' })).toBeVisible();
	});

	test('switching to Portuguese updates page text', async ({ page }) => {
		await page.getByRole('button', { name: 'Change language' }).click();
		await expect(page.getByRole('menu')).toBeVisible();
		await page.getByRole('menuitemradio', { name: 'Português' }).click();
		await expect(page.getByRole('button', { name: 'Compreendo, continuar' })).toBeVisible();
		await expect(page.getByText('O que estás a aceitar')).toBeVisible();
	});

	test('switching to Dutch updates page text', async ({ page }) => {
		await page.getByRole('button', { name: 'Change language' }).click();
		await expect(page.getByRole('menu')).toBeVisible();
		await page.getByRole('menuitemradio', { name: 'Nederlands' }).click();
		await expect(page.getByRole('button', { name: 'Ik begrijp het, doorgaan' })).toBeVisible();
		await expect(page.getByText('Waar je mee akkoord gaat')).toBeVisible();
	});

	test('dropdown closes after selection', async ({ page }) => {
		await page.getByRole('button', { name: 'Change language' }).click();
		await expect(page.getByRole('menu')).toBeVisible();
		await page.getByRole('menuitemradio', { name: 'English' }).click();
		await expect(page.getByRole('menuitemradio', { name: 'English' })).not.toBeVisible();
	});
});
