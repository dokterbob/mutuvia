import { test, expect } from '@playwright/test';
import { goto } from './test-utils';

test.describe('PhoneInput', () => {
	test.beforeEach(async ({ page }) => {
		await goto(page, '/onboarding/phone');
	});

	test('initial render — tel input visible, or-divider visible, submit disabled', async ({
		page
	}) => {
		await expect(page.locator('input[type="tel"]')).toBeVisible();
		await expect(page.getByText('or', { exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Continue with email instead' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Send code' })).toBeDisabled();
	});

	test('country selector opens popover with searchable list', async ({ page }) => {
		await page.locator('button.rounded-l-lg').click();
		// Wait for portal-rendered popover content to mount
		await expect(page.getByPlaceholder('Search country...')).toBeVisible();
		await expect(page.getByRole('option', { name: /Portugal/ })).toBeVisible();
	});

	test('search filters country list', async ({ page }) => {
		await page.locator('button.rounded-l-lg').click();
		await expect(page.getByPlaceholder('Search country...')).toBeVisible();
		await page.getByPlaceholder('Search country...').fill('nether');
		await expect(page.getByRole('option', { name: /Netherlands \(Nederland\)/ })).toBeVisible();
		await expect(page.getByRole('option', { name: /Portugal/ })).not.toBeVisible();
	});

	test('selecting country closes popover', async ({ page }) => {
		await page.locator('button.rounded-l-lg').click();
		await expect(page.getByPlaceholder('Search country...')).toBeVisible();
		await page.getByPlaceholder('Search country...').fill('nether');
		await page.getByRole('option', { name: /Netherlands \(Nederland\)/ }).click();
		await expect(page.getByPlaceholder('Search country...')).not.toBeVisible();
	});

	test('valid PT number enables submit and hides or-divider', async ({ page }) => {
		await page.locator('input[type="tel"]').fill('912345678');
		await expect(page.getByRole('button', { name: 'Send code' })).toBeEnabled();
		await expect(page.getByText('or', { exact: true })).not.toBeVisible();
		await expect(
			page.getByRole('button', { name: 'Continue with email instead' })
		).not.toBeVisible();
	});

	test('partial number keeps submit disabled', async ({ page }) => {
		await page.locator('input[type="tel"]').fill('123');
		await expect(page.getByRole('button', { name: 'Send code' })).toBeDisabled();
	});

	test('valid NL number enables submit after country switch', async ({ page }) => {
		const countryBtn = page.locator('button.rounded-l-lg');
		await countryBtn.click();
		await page.getByPlaceholder('Search country...').fill('nether');
		await page.getByRole('option', { name: /Netherlands \(Nederland\)/ }).click();
		await page.locator('input[type="tel"]').fill('612345678');
		await expect(page.getByRole('button', { name: 'Send code' })).toBeEnabled();
	});
});
