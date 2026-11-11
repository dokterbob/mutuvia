// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Review fix (PR #136): the throttle key for phone numbers was only
// `.trim()`ed and for emails only lowercased+trimmed — both let an attacker
// spend an unlimited number of distinct throttle buckets against the same
// real destination (whitespace-variant phone numbers; Gmail dot/+subaddress
// variants), fully bypassing the per-destination send limit. These tests
// pin the fix at the normalization-function level; auth-abuse.test.ts pins
// it end to end through the real endpoints.

import { describe, test, expect } from 'vitest';
import {
	canonicalE164,
	normalizePhoneDestination,
	normalizeEmailDestination
} from './otp-destination';

describe('canonicalE164', () => {
	describe('Given a clean E.164 number', () => {
		test('When canonicalized, then it is returned unchanged', () => {
			expect(canonicalE164('+15550001111')).toBe('+15550001111');
			expect(canonicalE164('+351912345678')).toBe('+351912345678');
		});
	});

	describe('Given the same number with internal whitespace', () => {
		test('When canonicalized, then it collapses to the same E.164 string', () => {
			expect(canonicalE164('+1 5550001111')).toBe('+15550001111');
			expect(canonicalE164('+1 555 000 1111')).toBe('+15550001111');
			expect(canonicalE164(' +15550001111 ')).toBe('+15550001111');
		});
	});

	// Deliberately `isPossible()`, not `isValid()`: this app's own test/E2E
	// fixtures use fictional NANP numbers (the 555 exchange — e.g.
	// +15550001111) that libphonenumber-js considers "possible" (right
	// shape/length for a NANP number) but not "valid" (555 isn't a real
	// assigned exchange). Using `isValid()` here would reject those and
	// break the test suite, along with any other legitimate use of
	// deliberately-fake numbers.
	describe('Given a fictional but structurally plausible test number (NANP 555 exchange)', () => {
		test('When canonicalized, then it is accepted (possible, not necessarily valid)', () => {
			expect(canonicalE164('+15550001111')).toBe('+15550001111');
		});
	});

	describe('Given a string that cannot be a phone number at all', () => {
		test('When canonicalized, then it returns null', () => {
			expect(canonicalE164('notaphone')).toBeNull();
			expect(canonicalE164('')).toBeNull();
		});
	});

	describe('Given a number that is far too long to be possible', () => {
		test('When canonicalized, then it returns null', () => {
			expect(canonicalE164('+1555000111199999')).toBeNull();
		});
	});

	describe('Given a number that is too short to be possible', () => {
		test('When canonicalized, then it returns null', () => {
			expect(canonicalE164('+1555000111')).toBeNull();
		});
	});
});

describe('normalizePhoneDestination', () => {
	describe('Given whitespace-variant forms of the same number', () => {
		test('When normalized, then they all produce the identical throttle key', () => {
			const variants = ['+15550001111', '+1 5550001111', '+1 555 000 1111', ' +15550001111'];
			const keys = variants.map(normalizePhoneDestination);
			expect(new Set(keys).size).toBe(1);
			expect(keys[0]).toBe('+15550001111');
		});
	});

	describe('Given an unparseable string', () => {
		test('When normalized, then it still returns a string (defense in depth — callers must reject unparseable numbers before this point, this never silently drops the attempt)', () => {
			expect(normalizePhoneDestination('notaphone')).toBe('notaphone');
		});
	});
});

describe('normalizeEmailDestination', () => {
	describe('Given Gmail plus-addressing variants', () => {
		test('When normalized, then they all collapse to the same mailbox', () => {
			const variants = [
				'victim+1@gmail.com',
				'victim+2@gmail.com',
				'victim+anything-at-all@gmail.com',
				'VICTIM+1@GMAIL.COM'
			];
			const keys = variants.map(normalizeEmailDestination);
			expect(new Set(keys).size).toBe(1);
			expect(keys[0]).toBe('victim@gmail.com');
		});
	});

	describe('Given Gmail dot-variants', () => {
		test('When normalized, then dots in the local part are ignored', () => {
			expect(normalizeEmailDestination('vic.tim@gmail.com')).toBe('victim@gmail.com');
			expect(normalizeEmailDestination('v.i.c.t.i.m@gmail.com')).toBe('victim@gmail.com');
		});
	});

	describe('Given googlemail.com', () => {
		test('When normalized, then it folds to gmail.com with the same dot/plus handling', () => {
			expect(normalizeEmailDestination('vic.tim+x@googlemail.com')).toBe('victim@gmail.com');
		});
	});

	describe('Given plus-addressing on a non-Gmail domain', () => {
		test('When normalized, then the +subaddress is still stripped (applies to all domains)', () => {
			expect(normalizeEmailDestination('victim+1@example.com')).toBe('victim@example.com');
			expect(normalizeEmailDestination('victim+2@example.com')).toBe('victim@example.com');
		});

		test('When normalized, then dots are NOT stripped on non-Gmail domains (only Gmail ignores dots)', () => {
			expect(normalizeEmailDestination('vic.tim@example.com')).toBe('vic.tim@example.com');
		});
	});

	describe('Given a plain already-normalized address', () => {
		test('When normalized, then it is unchanged', () => {
			expect(normalizeEmailDestination('victim@example.com')).toBe('victim@example.com');
		});
	});

	describe('Given mixed case and surrounding whitespace', () => {
		test('When normalized, then it is lowercased and trimmed as before', () => {
			expect(normalizeEmailDestination(' Victim@Example.com ')).toBe('victim@example.com');
		});
	});
});
