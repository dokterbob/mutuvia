// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, test, expect, vi } from 'vitest';

vi.mock('$lib/config', () => ({
	config: { trustedIpHeader: 'x-mutuvia-client-ip' }
}));

import type { RequestEvent } from '@sveltejs/kit';
import { applyTrustedIpHeader } from './trusted-ip';

const HEADER = 'x-mutuvia-client-ip';

function makeEvent(path: string, getClientAddress: () => string) {
	const url = `http://localhost:3000${path}`;
	return {
		url: new URL(url),
		// A client trying to choose its own rate-limit bucket. Real requests
		// always carry other headers (Host at minimum); Bun's
		// `new Request(req, { headers })` keeps the ORIGINAL headers when the
		// replacement Headers is empty, so a request carrying only the
		// spoofed header would not be representative.
		request: new Request(url, {
			headers: { host: 'localhost:3000', 'user-agent': 'Wget', [HEADER]: '198.51.100.66' }
		}),
		getClientAddress
	} as unknown as RequestEvent;
}

// svelte-adapter-bun's getClientAddress() when ADDRESS_HEADER is set but
// absent from the request, e.g. a container health check hitting localhost
// directly instead of going through the reverse proxy.
function missingAddressHeader(): string {
	throw new Error(
		'Address header was specified with ADDRESS_HEADER=x-forwarded-for but is absent from request'
	);
}

describe('applyTrustedIpHeader', () => {
	describe('when the client address resolves', () => {
		test('replaces any client-supplied value with the resolved address', () => {
			const event = makeEvent('/api/auth/sign-in/email-otp', () => '203.0.113.7');

			applyTrustedIpHeader(event);

			expect(event.request.headers.get(HEADER)).toBe('203.0.113.7');
		});
	});

	describe('when the client address cannot be resolved', () => {
		describe('on a non-auth path such as the /api/health check', () => {
			test('does not throw, and leaves the trusted header unset rather than client-controlled', () => {
				const event = makeEvent('/api/health', missingAddressHeader);

				expect(() => applyTrustedIpHeader(event)).not.toThrow();
				expect(event.request.headers.has(HEADER)).toBe(false);
			});
		});

		describe('on a Better Auth route', () => {
			test('fails closed by rethrowing, so rate limiting is never silently skipped', () => {
				const event = makeEvent('/api/auth/sign-in/email-otp', missingAddressHeader);

				expect(() => applyTrustedIpHeader(event)).toThrow(/Address header/);
			});

			test('treats the bare base path as a Better Auth route too', () => {
				const event = makeEvent('/api/auth', missingAddressHeader);

				expect(() => applyTrustedIpHeader(event)).toThrow(/Address header/);
			});
		});

		describe('on a path that only shares the /api/auth prefix', () => {
			test('is not treated as a Better Auth route', () => {
				const event = makeEvent('/api/authz-debug', missingAddressHeader);

				expect(() => applyTrustedIpHeader(event)).not.toThrow();
			});
		});
	});
});
