// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, test, vi } from 'vitest';

vi.mock('$lib/config', () => ({
	config: { unitCode: 'EUR' }
}));

vi.mock('$lib/paraglide/runtime.js', () => ({
	getLocale: () => 'en'
}));

import { formatAmount, currencyFractionDigits } from './currency';

describe('currencyFractionDigits', () => {
	test('returns 2 for EUR', () => {
		expect(currencyFractionDigits()).toBe(2);
	});
});

describe('formatAmount', () => {
	test('formats a positive integer amount', () => {
		expect(formatAmount(1000)).toMatch(/€\s*10\.00/);
	});

	test('formats zero', () => {
		expect(formatAmount(0)).toMatch(/€\s*0\.00/);
	});

	test('formats a negative amount', () => {
		expect(formatAmount(-500)).toMatch(/-\s*€\s*5\.00|€\s*-\s*5\.00/);
	});

	test('formats smallest unit (1 cent)', () => {
		expect(formatAmount(1)).toMatch(/€\s*0\.01/);
	});
});
