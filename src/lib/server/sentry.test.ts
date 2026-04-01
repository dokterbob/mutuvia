// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, test } from 'vitest';
import { getSessionUnlessSentryTunnel, isSentryTunnelPath } from './sentry';

describe('isSentryTunnelPath', () => {
	test('matches the Sentry tunnel endpoint', () => {
		expect(isSentryTunnelPath('/sentry-tunnel')).toBe(true);
	});

	test('does not match other routes', () => {
		expect(isSentryTunnelPath('/sentry-tunnel/')).toBe(false);
		expect(isSentryTunnelPath('/api/auth/session')).toBe(false);
		expect(isSentryTunnelPath('/')).toBe(false);
	});
});

describe('getSessionUnlessSentryTunnel', () => {
	test('regression: does not call session lookup for sentry tunnel route', async () => {
		const getSession = async () => {
			throw new Error(
				'No request state found. Please make sure you are calling this function within a `runWithRequestState` callback.'
			);
		};

		await expect(getSessionUnlessSentryTunnel('/sentry-tunnel', getSession)).resolves.toEqual({
			skipped: true,
			session: null
		});
	});

	test('calls session lookup for non-tunnel routes', async () => {
		const fakeSession = { session: { id: 's1' }, user: { id: 'u1' } };
		const getSession = async () => fakeSession;

		await expect(getSessionUnlessSentryTunnel('/home', getSession)).resolves.toEqual({
			skipped: false,
			session: fakeSession
		});
	});
});
