// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, test, expect } from 'vitest';
import { formatTimeRemaining, formatDuration, remainingSeconds } from './format-time';

describe('formatTimeRemaining', () => {
	describe('given the EN locale, when formatting, then buckets are floor-based', () => {
		test.each([
			[0, 'in 0 seconds'],
			[1, 'in 1 second'],
			[59, 'in 59 seconds'],
			[60, 'in 1 minute'],
			[3599, 'in 59 minutes'],
			[3600, 'in 1 hour'],
			[86399, 'in 23 hours'],
			[86400, 'in 1 day'],
			[259200, 'in 3 days']
		])('%i s → %j', (seconds, expected) => {
			expect(formatTimeRemaining(seconds, 'en')).toBe(expected);
		});
	});

	test('given 3599 s, when formatting, then never reads "in 60 minutes"', () => {
		expect(formatTimeRemaining(3599, 'en')).not.toMatch(/60 minutes/);
	});

	test('given 86399 s, when formatting, then never reads "in 24 hours"', () => {
		expect(formatTimeRemaining(86399, 'en')).not.toMatch(/24 hours/);
	});

	test('given a negative value, when formatting, then clamps to 0 seconds', () => {
		expect(formatTimeRemaining(-5, 'en')).toBe('in 0 seconds');
	});

	describe('given the NL locale', () => {
		test.each([
			[59, 'over 59 seconden'],
			[3599, 'over 59 minuten'],
			[86400, 'over 1 dag']
		])('%i s → %j', (seconds, expected) => {
			expect(formatTimeRemaining(seconds, 'nl')).toBe(expected);
		});
	});
});

describe('formatDuration', () => {
	test.each([
		[1, '1 second'],
		[45, '45 seconds'],
		[600, '10 minutes'],
		[3600, '1 hour'],
		[5400, '90 minutes'],
		[86400, '1 day'],
		[172800, '2 days'],
		[12_345, '3.4 hours']
	])('given %i s in EN, when formatted, then reads %j', (seconds, expected) => {
		expect(formatDuration(seconds, 'en')).toBe(expected);
	});

	test('given 2 days in DE, when formatted, then reads "2 Tage"', () => {
		expect(formatDuration(172_800, 'de')).toBe('2 Tage');
	});
});

describe('remainingSeconds', () => {
	test('given an explicit now, when computed, then floors the difference in seconds', () => {
		const nowMs = 1_000_000;
		expect(remainingSeconds(new Date(nowMs + 90_999), nowMs)).toBe(90);
	});

	test('given an expiry in the past, when computed, then clamps to 0', () => {
		const nowMs = 1_000_000;
		expect(remainingSeconds(new Date(nowMs - 5000), nowMs)).toBe(0);
	});

	test('given an ISO string, when computed, then parses it', () => {
		const nowMs = Date.parse('2026-01-01T00:00:00Z');
		expect(remainingSeconds('2026-01-01T00:01:00Z', nowMs)).toBe(60);
	});
});
