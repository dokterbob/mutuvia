// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, test, vi, beforeEach } from 'vitest';

const { getLocaleMock } = vi.hoisted(() => ({
	getLocaleMock: vi.fn(() => 'en')
}));

vi.mock('$lib/config', () => ({
	config: { unitCode: 'EUR' }
}));

vi.mock('$lib/paraglide/runtime.js', () => ({
	getLocale: getLocaleMock
}));

import { formatAmount, currencyFractionDigits } from './currency';

beforeEach(() => {
	getLocaleMock.mockReturnValue('en');
});

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

	test('uses the provided locale when given explicitly', () => {
		getLocaleMock.mockReturnValue('de');
		// German locale formats as "10,00 €", but explicit 'en' should give English format
		expect(formatAmount(1000, 'en')).toMatch(/€\s*10\.00/);
	});

	test('returns locale-independent fallback when getLocale() throws', () => {
		getLocaleMock.mockImplementationOnce(() => {
			throw new Error('No AsyncLocalStorage context');
		});
		// Must not throw, and must represent the correct magnitude.
		expect(formatAmount(1000)).toBe('10.00 EUR');
	});
});
