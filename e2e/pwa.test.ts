import { test, expect } from '@playwright/test';
import { goto } from './test-utils.js';

test.describe('PWA head tags', () => {
	// Use /faq — it is public and renders the full SvelteKit layout without
	// redirecting. The root / route redirects unauthenticated visitors to
	// /onboarding, which would leave the head populated by the redirect target.
	test.beforeEach(async ({ page }) => {
		await goto(page, '/faq');
	});

	test('manifest link is present', async ({ page }) => {
		const manifest = page.locator('link[rel="manifest"]');
		await expect(manifest).toHaveAttribute('href', '/manifest.webmanifest');
	});

	test('theme-color meta is present', async ({ page }) => {
		const themeColor = page.locator('meta[name="theme-color"]');
		await expect(themeColor).toHaveAttribute('content', '#2D4A32');
	});

	test('apple-touch-icon link is present', async ({ page }) => {
		// Playwright resolves relative href values to absolute URLs, so match
		// on the path suffix rather than the literal attribute value.
		const appleTouchIcon = page.locator('link[rel="apple-touch-icon"]');
		const href = await appleTouchIcon.getAttribute('href');
		expect(href).toContain('/apple-touch-icon-180x180.png');
	});
});

test.describe('PWA manifest content', () => {
	let manifest: Record<string, unknown>;

	test.beforeEach(async ({ request }) => {
		const response = await request.get('/manifest.webmanifest');
		expect(response.status()).toBe(200);
		manifest = await response.json();
	});

	test('manifest returns 200 with correct JSON fields', async () => {
		expect(manifest.name).toBe('Mutuvia');
		expect(manifest.short_name).toBe('Mutuvia');
		expect(manifest.display).toBe('standalone');
		expect(manifest.theme_color).toBe('#2D4A32');
		expect(manifest.background_color).toBe('#ffffff');
		expect(manifest.start_url).toBe('/');
		expect(manifest.id).toBe('/');
	});

	test('manifest includes screenshots for both form factors', async () => {
		const screenshots = manifest.screenshots as { src: string; form_factor?: string }[];
		expect(Array.isArray(screenshots)).toBe(true);
		expect(screenshots.some((s) => s.form_factor === 'wide')).toBe(true);
		expect(screenshots.some((s) => s.form_factor === 'narrow')).toBe(true);
	});

	test('manifest icons array has at least 3 entries', async () => {
		expect(Array.isArray(manifest.icons)).toBe(true);
		expect((manifest.icons as unknown[]).length).toBeGreaterThanOrEqual(3);
	});
});

test.describe('Offline fallback page', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/offline.html');
	});

	test('shows "You\'re offline" heading', async ({ page }) => {
		await expect(page.getByRole('heading', { name: "You're offline" })).toBeVisible();
	});

	test('shows "Try again" button', async ({ page }) => {
		await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
	});
});

test.describe('PWA offline behaviour', () => {
	test('serves offline.html via SW when navigating offline', async ({ page, context }) => {
		// SW precache downloads ~100 assets on first install; give it plenty of time.
		test.setTimeout(120_000);

		// Trigger SW install and clientsClaim by navigating once while online.
		await goto(page, '/faq');

		// Wait for the SW to be fully activated and in control of the page.
		// navigator.serviceWorker.ready only resolves when the SW is installed, not
		// necessarily when it is *controlling* the page. Checking controller !== null
		// confirms clientsClaim() has run and the SW will intercept navigations.
		await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
			timeout: 110_000
		});

		await context.setOffline(true);
		try {
			// Use plain page.goto — the offline fallback has no Svelte hydration,
			// so the goto helper's body.hydrated wait would time out.
			await page.goto('/faq');

			await expect(page.getByRole('heading', { name: "You're offline" })).toBeVisible();
			await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
		} finally {
			await context.setOffline(false);
		}
	});
});
