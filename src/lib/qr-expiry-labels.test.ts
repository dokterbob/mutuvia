// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, test, expect, vi } from 'vitest';

vi.mock('$lib/paraglide/messages.js', () => ({
	qr_expiry_1h: () => '1 hour',
	qr_expiry_1d: () => '1 day',
	qr_expiry_3d: () => '3 days',
	qr_expiry_1w: () => '1 week',
	qr_expiry_30d: () => '30 days',
	qr_expiry_never: () => 'Never',
	qr_expiry_default: () => 'Default'
}));

import { qrExpiryLabel } from './qr-expiry-labels';
import { DEFAULT_EXPIRY_KEY } from './qr-expiry';

describe('qrExpiryLabel', () => {
	test('given a known preset key, when looked up, then returns its localized label', () => {
		expect(qrExpiryLabel('1h')).toBe('1 hour');
		expect(qrExpiryLabel('never')).toBe('Never');
	});

	test('given the synthetic default key, when looked up, then returns its label', () => {
		expect(qrExpiryLabel(DEFAULT_EXPIRY_KEY)).toBe('Default');
	});

	test('given an unknown key, when looked up, then falls back to the key itself', () => {
		expect(qrExpiryLabel('bogus')).toBe('bogus');
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
			expect(qrExpiryLabel(key)).toBe(key);
		}
	);
});
