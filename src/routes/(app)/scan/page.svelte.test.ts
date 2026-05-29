// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, test, expect } from 'vitest';
import { parsePaymentUrl } from './url-validator';

describe('parsePaymentUrl', () => {
	describe('Given a single-use /accept/[token] QR URL', () => {
		test('→ returns /accept pathname', () => {
			expect(parsePaymentUrl('https://app.example.com/accept/some-jwt-token')).toBe(
				'/accept/some-jwt-token'
			);
		});

		test('→ pathname extracted correctly', () => {
			expect(parsePaymentUrl('https://app.example.com/accept/abc123')).toBe('/accept/abc123');
		});
	});

	describe('Given a reusable /send/[id] QR URL', () => {
		test('→ returns /send pathname', () => {
			expect(parsePaymentUrl('https://app.example.com/send/pr-reusable-uuid')).toBe(
				'/send/pr-reusable-uuid'
			);
		});
	});

	describe('Given an invalid URL', () => {
		test('→ returns null for plain string', () => {
			expect(parsePaymentUrl('not-a-url')).toBeNull();
		});

		test('→ returns null for unrelated path', () => {
			expect(parsePaymentUrl('https://evil.example.com/steal/data')).toBeNull();
		});

		test('→ returns null for /home URL', () => {
			expect(parsePaymentUrl('https://app.example.com/home')).toBeNull();
		});

		test('→ returns null for /accept/ with trailing slash only', () => {
			expect(parsePaymentUrl('https://app.example.com/accept/')).toBeNull();
		});

		test('→ returns null for /send/ with trailing slash only', () => {
			expect(parsePaymentUrl('https://app.example.com/send/')).toBeNull();
		});
	});
});
