// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest';
import {
	validatePushEndpoint,
	validatePushKeys,
	isAllowedPushHost,
	isValidHostPattern,
	capUserAgent,
	MAX_USER_AGENT_LENGTH,
	PUSH_ENDPOINT_MAX_LENGTH
} from './push-endpoint';

// A valid 65-byte uncompressed P-256 point (0x04 prefix + 64 bytes) and a
// valid 16-byte auth secret, both base64url-encoded.
const VALID_P256DH =
	'BAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE';
const VALID_AUTH = 'AgICAgICAgICAgICAgICAg';
// Same length as VALID_P256DH but missing the 0x04 uncompressed-point prefix.
const WRONG_PREFIX_P256DH =
	'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ';

describe('validatePushEndpoint()', () => {
	describe('given a valid https endpoint on an allowed host', () => {
		it('accepts fcm.googleapis.com', () => {
			const result = validatePushEndpoint('https://fcm.googleapis.com/fcm/send/abc123');
			expect(result.ok).toBe(true);
		});

		it('accepts updates.push.services.mozilla.com', () => {
			const result = validatePushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc');
			expect(result.ok).toBe(true);
		});

		it('accepts a web.push.apple.com subdomain via the *.push.apple.com wildcard', () => {
			const result = validatePushEndpoint('https://web.push.apple.com/some-id');
			expect(result.ok).toBe(true);
		});

		it('accepts a *.notify.windows.com subdomain', () => {
			const result = validatePushEndpoint('https://db5.notify.windows.com/abc123');
			expect(result.ok).toBe(true);
		});
	});

	describe('given an unknown host', () => {
		it('rejects it', () => {
			const result = validatePushEndpoint('https://evil.example.com/abc');
			expect(result.ok).toBe(false);
		});

		it('rejects a host that merely contains an allowed host as a substring', () => {
			const result = validatePushEndpoint('https://fcm.googleapis.com.attacker.tld/abc');
			expect(result.ok).toBe(false);
		});

		it('rejects a host that is a suffix-but-not-dot-anchored match', () => {
			const result = validatePushEndpoint('https://xpush.apple.com/abc');
			expect(result.ok).toBe(false);
		});

		it('rejects a trailing-dot variant of an allowed host', () => {
			const result = validatePushEndpoint('https://fcm.googleapis.com./abc');
			expect(result.ok).toBe(false);
		});

		it('rejects the legacy android.googleapis.com host by default (Chrome stopped issuing it in 2019)', () => {
			const result = validatePushEndpoint('https://android.googleapis.com/gcm/send/abc123');
			expect(result.ok).toBe(false);
		});

		it('accepts android.googleapis.com when an operator explicitly allows it via PUSH_ENDPOINT_EXTRA_HOSTS', () => {
			const result = validatePushEndpoint('https://android.googleapis.com/gcm/send/abc123', [
				'android.googleapis.com'
			]);
			expect(result.ok).toBe(true);
		});
	});

	describe('given a non-https scheme', () => {
		it('rejects http:', () => {
			const result = validatePushEndpoint('http://fcm.googleapis.com/abc');
			expect(result.ok).toBe(false);
		});

		it('rejects an unknown scheme', () => {
			const result = validatePushEndpoint('ftp://fcm.googleapis.com/abc');
			expect(result.ok).toBe(false);
		});
	});

	describe('given an IP literal host', () => {
		it('rejects an IPv4 literal', () => {
			const result = validatePushEndpoint('https://169.254.169.254/latest/meta-data');
			expect(result.ok).toBe(false);
		});

		it('rejects an IPv6 literal', () => {
			const result = validatePushEndpoint('https://[::1]/abc');
			expect(result.ok).toBe(false);
		});

		it('rejects a private IPv4 literal even if dressed up as a path', () => {
			const result = validatePushEndpoint('https://127.0.0.1/fcm.googleapis.com');
			expect(result.ok).toBe(false);
		});
	});

	describe('given a non-default port', () => {
		it('rejects an explicit non-default port', () => {
			const result = validatePushEndpoint('https://fcm.googleapis.com:8443/abc');
			expect(result.ok).toBe(false);
		});

		it('accepts the default https port written out explicitly', () => {
			const result = validatePushEndpoint('https://fcm.googleapis.com:443/abc');
			expect(result.ok).toBe(true);
		});
	});

	describe('given embedded credentials', () => {
		it('rejects a userinfo component', () => {
			const result = validatePushEndpoint('https://user:pass@fcm.googleapis.com/abc');
			expect(result.ok).toBe(false);
		});
	});

	describe('given a malformed or oversized endpoint', () => {
		it('rejects a non-string value', () => {
			expect(validatePushEndpoint(null).ok).toBe(false);
			expect(validatePushEndpoint(undefined).ok).toBe(false);
			expect(validatePushEndpoint(123).ok).toBe(false);
		});

		it('rejects an empty string', () => {
			expect(validatePushEndpoint('').ok).toBe(false);
		});

		it('rejects an unparseable URL', () => {
			expect(validatePushEndpoint('not a url').ok).toBe(false);
		});

		it(`rejects an endpoint longer than ${PUSH_ENDPOINT_MAX_LENGTH} characters`, () => {
			const longPath = 'a'.repeat(PUSH_ENDPOINT_MAX_LENGTH);
			const result = validatePushEndpoint(`https://fcm.googleapis.com/${longPath}`);
			expect(result.ok).toBe(false);
		});
	});

	describe('given PUSH_ENDPOINT_EXTRA_HOSTS entries', () => {
		it('accepts an exact extra host', () => {
			const result = validatePushEndpoint('https://push.example.com/abc', ['push.example.com']);
			expect(result.ok).toBe(true);
		});

		it('accepts a subdomain via a *.suffix extra host', () => {
			const result = validatePushEndpoint('https://eu.push.example.com/abc', [
				'*.push.example.com'
			]);
			expect(result.ok).toBe(true);
		});

		it('still rejects hosts not covered by the extra list', () => {
			const result = validatePushEndpoint('https://other.example.com/abc', ['push.example.com']);
			expect(result.ok).toBe(false);
		});
	});
});

