// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, test } from 'vitest';
import { formatAmount } from './balance';

describe('formatAmount', () => {
	test('formats a positive integer amount', () => {
		expect(formatAmount(1000, 2, '€')).toBe('€\u00A010.00');
	});

	test('formats zero', () => {
		expect(formatAmount(0, 2, '€')).toBe('€\u00A00.00');
	});

	test('formats a negative amount', () => {
		expect(formatAmount(-500, 2, '€')).toBe('€\u00A0-5.00');
	});

	test('formats smallest unit (1 cent)', () => {
		expect(formatAmount(1, 2, '€')).toBe('€\u00A00.01');
	});

	test('respects custom symbol', () => {
		expect(formatAmount(250, 2, 'H')).toBe('H\u00A02.50');
	});

	test('respects zero decimal places', () => {
		expect(formatAmount(42, 0, 'H')).toBe('H\u00A042');
	});
});
