// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, test, expect } from 'vitest';
import { maskPhone } from './phone-mask';

describe('maskPhone', () => {
	test('given a normal phone number, when masked, then hides all but the last two digits', () => {
		expect(maskPhone('+15551234567')).toBe('**********67');
	});

	test('given a short phone number, when masked, then hides all but the last two characters', () => {
		expect(maskPhone('123')).toBe('*23');
	});

	test('given a two-character input, when masked, then nothing is hidden', () => {
		expect(maskPhone('42')).toBe('42');
	});

	test('given a one-character input, when masked, then nothing is hidden', () => {
		expect(maskPhone('5')).toBe('5');
	});

	test('given an empty string, when masked, then returns an empty string', () => {
		expect(maskPhone('')).toBe('');
	});

	test('given null, when masked, then returns an empty string', () => {
		expect(maskPhone(null)).toBe('');
	});

	test('given undefined, when masked, then returns an empty string', () => {
		expect(maskPhone(undefined)).toBe('');
	});
});