describe('isAllowedPushHost()', () => {
	it('is case-insensitive', () => {
		expect(isAllowedPushHost('FCM.GOOGLEAPIS.COM')).toBe(true);
	});
});

describe('isValidHostPattern()', () => {
	it('accepts a plain host', () => {
		expect(isValidHostPattern('push.example.com')).toBe(true);
	});

	it('accepts a wildcard-suffix host', () => {
		expect(isValidHostPattern('*.push.example.com')).toBe(true);
	});

	it('rejects an IP literal', () => {
		expect(isValidHostPattern('127.0.0.1')).toBe(false);
	});

	it('rejects a bare label with no dot', () => {
		expect(isValidHostPattern('localhost')).toBe(false);
	});

	it('rejects a wildcard in the middle', () => {
		expect(isValidHostPattern('push.*.example.com')).toBe(false);
	});
});

describe('validatePushKeys()', () => {
	describe('given well-formed keys', () => {
		it('accepts a valid 65-byte p256dh and 16-byte auth', () => {
			const result = validatePushKeys({ p256dh: VALID_P256DH, auth: VALID_AUTH });
			expect(result.ok).toBe(true);
		});
	});

	describe('given malformed keys', () => {
		it('rejects when keys is not an object', () => {
			expect(validatePushKeys(null).ok).toBe(false);
			expect(validatePushKeys('x').ok).toBe(false);
		});

		it('rejects when p256dh or auth is missing', () => {
			expect(validatePushKeys({ p256dh: VALID_P256DH }).ok).toBe(false);
			expect(validatePushKeys({ auth: VALID_AUTH }).ok).toBe(false);
		});

		it('rejects a p256dh of the wrong byte length', () => {
			const result = validatePushKeys({ p256dh: VALID_AUTH, auth: VALID_AUTH });
			expect(result.ok).toBe(false);
		});

		it('rejects a p256dh missing the 0x04 uncompressed-point prefix', () => {
			const result = validatePushKeys({ p256dh: WRONG_PREFIX_P256DH, auth: VALID_AUTH });
			expect(result.ok).toBe(false);
		});

		it('rejects an auth secret of the wrong byte length', () => {
			const result = validatePushKeys({ p256dh: VALID_P256DH, auth: VALID_P256DH });
			expect(result.ok).toBe(false);
		});

		it('rejects non-base64url characters', () => {
			const result = validatePushKeys({ p256dh: 'not base64url!!', auth: VALID_AUTH });
			expect(result.ok).toBe(false);
		});
	});
});

describe('capUserAgent()', () => {
	it('returns null for a missing or non-string value', () => {
		expect(capUserAgent(undefined)).toBeNull();
		expect(capUserAgent(123)).toBeNull();
	});

	it('returns the string unchanged when within the cap', () => {
		expect(capUserAgent('Mozilla/5.0')).toBe('Mozilla/5.0');
	});

	it(`truncates to ${MAX_USER_AGENT_LENGTH} characters`, () => {
		const long = 'x'.repeat(MAX_USER_AGENT_LENGTH + 100);
		const result = capUserAgent(long);
		expect(result).toHaveLength(MAX_USER_AGENT_LENGTH);
	});
});
