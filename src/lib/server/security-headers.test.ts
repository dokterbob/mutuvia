// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, test } from 'vitest';
import { applySecurityHeaders, buildSecurityHeaders, isSensitivePath } from './security-headers';

const BASE_INPUT = {
	pathname: '/home',
	isHttps: true,
	authenticated: false,
	hasCacheControl: false,
	hstsMaxAgeSeconds: 15552000,
	hstsIncludeSubdomains: false
};

describe('isSensitivePath', () => {
	test.each([
		['/accept/abc123', true],
		['/accept/', true],
		['/send/xyz', true],
		['/home', false],
		['/acceptance', false], // must not match on a mere prefix of the word
		['/sender', false]
	])('isSensitivePath(%s) -> %s', (pathname, expected) => {
		expect(isSensitivePath(pathname)).toBe(expected);
	});
});

describe('buildSecurityHeaders', () => {
	test('always sets nosniff, no-referrer, permissions-policy, X-Frame-Options and COOP', () => {
		const headers = buildSecurityHeaders(BASE_INPUT);

		expect(headers['x-content-type-options']).toBe('nosniff');
		expect(headers['referrer-policy']).toBe('no-referrer');
		expect(headers['permissions-policy']).toBe('camera=(self), geolocation=(), microphone=()');
		expect(headers['x-frame-options']).toBe('DENY');
		expect(headers['cross-origin-opener-policy']).toBe('same-origin');
	});

	describe('Strict-Transport-Security', () => {
		test('is set over https', () => {
			const headers = buildSecurityHeaders({ ...BASE_INPUT, isHttps: true });
			expect(headers['strict-transport-security']).toBe('max-age=15552000');
		});

		test('is omitted over plain http', () => {
			const headers = buildSecurityHeaders({ ...BASE_INPUT, isHttps: false });
			expect(headers['strict-transport-security']).toBeUndefined();
		});

		test('appends includeSubDomains when configured', () => {
			const headers = buildSecurityHeaders({ ...BASE_INPUT, hstsIncludeSubdomains: true });
			expect(headers['strict-transport-security']).toBe('max-age=15552000; includeSubDomains');
		});
	});

	describe('X-Robots-Tag', () => {
		test.each(['/accept/abc123', '/send/xyz'])('is set for sensitive path %s', (pathname) => {
			const headers = buildSecurityHeaders({ ...BASE_INPUT, pathname });
			expect(headers['x-robots-tag']).toBe('noindex, nofollow');
		});

		test('is omitted for a non-sensitive path', () => {
			const headers = buildSecurityHeaders({ ...BASE_INPUT, pathname: '/home' });
			expect(headers['x-robots-tag']).toBeUndefined();
		});
	});

	describe('Cache-Control', () => {
		test('is omitted for an unauthenticated, non-sensitive, cache-control-free response', () => {
			const headers = buildSecurityHeaders(BASE_INPUT);
			expect(headers['cache-control']).toBeUndefined();
		});

		test('is set to private, no-store for an authenticated response', () => {
			const headers = buildSecurityHeaders({ ...BASE_INPUT, authenticated: true });
			expect(headers['cache-control']).toBe('private, no-store');
		});

		test.each(['/accept/abc123', '/send/xyz'])(
			'is set to private, no-store for sensitive path %s even when unauthenticated',
			(pathname) => {
				const headers = buildSecurityHeaders({ ...BASE_INPUT, pathname });
				expect(headers['cache-control']).toBe('private, no-store');
			}
		);

		test('is never set when the response already has its own Cache-Control', () => {
			const headers = buildSecurityHeaders({
				...BASE_INPUT,
				authenticated: true,
				pathname: '/accept/abc123',
				hasCacheControl: true
			});
			expect(headers['cache-control']).toBeUndefined();
		});
	});
});

describe('applySecurityHeaders', () => {
	test('mutates the given Response and respects its existing Cache-Control', () => {
		const response = new Response('ok', { headers: { 'cache-control': 'public, max-age=3600' } });

		applySecurityHeaders(response, {
			pathname: '/accept/abc123',
			isHttps: true,
			authenticated: true,
			hstsMaxAgeSeconds: 15552000,
			hstsIncludeSubdomains: false
		});

		expect(response.headers.get('cache-control')).toBe('public, max-age=3600');
		expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
		expect(response.headers.get('x-content-type-options')).toBe('nosniff');
	});

	test('does not consume or replace a streaming response body', async () => {
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new TextEncoder().encode('chunk'));
				controller.close();
			}
		});
		const response = new Response(stream);

		applySecurityHeaders(response, {
			pathname: '/api/events',
			isHttps: true,
			authenticated: true,
			hstsMaxAgeSeconds: 15552000,
			hstsIncludeSubdomains: false
		});

		expect(response.headers.get('cache-control')).toBe('private, no-store');
		const text = await response.text();
		expect(text).toBe('chunk');
	});
});
