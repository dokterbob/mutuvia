// SPDX-License-Identifier: AGPL-3.0-or-later

import { beforeEach, describe, expect, test, vi } from 'vitest';

const REQUEST_STATE_ERROR =
	'No request state found. Please make sure you are calling this function within a `runWithRequestState` callback.';

const { getSessionMock, svelteKitHandlerMock, configMock } = vi.hoisted(() => ({
	getSessionMock: vi.fn(),
	svelteKitHandlerMock: vi.fn(
		async (input: { event: unknown; resolve: (event: unknown) => Response | Promise<Response> }) =>
			input.resolve(input.event)
	),
	// Mutable (unlike the other mocks below) so tests can flip `appUrl` per
	// case — see the HSTS-vs-appUrl describe block, which needs both an
	// https and an http APP_URL.
	configMock: {
		dbProvider: 'sqlite',
		trustedIpHeader: 'x-mutuvia-client-ip',
		appUrl: 'https://example.test',
		hstsMaxAgeSeconds: 15552000,
		hstsIncludeSubdomains: false
	}
}));

vi.mock('@sentry/sveltekit', () => ({
	sentryHandle: () => async (input: { event: unknown; resolve: (event: unknown) => unknown }) =>
		input.resolve(input.event),
	handleErrorWithSentry: vi.fn()
}));

vi.mock('$lib/server/auth', () => ({
	auth: {
		api: {
			getSession: getSessionMock
		}
	}
}));

vi.mock('$lib/server/db', () => ({
	db: {
		select: () => ({
			from: () => ({
				where: () => ({
					// Default: no app_users row found
					limit: () => Promise.resolve([])
				})
			})
		})
	},
	sqlite: null
}));

vi.mock('$lib/server/schema', () => ({
	appUsers: {}
}));

vi.mock('drizzle-orm', () => ({
	eq: vi.fn()
}));

vi.mock('$lib/config', () => ({
	config: configMock
}));

vi.mock('$lib/paraglide/server', () => ({
	paraglideMiddleware: (request: Request, cb: ({ locale }: { locale: string }) => Response) =>
		cb({ locale: request.headers.get('x-locale') ?? 'en' })
}));

vi.mock('better-auth/svelte-kit', () => ({
	svelteKitHandler: svelteKitHandlerMock
}));

vi.mock('$app/environment', () => ({
	building: false
}));

import { authHandle, handle } from './hooks.server';

beforeEach(() => vi.clearAllMocks());

const mockSession = {
	session: { id: 'sess1', userId: 'ba-user1', expiresAt: new Date() },
	user: { id: 'ba-user1', email: 'test@example.com' }
};

function makeAppEvent(method: string) {
	return {
		event: {
			url: new URL('https://example.test/home'),
			request: new Request('https://example.test/home', { method }),
			route: { id: '/(app)/home' },
			locals: {},
			getClientAddress: () => '203.0.113.1'
		},
		resolve: vi.fn()
	} as unknown as Parameters<typeof authHandle>[0];
}

describe('authHandle — (app)/ route guard redirect status', () => {
	describe('session exists but no app_users row', () => {
		test('GET redirects to /onboarding/intro1 with 307', async () => {
			getSessionMock.mockResolvedValueOnce(mockSession);
			await expect(authHandle(makeAppEvent('GET'))).rejects.toMatchObject({
				status: 307,
				location: '/onboarding/intro1'
			});
		});

		test('HEAD redirects to /onboarding/intro1 with 307', async () => {
			getSessionMock.mockResolvedValueOnce(mockSession);
			await expect(authHandle(makeAppEvent('HEAD'))).rejects.toMatchObject({
				status: 307,
				location: '/onboarding/intro1'
			});
		});

		test('POST redirects to /onboarding/intro1 with 303', async () => {
			getSessionMock.mockResolvedValueOnce(mockSession);
			await expect(authHandle(makeAppEvent('POST'))).rejects.toMatchObject({
				status: 303,
				location: '/onboarding/intro1'
			});
		});
	});

	describe('no session at all', () => {
		test('GET redirects to /onboarding with 307', async () => {
			getSessionMock.mockResolvedValueOnce(null);
			await expect(authHandle(makeAppEvent('GET'))).rejects.toMatchObject({
				status: 307,
				location: '/onboarding'
			});
		});

		test('POST redirects to /onboarding with 303', async () => {
			getSessionMock.mockResolvedValueOnce(null);
			await expect(authHandle(makeAppEvent('POST'))).rejects.toMatchObject({
				status: 303,
				location: '/onboarding'
			});
		});
	});
});

describe('authHandle', () => {
	test('regression: bypasses Better Auth session lookup for /sentry-tunnel', async () => {
		getSessionMock.mockRejectedValueOnce(new Error(REQUEST_STATE_ERROR));

		const resolve = vi.fn(async () => new Response('ok'));
		const input = {
			event: {
				url: new URL('https://example.test/sentry-tunnel'),
				request: new Request('https://example.test/sentry-tunnel', { method: 'POST' }),
				locals: {},
				getClientAddress: () => '203.0.113.1'
			},
			resolve
		} as unknown as Parameters<typeof authHandle>[0];
		const result = await authHandle(input);

		expect(result).toBeInstanceOf(Response);
		expect(getSessionMock).not.toHaveBeenCalled();
		expect(resolve).toHaveBeenCalledOnce();
		expect(svelteKitHandlerMock).not.toHaveBeenCalled();
	});
});

