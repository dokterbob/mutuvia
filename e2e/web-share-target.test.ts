import { test, expect } from '@playwright/test';

test.describe('Web Share Target', () => {
	test('manifest contains share_target', async ({ page }) => {
		const response = await page.request.get('/manifest.webmanifest');
		expect(response.status()).toBe(200);

		const manifest = await response.json();
		expect(manifest.share_target).toBeDefined();
		expect(manifest.share_target.action).toBe('/share');
		expect(manifest.share_target.method).toBe('POST');
		expect(manifest.share_target.enctype).toBe('multipart/form-data');
		expect(manifest.share_target.params).toEqual({ title: 'title', text: 'text', url: 'url' });
	});

	test('redirects to /accept/ when url param contains accept URL', async ({ page }) => {
		const response = await page.request.post('/share', {
			multipart: { url: 'https://app.mutuvia.com/accept/test-token-123' },
			maxRedirects: 0
		});
		expect(response.status()).toBe(303);
		expect(response.headers()['location']).toBe('/accept/test-token-123');
	});

	test('redirects to /accept/ when text param contains embedded accept URL', async ({ page }) => {
		const response = await page.request.post('/share', {
			multipart: { text: 'Check this: https://app.mutuvia.com/accept/token-in-text' },
			maxRedirects: 0
		});
		expect(response.status()).toBe(303);
		expect(response.headers()['location']).toBe('/accept/token-in-text');
	});

	test('redirects to / when no valid accept URL found', async ({ page }) => {
		const response = await page.request.post('/share', {
			multipart: { text: 'hello world' },
			maxRedirects: 0
		});
		expect(response.status()).toBe(303);
		expect(response.headers()['location']).toBe('/');
	});

	test('redirects to / when no params', async ({ page }) => {
		const response = await page.request.post('/share', { multipart: {}, maxRedirects: 0 });
		expect(response.status()).toBe(303);
		expect(response.headers()['location']).toBe('/');
	});
});
