// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, test, expect, vi, beforeEach } from 'vitest';

const { privateEnv } = vi.hoisted(() => ({
	privateEnv: {} as Record<string, string | undefined>
}));

vi.mock('$env/dynamic/private', () => ({ env: privateEnv }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { config } from './config';

const FP_A = Array.from({ length: 32 }, () => 'AA').join(':');
const FP_B = Array.from({ length: 32 }, () => '0F').join(':');

describe('config (Android)', () => {
	beforeEach(() => {
		delete privateEnv.ANDROID_PACKAGE_NAME;
		delete privateEnv.ANDROID_SHA256_FINGERPRINTS;
	});

	test('given no env vars, when read, then package defaults and fingerprints are empty', () => {
		expect(config.androidPackageName).toBe('org.mutuvia.app');
		expect(config.androidSha256Fingerprints).toEqual([]);
	});

	test('given lowercase fingerprints with whitespace and a trailing comma, when read, then trims, uppercases and keeps order', () => {
		privateEnv.ANDROID_SHA256_FINGERPRINTS = `  ${FP_B.toLowerCase()} , ${FP_A.toLowerCase()},`;
		expect(config.androidSha256Fingerprints).toEqual([FP_B, FP_A]);
	});

	test('given a malformed fingerprint, when read, then throws naming the entry', () => {
		privateEnv.ANDROID_SHA256_FINGERPRINTS = `${FP_A},AA:BB:CC`;
		expect(() => config.androidSha256Fingerprints).toThrow(/AA:BB:CC/);
	});
});

describe('config (maxTransactionAmount)', () => {
	beforeEach(() => {
		delete privateEnv.MAX_TRANSACTION_AMOUNT;
	});

	test('given no env var, when read, then defaults to 100000000', () => {
		expect(config.maxTransactionAmount).toBe(100_000_000);
	});

	test('given a valid custom value, when read, then returns it', () => {
		privateEnv.MAX_TRANSACTION_AMOUNT = '5000000';
		expect(config.maxTransactionAmount).toBe(5_000_000);
	});

	test('given zero, when read, then throws', () => {
		privateEnv.MAX_TRANSACTION_AMOUNT = '0';
		expect(() => config.maxTransactionAmount).toThrow(/positive/);
	});

	test('given a negative value, when read, then throws', () => {
		privateEnv.MAX_TRANSACTION_AMOUNT = '-100';
		expect(() => config.maxTransactionAmount).toThrow();
	});

	test('given a non-numeric value, when read, then throws', () => {
		privateEnv.MAX_TRANSACTION_AMOUNT = 'abc';
		expect(() => config.maxTransactionAmount).toThrow();
	});

	// transactions.amount / payment_requests.amount are PostgreSQL `integer`
	// (int4) on both providers' schemas — a value above int4's max would pass
	// parseAmount() but then throw `22003 integer out of range` as an
	// unhandled 500 at INSERT time on PG. Reject it here instead, at config
	// read time, for both providers equally (so behavior doesn't silently
	// differ by DB_PROVIDER).
	test('given a value above the PostgreSQL int4 max, when read, then throws naming the ceiling', () => {
		privateEnv.MAX_TRANSACTION_AMOUNT = '3000000000';
		expect(() => config.maxTransactionAmount).toThrow(/2147483647/);
	});

	test('given exactly the PostgreSQL int4 max, when read, then returns it', () => {
		privateEnv.MAX_TRANSACTION_AMOUNT = '2147483647';
		expect(config.maxTransactionAmount).toBe(2_147_483_647);
	});

	test('given one above the PostgreSQL int4 max, when read, then throws', () => {
		privateEnv.MAX_TRANSACTION_AMOUNT = '2147483648';
		expect(() => config.maxTransactionAmount).toThrow();
	});
});
