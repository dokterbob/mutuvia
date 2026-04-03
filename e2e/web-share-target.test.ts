import { test, expect } from '@playwright/test';
import { E2E_BASE_URL } from './config.js';

test.describe('Web Share Target', () => {
	test('manifest contains share_target', async ({ request }) => {
		const response = await request.get('/manifest.webmanifest');
		expect(response.status()).toBe(200);

		const manifest = await response.json();
		expect(manifest.share_target).toBeDefined();
		expect(manifest.share_target.action).toBe('/share');
		expect(manifest.share_target.method).toBe('POST');
		expect(manifest.share_target.enctype).toBe('multipart/form-data');
		expect(manifest.share_target.params).toEqual({ title: 'title', text: 'text', url: 'url' });
	});

	test('redirects to /accept/ when url param contains accept URL', async ({ request }) => {
		const response = await request.post('/share', {
			multipart: { url: 'https://app.mutuvia.com/accept/test-token-123' },
			headers: { origin: E2E_BASE_URL },
			maxRedirects: 0
		});
		expect(response.status()).toBe(303);
		expect(response.headers()['location']).toBe('/accept/test-token-123');
	});

	test('redirects to /accept/ when text param contains embedded accept URL', async ({
		request
	}) => {
		const response = await request.post('/share', {
			multipart: { text: 'Check this: https://app.mutuvia.com/accept/token-in-text' },
			headers: { origin: E2E_BASE_URL },
			maxRedirects: 0
		});
		expect(response.status()).toBe(303);
		expect(response.headers()['location']).toBe('/accept/token-in-text');
	});

	test('redirects to / when no valid accept URL found', async ({ request }) => {
		const response = await request.post('/share', {
			multipart: { text: 'hello world' },
			headers: { origin: E2E_BASE_URL },
			maxRedirects: 0
		});
		expect(response.status()).toBe(303);
		expect(response.headers()['location']).toBe('/');
	});

	test('redirects to / when no params', async ({ request }) => {
		const response = await request.post('/share', {
			multipart: {},
			headers: { origin: E2E_BASE_URL },
			maxRedirects: 0
		});
		expect(response.status()).toBe(303);
		expect(response.headers()['location']).toBe('/');
	});
});
