// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, test, vi } from 'vitest';

vi.mock('$lib/config', () => ({
	config: { decimalPlaces: 2, unitSymbol: '€' }
}));

import { formatAmount } from './format';

describe('formatAmount', () => {
	test('formats a positive integer amount', () => {
		expect(formatAmount(1000)).toBe('€\u00A010.00');
	});

	test('formats zero', () => {
		expect(formatAmount(0)).toBe('€\u00A00.00');
	});

	test('formats a negative amount', () => {
		expect(formatAmount(-500)).toBe('€\u00A0-5.00');
	});

	test('formats smallest unit (1 cent)', () => {
		expect(formatAmount(1)).toBe('€\u00A00.01');
	});
});
