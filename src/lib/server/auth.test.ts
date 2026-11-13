// SPDX-License-Identifier: AGPL-3.0-or-later

// Regression test for a real production bug: an earlier version of auth.ts
// set `baseURL: config.appUrl` on the betterAuth() config. Better Auth's own
// route matcher (isAuthPath, in better-auth/dist/integrations/svelte-kit.mjs)
// 404s any /api/auth/* request whose origin doesn't match baseURL's origin —
// which broke every sign-in whenever the app was reached via a different
// host than APP_URL (direct port access, a LAN IP, or a proxy that doesn't
// preserve Host). This test exercises the real Better Auth route-matching
// mechanism against our actual `auth` instance, not a mock of it.

import { describe, test, expect, vi } from 'vitest';

vi.mock('$lib/server/db', () => ({ db: {}, sqlite: null }));
vi.mock('$lib/config', () => ({
	config: {
		dbProvider: 'sqlite',
		appUrl: 'https://mutuvia.example.com',
		preludeApiToken: '',
		devLogOtp: false
	}
}));
vi.mock('./mailer', () => ({ sendOtpEmail: vi.fn() }));
vi.mock('./sse-registry', () => ({ closeSession: vi.fn() }));

import { isAuthPath } from 'better-auth/svelte-kit';
import { auth } from './auth';

describe('auth route matching', () => {
	test('given a request whose origin differs from APP_URL, when matched against an auth route, then it is still recognized (no false 404)', () => {
		const requestUrl = 'http://localhost:15999/api/auth/email-otp/send-verification-otp';
		expect(isAuthPath(requestUrl, auth.options)).toBe(true);
	});

	test('given a request via a LAN IP, when matched against an auth route, then it is still recognized', () => {
		const requestUrl = 'http://192.168.1.50:5173/api/auth/sign-in/email-otp';
		expect(isAuthPath(requestUrl, auth.options)).toBe(true);
	});

	test('given a request for an unrelated path, when matched, then it is not treated as an auth route', () => {
		expect(isAuthPath('http://localhost:15999/home', auth.options)).toBe(false);
	});
});
