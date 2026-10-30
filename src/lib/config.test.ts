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
