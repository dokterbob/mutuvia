// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, test, expect } from 'vitest';
import { PLACEHOLDER_DOMAIN, isPlaceholderEmail, makePlaceholderEmail } from './placeholder-email';

describe('PLACEHOLDER_DOMAIN', () => {
	test('is a non-empty string', () => {
		expect(typeof PLACEHOLDER_DOMAIN).toBe('string');
		expect(PLACEHOLDER_DOMAIN.length).toBeGreaterThan(0);
	});
});

describe('isPlaceholderEmail', () => {
	test('returns true for a generated placeholder email', () => {
		expect(isPlaceholderEmail(`31612345678@${PLACEHOLDER_DOMAIN}`)).toBe(true);
	});

	test('returns true for any email ending with @<PLACEHOLDER_DOMAIN>', () => {
		expect(isPlaceholderEmail(`anything@${PLACEHOLDER_DOMAIN}`)).toBe(true);
	});

	test('returns false for a real email address', () => {
		expect(isPlaceholderEmail('user@example.com')).toBe(false);
	});

	test('returns false for an email that merely contains the domain as a substring', () => {
		expect(isPlaceholderEmail(`user@not-${PLACEHOLDER_DOMAIN}.com`)).toBe(false);
	});

	test('returns false for null', () => {
		expect(isPlaceholderEmail(null)).toBe(false);
	});

	test('returns false for undefined', () => {
		expect(isPlaceholderEmail(undefined)).toBe(false);
	});

	test('returns false for an empty string', () => {
		expect(isPlaceholderEmail('')).toBe(false);
	});
});

describe('makePlaceholderEmail', () => {
	test('strips leading + from international numbers', () => {
		const result = makePlaceholderEmail('+31612345678');
		expect(result).toBe(`31612345678@${PLACEHOLDER_DOMAIN}`);
	});

	test('strips all non-digit characters', () => {
		const result = makePlaceholderEmail('+1 (555) 123-4567');
		expect(result).toBe(`15551234567@${PLACEHOLDER_DOMAIN}`);
	});

	test('handles a plain digit-only string', () => {
		const result = makePlaceholderEmail('0612345678');
		expect(result).toBe(`0612345678@${PLACEHOLDER_DOMAIN}`);
	});

	test('roundtrip: output is detected as a placeholder email', () => {
		expect(isPlaceholderEmail(makePlaceholderEmail('+31612345678'))).toBe(true);
	});

	test('roundtrip is consistent for the same input', () => {
		const a = makePlaceholderEmail('+31612345678');
		const b = makePlaceholderEmail('+31612345678');
		expect(a).toBe(b);
	});
});