describe('handle — protocol-relative path guard (GHSA-pfhg-q3qv-9q6r)', () => {
	// Drop queued *Once implementations left unconsumed by earlier tests.
	beforeEach(() => getSessionMock.mockReset());

	function makeEvent(url: string) {
		const resolve = vi.fn(async () => new Response('ok'));
		const input = {
			event: {
				url: new URL(url),
				request: new Request(url),
				route: { id: null },
				locals: {},
				getClientAddress: () => '203.0.113.1'
			},
			resolve
		} as unknown as Parameters<typeof handle>[0];
		return { input, resolve };
	}

	describe('given a path starting with //', () => {
		test('returns 404 without resolving the request', async () => {
			const { input, resolve } = makeEvent('https://example.test//evil.com/foo');

			const result = await handle(input);

			expect(result.status).toBe(404);
			expect(resolve).not.toHaveBeenCalled();
			expect(getSessionMock).not.toHaveBeenCalled();
		});
	});

	// Uses the streaming endpoint because it skips sequence(), which needs
	// SvelteKit's internal request store and can't run in a unit test.
	describe('given a normal path', () => {
		test('flows through to resolve', async () => {
			getSessionMock.mockResolvedValueOnce(null);
			const { input, resolve } = makeEvent('https://example.test/api/events');

			const result = await handle(input);

			expect(result.status).toBe(200);
			expect(resolve).toHaveBeenCalledOnce();
		});
	});
});

