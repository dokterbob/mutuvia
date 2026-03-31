// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, test } from 'vitest';
import { isSentryTunnelPath } from './sentry';

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
