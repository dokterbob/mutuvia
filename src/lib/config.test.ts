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

describe('config', () => {
	beforeEach(() => {
		delete privateEnv.ANDROID_PACKAGE_NAME;
		delete privateEnv.ANDROID_SHA256_FINGERPRINTS;
	});

	describe('androidPackageName', () => {
		test('given no env var, when read, then defaults to org.mutuvia.app', () => {
			expect(config.androidPackageName).toBe('org.mutuvia.app');
		});

		test('given ANDROID_PACKAGE_NAME is set, when read, then returns it', () => {
			privateEnv.ANDROID_PACKAGE_NAME = 'com.example.fork';
			expect(config.androidPackageName).toBe('com.example.fork');
		});
	});

	describe('androidSha256Fingerprints', () => {
		test('given env var is unset, when read, then returns an empty array', () => {
			expect(config.androidSha256Fingerprints).toEqual([]);
		});

		test('given env var is an empty string, when read, then returns an empty array', () => {
			privateEnv.ANDROID_SHA256_FINGERPRINTS = '';
			expect(config.androidSha256Fingerprints).toEqual([]);
		});

		test('given only whitespace and commas, when read, then returns an empty array', () => {
			privateEnv.ANDROID_SHA256_FINGERPRINTS = ' , ,  ';
			expect(config.androidSha256Fingerprints).toEqual([]);
		});

		test('given one fingerprint, when read, then returns it as a single-item array', () => {
			privateEnv.ANDROID_SHA256_FINGERPRINTS = FP_A;
			expect(config.androidSha256Fingerprints).toEqual([FP_A]);
		});

		test('given multiple comma-separated fingerprints, when read, then preserves order', () => {
			privateEnv.ANDROID_SHA256_FINGERPRINTS = `${FP_B},${FP_A}`;
			expect(config.androidSha256Fingerprints).toEqual([FP_B, FP_A]);
		});

		test('given lowercase fingerprints with surrounding whitespace, when read, then trims and uppercases', () => {
			privateEnv.ANDROID_SHA256_FINGERPRINTS = `  ${FP_A.toLowerCase()} , ${FP_B.toLowerCase()}  `;
			expect(config.androidSha256Fingerprints).toEqual([FP_A, FP_B]);
		});

		test('given a trailing comma, when read, then ignores the empty entry', () => {
			privateEnv.ANDROID_SHA256_FINGERPRINTS = `${FP_A},`;
			expect(config.androidSha256Fingerprints).toEqual([FP_A]);
		});

		test('given a fingerprint that is too short, when read, then throws a descriptive error', () => {
			privateEnv.ANDROID_SHA256_FINGERPRINTS = 'AA:BB:CC';
			expect(() => config.androidSha256Fingerprints).toThrow(/ANDROID_SHA256_FINGERPRINTS/);
			expect(() => config.androidSha256Fingerprints).toThrow(/AA:BB:CC/);
		});

		test('given a fingerprint with non-hex characters, when read, then throws', () => {
			privateEnv.ANDROID_SHA256_FINGERPRINTS = Array.from({ length: 32 }, () => 'ZZ').join(':');
			expect(() => config.androidSha256Fingerprints).toThrow(/ANDROID_SHA256_FINGERPRINTS/);
		});

		test('given a fingerprint without colon separators, when read, then throws', () => {
			privateEnv.ANDROID_SHA256_FINGERPRINTS = 'AA'.repeat(32);
			expect(() => config.androidSha256Fingerprints).toThrow(/ANDROID_SHA256_FINGERPRINTS/);
		});

		test('given one valid and one invalid fingerprint, when read, then throws', () => {
			privateEnv.ANDROID_SHA256_FINGERPRINTS = `${FP_A},nope`;
			expect(() => config.androidSha256Fingerprints).toThrow(/NOPE/);
		});
	});
});
