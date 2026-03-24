import { test, expect } from '@playwright/test';

const smokeChecks = [
	{ url: '/onboarding', desc: 'globe icon on language switcher, ArrowRight on CTA' },
	{ url: '/onboarding/consent', desc: 'ArrowRight/ArrowLeft on buttons' },
	{ url: '/onboarding/phone', desc: 'ChevronsUpDown on country selector, ArrowRight on submit' },
	{ url: '/onboarding/verified', desc: 'CheckIcon in green circle' }
];

test.describe('Icon smoke tests', () => {
	for (const { url, desc } of smokeChecks) {
		test(`SVG icons render on ${url} — ${desc}`, async ({ page }) => {
			await page.goto(url);
			await expect(page.locator('svg').first()).toBeVisible();
		});
	}
});
