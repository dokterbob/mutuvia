// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, test, expect, vi } from 'vitest';

vi.mock('$lib/paraglide/messages.js', () => ({
	qr_expiry_1h: () => '1 hour',
	qr_expiry_1d: () => '1 day',
	qr_expiry_3d: () => '3 days',
	qr_expiry_1w: () => '1 week',
	qr_expiry_30d: () => '30 days',
	qr_expiry_never: () => 'Never'
}));

import { qrExpiryLabel } from './qr-expiry-labels';
import { DEFAULT_EXPIRY_KEY } from './qr-expiry';

describe('qrExpiryLabel', () => {
	test('given a known preset key, when looked up, then returns its localized label', () => {
		expect(qrExpiryLabel({ key: '1h', seconds: 3600 }, 'en')).toBe('1 hour');
		expect(qrExpiryLabel({ key: 'never', seconds: null }, 'en')).toBe('Never');
	});

	describe('given the synthetic default option', () => {
		test('when its seconds are 600, then it is labelled with its actual duration ("10 minutes")', () => {
			expect(qrExpiryLabel({ key: DEFAULT_EXPIRY_KEY, seconds: 600 }, 'en')).toBe('10 minutes');
		});

		test('when its seconds are 2 days, then the label is localized for the given locale', () => {
			expect(qrExpiryLabel({ key: DEFAULT_EXPIRY_KEY, seconds: 172_800 }, 'en')).toBe('2 days');
			expect(qrExpiryLabel({ key: DEFAULT_EXPIRY_KEY, seconds: 172_800 }, 'nl')).toBe('2 dagen');
		});

		test('when its seconds are null (no expiry), then it reads as "Never"', () => {
			expect(qrExpiryLabel({ key: DEFAULT_EXPIRY_KEY, seconds: null }, 'en')).toBe('Never');
		});
	});

	test('given an unknown key, when looked up, then falls back to the key itself', () => {
		expect(qrExpiryLabel({ key: 'bogus', seconds: 1 }, 'en')).toBe('bogus');
	});

	// Review fix (PR #137 follow-up): a bracket lookup on a plain object
	// (`LABELS[key]`) would resolve an Object.prototype member for a key
	// like "toString" or "constructor" instead of falling back cleanly —
	// e.g. `LABELS.toString()` returns "[object Object]", not the raw key.
	// The Map-based lookup can't do this: `Map#get` only ever returns a
	// value that was explicitly `set`.
	test.each(['toString', 'constructor', 'hasOwnProperty', '__proto__', 'valueOf'])(
		"given the Object.prototype-colliding key %j, when looked up, then falls back to the key itself (not an inherited method's result)",
		(key) => {
			expect(qrExpiryLabel({ key, seconds: 1 }, 'en')).toBe(key);
		}
	);
});
