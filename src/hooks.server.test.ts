// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, test, vi } from 'vitest';

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
	db: {},
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
