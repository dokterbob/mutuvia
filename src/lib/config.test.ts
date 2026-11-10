// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, test, expect, vi, beforeEach } from 'vitest';

const { privateEnv } = vi.hoisted(() => ({
	privateEnv: {} as Record<string, string | undefined>
}));

vi.mock('$env/dynamic/private', () => ({ env: privateEnv }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { config, validateConfig, BETTER_AUTH_SECRET_PLACEHOLDER } from './config';

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

describe('config (isProduction)', () => {
	beforeEach(() => {
		delete privateEnv.NODE_ENV;
	});

	test('given no NODE_ENV, when read, then isProduction is false', () => {
		expect(config.isProduction).toBe(false);
	});

	test('given NODE_ENV=development, when read, then isProduction is false', () => {
		privateEnv.NODE_ENV = 'development';
		expect(config.isProduction).toBe(false);
	});

	test('given NODE_ENV=production, when read, then isProduction is true', () => {
		privateEnv.NODE_ENV = 'production';
		expect(config.isProduction).toBe(true);
	});
});

describe('config (devLogOtp)', () => {
	beforeEach(() => {
		delete privateEnv.DEV_LOG_OTP;
	});

	test('given no DEV_LOG_OTP, when read, then devLogOtp is false', () => {
		expect(config.devLogOtp).toBe(false);
	});

	test('given DEV_LOG_OTP=true, when read, then devLogOtp is true', () => {
		privateEnv.DEV_LOG_OTP = 'true';
		expect(config.devLogOtp).toBe(true);
	});

	test('given DEV_LOG_OTP=false, when read, then devLogOtp is false', () => {
		privateEnv.DEV_LOG_OTP = 'false';
		expect(config.devLogOtp).toBe(false);
	});
});

describe('config (qrTtlSeconds / expiredQrRetentionSeconds)', () => {
	beforeEach(() => {
		delete privateEnv.QR_TTL_SECONDS;
		delete privateEnv.EXPIRED_QR_RETENTION_SECONDS;
	});

	test('given no env vars, when read, then both default to 259200', () => {
		expect(config.qrTtlSeconds).toBe(259_200);
		expect(config.expiredQrRetentionSeconds).toBe(259_200);
	});

	test('given valid custom values, when read, then both return them', () => {
		privateEnv.QR_TTL_SECONDS = '600';
		privateEnv.EXPIRED_QR_RETENTION_SECONDS = '1200';
		expect(config.qrTtlSeconds).toBe(600);
		expect(config.expiredQrRetentionSeconds).toBe(1200);
	});

	test('given zero, when read, then both throw naming the variable', () => {
		privateEnv.QR_TTL_SECONDS = '0';
		expect(() => config.qrTtlSeconds).toThrow(/QR_TTL_SECONDS/);
		privateEnv.EXPIRED_QR_RETENTION_SECONDS = '0';
		expect(() => config.expiredQrRetentionSeconds).toThrow(/EXPIRED_QR_RETENTION_SECONDS/);
	});

	test('given a negative value, when read, then both throw', () => {
		privateEnv.QR_TTL_SECONDS = '-1';
		expect(() => config.qrTtlSeconds).toThrow();
		privateEnv.EXPIRED_QR_RETENTION_SECONDS = '-1';
		expect(() => config.expiredQrRetentionSeconds).toThrow();
	});

	test('given a non-numeric value, when read, then both throw', () => {
		privateEnv.QR_TTL_SECONDS = 'abc';
		expect(() => config.qrTtlSeconds).toThrow();
		privateEnv.EXPIRED_QR_RETENTION_SECONDS = 'abc';
		expect(() => config.expiredQrRetentionSeconds).toThrow();
	});
});

describe('validateConfig', () => {
	const VALID_SECRET = 'a'.repeat(32);

	beforeEach(() => {
		delete privateEnv.NODE_ENV;
		delete privateEnv.BETTER_AUTH_SECRET;
		delete privateEnv.PRELUDE_API_TOKEN;
		delete privateEnv.SMTP_HOST;
		delete privateEnv.APP_URL;
		delete privateEnv.DEV_LOG_OTP;
		delete privateEnv.QR_TTL_SECONDS;
		delete privateEnv.EXPIRED_QR_RETENTION_SECONDS;
	});

	describe('given a non-production environment', () => {
		test('when validated with nothing configured, then does not throw', () => {
			expect(() => validateConfig()).not.toThrow();
		});

		test('when validated with a malformed QR_TTL_SECONDS, then still throws', () => {
			privateEnv.QR_TTL_SECONDS = 'abc';
			expect(() => validateConfig()).toThrow(/QR_TTL_SECONDS/);
		});
	});

	describe('given a production environment', () => {
		beforeEach(() => {
			privateEnv.NODE_ENV = 'production';
		});

		test('when validated with no BETTER_AUTH_SECRET, then throws naming the variable', () => {
			expect(() => validateConfig()).toThrow(/BETTER_AUTH_SECRET/);
		});

		test('when validated with a short BETTER_AUTH_SECRET, then throws', () => {
			privateEnv.BETTER_AUTH_SECRET = 'too-short';
			expect(() => validateConfig()).toThrow(/32 characters/);
		});

		test('when validated with the exact .env.example placeholder secret, then throws naming it as a placeholder', () => {
			privateEnv.BETTER_AUTH_SECRET = BETTER_AUTH_SECRET_PLACEHOLDER;
			expect(() => validateConfig()).toThrow(/placeholder/);
		});

		test('when validated with a valid secret but no OTP channel configured, then throws naming the channel requirement', () => {
			privateEnv.BETTER_AUTH_SECRET = VALID_SECRET;
			expect(() => validateConfig()).toThrow(/PRELUDE_API_TOKEN|SMTP_HOST|OTP delivery channel/);
		});

		test('when validated with Prelude configured, then does not throw', () => {
			privateEnv.BETTER_AUTH_SECRET = VALID_SECRET;
			privateEnv.PRELUDE_API_TOKEN = 'prelude-token';
			privateEnv.APP_URL = 'https://example.com';
			expect(() => validateConfig()).not.toThrow();
		});

		test('when validated with SMTP configured, then does not throw', () => {
			privateEnv.BETTER_AUTH_SECRET = VALID_SECRET;
			privateEnv.SMTP_HOST = 'smtp.example.com';
			privateEnv.APP_URL = 'https://example.com';
			expect(() => validateConfig()).not.toThrow();
		});

		test('when validated with DEV_LOG_OTP=true and no other channel, then still throws — it is not a configured channel', () => {
			privateEnv.BETTER_AUTH_SECRET = VALID_SECRET;
			privateEnv.DEV_LOG_OTP = 'true';
			expect(() => validateConfig()).toThrow(/PRELUDE_API_TOKEN|SMTP_HOST|OTP delivery channel/);
		});

		test('when validated with DEV_LOG_OTP=true and a configured channel, then warns loudly but does not throw', () => {
			privateEnv.BETTER_AUTH_SECRET = VALID_SECRET;
			privateEnv.PRELUDE_API_TOKEN = 'prelude-token';
			privateEnv.APP_URL = 'https://example.com';
			privateEnv.DEV_LOG_OTP = 'true';
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			try {
				expect(() => validateConfig()).not.toThrow();
				expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('DEV_LOG_OTP'));
			} finally {
				warnSpy.mockRestore();
			}
		});

		test('when validated with a non-https APP_URL, then warns but does not throw', () => {
			privateEnv.BETTER_AUTH_SECRET = VALID_SECRET;
			privateEnv.PRELUDE_API_TOKEN = 'prelude-token';
			privateEnv.APP_URL = 'http://example.com';
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			try {
				expect(() => validateConfig()).not.toThrow();
				expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('https'));
			} finally {
				warnSpy.mockRestore();
			}
		});

		test('when validated with a malformed EXPIRED_QR_RETENTION_SECONDS, then throws even before reaching the secret checks', () => {
			privateEnv.EXPIRED_QR_RETENTION_SECONDS = '-5';
			expect(() => validateConfig()).toThrow(/EXPIRED_QR_RETENTION_SECONDS/);
		});
	});
});
