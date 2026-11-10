// SPDX-License-Identifier: AGPL-3.0-or-later
// Security regression: the root layout used to return the whole
// `locals.session` and `locals.user` to every page via page data. Better
// Auth's Session object carries `token`, `ipAddress`, `userAgent`, etc., and
// `locals.user` carries the full Better Auth user record — neither field is
// read anywhere client-side (grepped for `data.session`/`data.user`/
// `page.data.session`/`page.data.user` across `src`), so neither should ever
// reach the client. This pins that only `appUser` (already a narrow,
// app-specific projection) and `appName` are returned.

import { describe, it, expect, vi } from 'vitest';

// Sentry's SvelteKit plugin wraps the load function and inspects
// event.request — mock it out so the test can call load() directly without a
// full Sentry environment (same pattern used by other *.server.test.ts files).
vi.mock('@sentry/sveltekit', () => ({
	wrapLoadWithSentry: (fn: unknown) => fn,
	wrapServerLoadWithSentry: (fn: unknown) => fn
}));

vi.mock('$lib/config', () => ({
	config: { appName: 'Mutuvia' }
}));

import { load } from './+layout.server';

function makeEvent(locals: Record<string, unknown>): Parameters<typeof load>[0] {
	return { locals } as unknown as Parameters<typeof load>[0];
}

const fullSession = {
	id: 'session-1',
	token: 'super-secret-session-token',
	ipAddress: '203.0.113.7',
	userAgent: 'Mozilla/5.0 (test)',
	userId: 'auth-user-1',
	expiresAt: new Date()
};

const fullUser = {
	id: 'auth-user-1',
	email: 'alice@test.example',
	phoneNumber: '+15551234567',
	emailVerified: true
};

const appUser = {
	id: 'app-user-1',
	betterAuthUserId: 'auth-user-1',
	displayName: 'Alice',
	sendConsentAt: null,
	createdAt: new Date(),
	lastSeenVersion: null
};

describe('root +layout.server.ts load — data minimization [security]', () => {
	describe('Given an authenticated request', () => {
		it('does not return locals.session (token/ipAddress/userAgent) to the client', async () => {
			const result = await load(makeEvent({ session: fullSession, user: fullUser, appUser }));

			expect(result).not.toHaveProperty('session');
			expect(JSON.stringify(result)).not.toContain('super-secret-session-token');
			expect(JSON.stringify(result)).not.toContain('203.0.113.7');
		});

		it('does not return locals.user (email/phone/etc.) to the client', async () => {
			const result = await load(makeEvent({ session: fullSession, user: fullUser, appUser }));

			expect(result).not.toHaveProperty('user');
			expect(JSON.stringify(result)).not.toContain('alice@test.example');
			expect(JSON.stringify(result)).not.toContain('+15551234567');
		});

		it('still returns appUser as-is — it is already a narrow, non-sensitive projection', async () => {
			const result = await load(makeEvent({ session: fullSession, user: fullUser, appUser }));

			if (!result) throw new Error('load returned void unexpectedly');
			expect(result.appUser).toBe(appUser);
		});
	});

	describe('Given an unauthenticated request', () => {
		it('returns appUser: null and appName from config, nothing else sensitive', async () => {
			const result = await load(makeEvent({ session: null, user: null, appUser: null }));

			expect(result).toEqual({ appUser: null, appName: 'Mutuvia' });
		});
	});
});
