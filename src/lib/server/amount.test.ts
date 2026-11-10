// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, test, vi } from 'vitest';

vi.mock('$lib/config', () => ({
	config: { maxTransactionAmount: 100_000_000 } // 1,000,000.00 at 2 decimal places
}));

import { parseAmount, parseStoredAmount } from './amount';

describe('parseAmount', () => {
	describe('valid inputs', () => {
		test.each<[string, string, number, number]>([
			['whole number at 2dp', '10', 2, 1000],
			['two decimal places', '10.50', 2, 1050],
			['one decimal place at 2dp', '10.5', 2, 1050],
			['avoids float imprecision (19.99 * 100)', '19.99', 2, 1999],
			['leading zeros', '05.00', 2, 500],
			['leading and trailing whitespace', '  5  ', 2, 500],
			['smallest unit', '0.01', 2, 1],
			['fractionDigits = 0, whole number', '5', 0, 5],
			['fractionDigits = 0, leading zeros', '007', 0, 7],
			['exactly at the max', '1000000.00', 2, 100_000_000]
		])('%s: %j at %i dp → %i', (_label, input, dp, expected) => {
			expect(parseAmount(input, dp)).toBe(expected);
		});
	});

	describe('rejected inputs', () => {
		test.each<[string, unknown, number]>([
			['exponential notation', '1e9', 2],
			['Infinity', 'Infinity', 2],
			['-Infinity', '-Infinity', 2],
			['NaN literal', 'NaN', 2],
			['trailing garbage', '10abc', 2],
			['leading garbage', 'abc10', 2],
			['negative sign', '-1', 2],
			['plus sign', '+5', 2],
			['zero', '0', 2],
			['zero with decimals', '0.00', 2],
			['too many decimal places', '1.234', 2],
			['leading-dot form', '.5', 2],
			['trailing-dot form', '5.', 2],
			['comma decimal separator', '1,50', 2],
			['thousands separator', '1,000', 2],
			['empty string', '', 2],
			['whitespace only', '   ', 2],
			['internal whitespace', '1 0', 2],
			['decimal point with fractionDigits = 0', '5.0', 0],
			['one amount above the max', '1000000.01', 2],
			['far above the max', '99999999999', 2],
			['pathologically long digit string', '9'.repeat(50), 0],
			['null', null, 2],
			['undefined', undefined, 2],
			['a number (not a string)', 5, 2],
			['a plain object (e.g. File-like)', {}, 2],
			['an array', ['5'], 2]
		])('%s: %j at %i dp → null', (_label, input, dp) => {
			expect(parseAmount(input, dp)).toBeNull();
		});
	});
});

describe('parseStoredAmount', () => {
	// Parses an already-minor-unit integer string — e.g. the `qr_amount`
	// cookie, which this app only ever sets to `String(parseAmount(...))`.
	// Tampering with that cookie is display-only (the send action re-validates
	// with parseAmount before settling), but the prefilled display value must
	// still never trust an attacker-controlled cookie string.
	describe('valid inputs', () => {
		test.each<[string, string, number]>([
			['a plain positive integer', '1050', 1050],
			['leading zeros', '0500', 500],
			['leading and trailing whitespace', '  500  ', 500],
			['the smallest unit', '1', 1],
			['exactly at the max', '100000000', 100_000_000]
		])('%s: %j → %i', (_label, input, expected) => {
			expect(parseStoredAmount(input)).toBe(expected);
		});
	});

	describe('rejected inputs (tampered cookie)', () => {
		test.each<[string, unknown]>([
			['trailing garbage', '10abc'],
			['exponential notation', '1e9'],
			['negative sign', '-5'],
			['a decimal point', '10.50'],
			['zero', '0'],
			['above the max', '100000001'],
			['empty string', ''],
			['undefined (cookie absent)', undefined],
			['null', null]
		])('%s: %j → null', (_label, input) => {
			expect(parseStoredAmount(input)).toBeNull();
		});
	});
});
