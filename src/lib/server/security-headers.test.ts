// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, test } from 'vitest';
import { applySecurityHeaders, buildSecurityHeaders, isSensitivePath } from './security-headers';

const BASE_INPUT = {
	pathname: '/home',
	isHttps: true,
	appUrlIsHttps: true,
	authenticated: false,
	hasCacheControl: false,
	setsCookie: false,
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
		test('is set when both the request and APP_URL are https', () => {
			const headers = buildSecurityHeaders({ ...BASE_INPUT, isHttps: true, appUrlIsHttps: true });
			expect(headers['strict-transport-security']).toBe('max-age=15552000');
		});

		test('is omitted when the request is seen as plain http', () => {
			const headers = buildSecurityHeaders({ ...BASE_INPUT, isHttps: false, appUrlIsHttps: true });
			expect(headers['strict-transport-security']).toBeUndefined();
		});

		// Regression (review round 1): svelte-adapter-bun's get_origin() (see
		// node_modules/svelte-adapter-bun/dist/files/handler.js) defaults a
		// request's protocol to 'https' whenever neither ORIGIN nor
		// PROTOCOL_HEADER is configured — so `isHttps` alone can be `true` on
		// an all-http deployment with no TLS anywhere. Requiring the
		// operator's OWN declared APP_URL to also be https is what actually
		// prevents HSTS on a plain-http deployment.
		test('is omitted when the request looks https but APP_URL itself is http (the adapter-default-guess case)', () => {
			const headers = buildSecurityHeaders({ ...BASE_INPUT, isHttps: true, appUrlIsHttps: false });
			expect(headers['strict-transport-security']).toBeUndefined();
		});

		test('is omitted when APP_URL is https but this specific request is not', () => {
			const headers = buildSecurityHeaders({ ...BASE_INPUT, isHttps: false, appUrlIsHttps: true });
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

		// Review round 1, finding 4: a response that CREATES a session (e.g.
		// POST /api/auth/sign-in/email-otp) is judged by the session that
		// existed BEFORE the request — so `authenticated` alone misses it.
		test.each([
			'/api/auth/sign-in/email-otp',
			'/api/auth/phone-number/verify',
			'/api/auth/sign-out'
		])(
			'is set to private, no-store for Better Auth path %s even when unauthenticated',
			(pathname) => {
				const headers = buildSecurityHeaders({ ...BASE_INPUT, pathname });
				expect(headers['cache-control']).toBe('private, no-store');
			}
		);

		test('is set to private, no-store for any response that sets a cookie, regardless of path', () => {
			const headers = buildSecurityHeaders({ ...BASE_INPUT, pathname: '/home', setsCookie: true });
			expect(headers['cache-control']).toBe('private, no-store');
		});

		test('is never set when the response already has its own Cache-Control', () => {
			const headers = buildSecurityHeaders({
				...BASE_INPUT,
				authenticated: true,
				pathname: '/accept/abc123',
				setsCookie: true,
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
			appUrlIsHttps: true,
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
			appUrlIsHttps: true,
			authenticated: true,
			hstsMaxAgeSeconds: 15552000,
			hstsIncludeSubdomains: false
		});

		expect(response.headers.get('cache-control')).toBe('private, no-store');
		const text = await response.text();
		expect(text).toBe('chunk');
	});

	test('detects a Set-Cookie header on the response and applies Cache-Control: private, no-store', () => {
		const response = new Response('ok', { headers: { 'set-cookie': 'session=abc; Path=/' } });

		applySecurityHeaders(response, {
			pathname: '/api/auth/sign-in/email-otp',
			isHttps: true,
			appUrlIsHttps: true,
			authenticated: false,
			hstsMaxAgeSeconds: 15552000,
			hstsIncludeSubdomains: false
		});

		expect(response.headers.get('cache-control')).toBe('private, no-store');
	});
});
