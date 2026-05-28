// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Regression tests for the QR scanner URL-matching fix.
//
// The handleScan function in +page.svelte accepts any URL whose pathname matches
// /^\/(accept|send)\/.+$/ — this covers both single-use /accept/[token] QRs and
// reusable /send/[id] QRs introduced in the reusable-qrcode feature.
//
// These tests document the exact matching logic without requiring Svelte component
// instantiation.

import { describe, test, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Pure helper — mirrors the matching logic inside handleScan
// ---------------------------------------------------------------------------

function isValidPaymentUrl(data: string): { valid: true; pathname: string } | { valid: false } {
	try {
		const url = new URL(data);
		if (url.pathname.match(/^\/(accept|send)\/.+$/)) {
			return { valid: true, pathname: url.pathname };
		}
	} catch {
		// not a URL
	}
	return { valid: false };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('QR scanner URL validation', () => {
	describe('Given a single-use /accept/[token] QR URL', () => {
		test('→ recognised as valid', () => {
			const result = isValidPaymentUrl('https://app.example.com/accept/some-jwt-token');
			expect(result.valid).toBe(true);
		});

		test('→ pathname extracted correctly', () => {
			const result = isValidPaymentUrl('https://app.example.com/accept/abc123');
			expect(result.valid).toBe(true);
			if (result.valid) {
				expect(result.pathname).toBe('/accept/abc123');
			}
		});
	});

	describe('Given a reusable /send/[id] QR URL', () => {
		test('→ recognised as valid', () => {
			const result = isValidPaymentUrl('https://app.example.com/send/pr-reusable-uuid');
			expect(result.valid).toBe(true);
		});

		test('→ pathname extracted correctly', () => {
			const result = isValidPaymentUrl('https://app.example.com/send/pr-reusable-uuid');
			expect(result.valid).toBe(true);
			if (result.valid) {
				expect(result.pathname).toBe('/send/pr-reusable-uuid');
			}
		});
	});

	describe('Given an invalid URL', () => {
		test('→ rejected (plain string)', () => {
			const result = isValidPaymentUrl('not-a-url');
			expect(result.valid).toBe(false);
		});

		test('→ rejected (external URL with unrelated path)', () => {
			const result = isValidPaymentUrl('https://evil.example.com/steal/data');
			expect(result.valid).toBe(false);
		});

		test('→ rejected (/home URL)', () => {
			const result = isValidPaymentUrl('https://app.example.com/home');
			expect(result.valid).toBe(false);
		});

		test('→ rejected (/accept/ with no token — trailing slash only)', () => {
			// pathname would be "/accept/" — the .+ requires at least one char after /
			const result = isValidPaymentUrl('https://app.example.com/accept/');
			expect(result.valid).toBe(false);
		});

		test('→ rejected (/send/ with no id — trailing slash only)', () => {
			const result = isValidPaymentUrl('https://app.example.com/send/');
			expect(result.valid).toBe(false);
		});
	});
});
