// SPDX-License-Identifier: AGPL-3.0-or-later

import { beforeEach, describe, expect, test, vi } from 'vitest';

const REQUEST_STATE_ERROR =
	'No request state found. Please make sure you are calling this function within a `runWithRequestState` callback.';

const { getSessionMock, svelteKitHandlerMock } = vi.hoisted(() => ({
	getSessionMock: vi.fn(),
	svelteKitHandlerMock: vi.fn(
		async (input: { event: unknown; resolve: (event: unknown) => Response | Promise<Response> }) =>
			input.resolve(input.event)
	)
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
	config: { dbProvider: 'sqlite' }
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

import { authHandle } from './hooks.server';

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
			locals: {}
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
				locals: {}
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