describe('handle — security headers (src/lib/server/security-headers.ts)', () => {
	beforeEach(() => {
		getSessionMock.mockReset();
		configMock.appUrl = 'https://example.test';
	});

	function makeEvent(url: string, { user }: { user?: unknown } = {}) {
		const resolve = vi.fn(async () => new Response('ok'));
		const input = {
			event: {
				url: new URL(url),
				request: new Request(url),
				route: { id: null },
				locals: { user: user ?? null },
				getClientAddress: () => '203.0.113.1'
			},
			resolve
		} as unknown as Parameters<typeof handle>[0];
		return input;
	}

	// Uses the streaming endpoint (api/events) throughout — it skips
	// sequence(), which needs SvelteKit's internal request store and can't
	// run in a unit test — so `event.locals.user` is seeded directly instead
	// of via a mocked session lookup for the authenticated-response case.
	describe('given an unauthenticated https request to a non-sensitive path', () => {
		test('sets nosniff/referrer-policy/permissions-policy/HSTS/COOP/X-Frame-Options but no Cache-Control', async () => {
			getSessionMock.mockResolvedValueOnce(null);
			const input = makeEvent('https://example.test/api/events');

			const result = await handle(input);

			expect(result.headers.get('x-content-type-options')).toBe('nosniff');
			expect(result.headers.get('referrer-policy')).toBe('no-referrer');
			expect(result.headers.get('permissions-policy')).toBe(
				'camera=(self), geolocation=(), microphone=()'
			);
			expect(result.headers.get('strict-transport-security')).toBe('max-age=15552000');
			expect(result.headers.get('x-frame-options')).toBe('DENY');
			expect(result.headers.get('cross-origin-opener-policy')).toBe('same-origin');
			expect(result.headers.get('cache-control')).toBeNull();
			expect(result.headers.get('x-robots-tag')).toBeNull();
		});
	});

	describe('given a plain http request', () => {
		test('does not set Strict-Transport-Security', async () => {
			getSessionMock.mockResolvedValueOnce(null);
			const input = makeEvent('http://example.test/api/events');

			const result = await handle(input);

			expect(result.headers.get('strict-transport-security')).toBeNull();
		});
	});

	// Regression (review round 1, finding 2): svelte-adapter-bun defaults a
	// request's protocol to 'https' whenever neither ORIGIN nor
	// PROTOCOL_HEADER is set — so `event.url.protocol` can read 'https:' even
	// on an all-http deployment with no TLS anywhere. HSTS must also require
	// the operator's own declared APP_URL to be https.
	describe('given an https-looking request but an http APP_URL (the adapter-default-guess case)', () => {
		test('does not set Strict-Transport-Security', async () => {
			configMock.appUrl = 'http://example.test';
			getSessionMock.mockResolvedValueOnce(null);
			const input = makeEvent('https://example.test/api/events');

			const result = await handle(input);

			expect(result.headers.get('strict-transport-security')).toBeNull();
		});
	});

	// Regression (review round 1, finding 4): the response that CREATES a
	// session judges "authenticated" from the session that existed BEFORE
	// the request (there isn't one yet), so it needs its own path-based
	// (isAuthApiPath, see src/lib/server/security-headers.test.ts for the
	// pure-function cases covering real /api/auth/* paths — a real
	// /api/auth/* URL goes through mainSequence(), which needs SvelteKit's
	// internal request store and can't run in this unit test) and
	// Set-Cookie-based catch-alls — the latter IS reachable here via the
	// streaming-endpoint shortcut, regardless of path:
	describe('given an unauthenticated, non-sensitive-path response that sets a cookie', () => {
		test('sets Cache-Control: private, no-store', async () => {
			getSessionMock.mockResolvedValueOnce(null);
			const input = makeEvent('https://example.test/api/events');
			input.resolve = vi.fn(
				async () => new Response('ok', { headers: { 'set-cookie': 'session=abc; Path=/' } })
			);

			const result = await handle(input);

			expect(result.headers.get('cache-control')).toBe('private, no-store');
		});
	});

	describe('given an authenticated request', () => {
		test('sets Cache-Control: private, no-store', async () => {
			getSessionMock.mockResolvedValueOnce({
				session: { id: 'sess1', userId: 'ba-user1', expiresAt: new Date() },
				user: { id: 'ba-user1', email: 'test@example.com' }
			});
			const input = makeEvent('https://example.test/api/events');

			const result = await handle(input);

			expect(result.headers.get('cache-control')).toBe('private, no-store');
		});
	});

	describe('given a response that already set its own Cache-Control', () => {
		test('does not override it, even for an authenticated request', async () => {
			getSessionMock.mockResolvedValueOnce({
				session: { id: 'sess1', userId: 'ba-user1', expiresAt: new Date() },
				user: { id: 'ba-user1', email: 'test@example.com' }
			});
			const input = makeEvent('https://example.test/api/events');
			input.resolve = vi.fn(
				async () => new Response('ok', { headers: { 'cache-control': 'no-cache' } })
			);

			const result = await handle(input);

			expect(result.headers.get('cache-control')).toBe('no-cache');
		});
	});

	describe('given the authHandle (app) route-guard redirect', () => {
		// This redirect throws past resolve() entirely (see finalizeResponse's
		// doc comment in hooks.server.ts) — the one path this suite can't
		// reach through mainSequence(), which needs SvelteKit's internal
		// request store and can't run in a unit test. Using the /api/events
		// URL (so `handle` takes the streaming-endpoint shortcut straight to
		// authHandle, skipping mainSequence) with route.id spoofed to an
		// `/(app)` route exercises the exact authHandle throw this test
		// targets, same trick as the "given a normal path" test above.
		test('still carries the security headers', async () => {
			getSessionMock.mockResolvedValueOnce(null);
			const resolve = vi.fn();
			const input = {
				event: {
					url: new URL('https://example.test/api/events'),
					request: new Request('https://example.test/api/events'),
					route: { id: '/(app)/home' },
					locals: {},
					getClientAddress: () => '203.0.113.1'
				},
				resolve
			} as unknown as Parameters<typeof handle>[0];

			const result = await handle(input);

			expect(result.status).toBe(307);
			expect(result.headers.get('location')).toBe('/onboarding');
			expect(result.headers.get('x-content-type-options')).toBe('nosniff');
			expect(result.headers.get('strict-transport-security')).toBe('max-age=15552000');
		});

		// Same streaming-endpoint shortcut as above, with a POST shaped like a
		// `use:enhance` submission: `enhance` can't follow a plain 3xx (it
		// fetches the onboarding HTML and fails to deserialize it), so the
		// guard must answer with SvelteKit's action-result redirect JSON.
		function makeGuardedPost(headers: Record<string, string>) {
			getSessionMock.mockResolvedValueOnce(null);
			return {
				event: {
					url: new URL('https://example.test/api/events'),
					request: new Request('https://example.test/api/events', { method: 'POST', headers }),
					route: { id: '/(app)/send' },
					locals: {},
					getClientAddress: () => '203.0.113.1'
				},
				resolve: vi.fn()
			} as unknown as Parameters<typeof handle>[0];
		}

		describe('when the request is an enhanced form action (x-sveltekit-action)', () => {
			test('returns action-result redirect JSON with the security headers', async () => {
				const result = await handle(
					makeGuardedPost({ accept: 'application/json', 'x-sveltekit-action': 'true' })
				);

				expect(result.status).toBe(200);
				expect(result.headers.get('location')).toBeNull();
				expect(result.headers.get('content-type')).toContain('application/json');
				expect(await result.json()).toEqual({
					type: 'redirect',
					status: 303,
					location: '/onboarding'
				});
				expect(result.headers.get('x-content-type-options')).toBe('nosniff');
			});
		});

		describe('when the POST only negotiates JSON via Accept', () => {
			test('returns action-result redirect JSON', async () => {
				const result = await handle(makeGuardedPost({ accept: 'application/json' }));

				expect(await result.json()).toEqual({
					type: 'redirect',
					status: 303,
					location: '/onboarding'
				});
			});
		});

		describe('when the POST is a plain (non-enhanced) HTML form submission', () => {
			test('returns an ordinary 303 redirect', async () => {
				const result = await handle(
					makeGuardedPost({ accept: 'text/html,application/xhtml+xml,application/json;q=0.9' })
				);

				expect(result.status).toBe(303);
				expect(result.headers.get('location')).toBe('/onboarding');
			});
		});
	});
});
