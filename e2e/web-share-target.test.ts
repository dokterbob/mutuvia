import { test, expect } from '@playwright/test';

test.describe('Web Share Target', () => {
	test('manifest contains share_target', async ({ page }) => {
		const response = await page.request.get('/manifest.webmanifest');
		expect(response.status()).toBe(200);

		const manifest = await response.json();
		expect(manifest.share_target).toBeDefined();
		expect(manifest.share_target.action).toBe('/share');
		expect(manifest.share_target.method).toBe('GET');
		expect(manifest.share_target.params).toEqual({ title: 'title', text: 'text', url: 'url' });
	});

	test('redirects to /accept/ when url param contains accept URL', async ({ page }) => {
		const params = new URLSearchParams({
			url: 'https://app.mutuvia.com/accept/test-token-123'
		});
		const response = await page.request.get(`/share?${params}`, { maxRedirects: 0 });
		expect(response.status()).toBe(307);
		expect(response.headers()['location']).toBe('/accept/test-token-123');
	});

	test('redirects to /accept/ when text param contains embedded accept URL', async ({ page }) => {
		const params = new URLSearchParams({
			text: 'Check this: https://app.mutuvia.com/accept/token-in-text'
		});
		const response = await page.request.get(`/share?${params}`, { maxRedirects: 0 });
		expect(response.status()).toBe(307);
		expect(response.headers()['location']).toBe('/accept/token-in-text');
	});

	test('redirects to / when no valid accept URL found', async ({ page }) => {
		const params = new URLSearchParams({ text: 'hello world' });
		const response = await page.request.get(`/share?${params}`, { maxRedirects: 0 });
		expect(response.status()).toBe(307);
		expect(response.headers()['location']).toBe('/');
	});

	test('redirects to / when no params', async ({ page }) => {
		const response = await page.request.get('/share', { maxRedirects: 0 });
		expect(response.status()).toBe(307);
		expect(response.headers()['location']).toBe('/');
	});
});
