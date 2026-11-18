// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, test, expect, vi, beforeEach } from 'vitest';

const { privateEnv, devFlag } = vi.hoisted(() => ({
	privateEnv: {} as Record<string, string | undefined>,
	// Mutable wrapper so tests can flip `dev` ($app/environment) per case —
	// a plain exported boolean would be snapshotted once at mock-setup time.
	devFlag: { value: false }
}));

vi.mock('$env/dynamic/private', () => ({ env: privateEnv }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$app/environment', () => ({
	get dev() {
		return devFlag.value;
	}
}));

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
		// Baseline: a built server (`bun run dev` would set this true via the
		// real $app/environment; everything else — Docker, Playwright's
		// webServer, a bare `bun build/index.js` — is a built server).
		devFlag.value = false;
	});

	// This is the fail-closed fix: a built server with no NODE_ENV at all
	// must be treated as production, not silently skip validation.
	test('given a built server and no NODE_ENV, when read, then isProduction is true', () => {
		expect(config.isProduction).toBe(true);
	});

	test('given a built server and NODE_ENV=development, when read, then isProduction is false', () => {
		privateEnv.NODE_ENV = 'development';
		expect(config.isProduction).toBe(false);
	});

	test('given a built server and NODE_ENV=test, when read, then isProduction is false', () => {
		privateEnv.NODE_ENV = 'test';
		expect(config.isProduction).toBe(false);
	});

	test('given a built server and NODE_ENV=production, when read, then isProduction is true', () => {
		privateEnv.NODE_ENV = 'production';
		expect(config.isProduction).toBe(true);
	});

	test('given a built server and an unrecognized NODE_ENV, when read, then isProduction is true', () => {
		privateEnv.NODE_ENV = 'staging';
		expect(config.isProduction).toBe(true);
	});

	// `bun run dev` — $app/environment's `dev` is true — is never
	// production, regardless of NODE_ENV.
	test('given dev (bun run dev) and no NODE_ENV, when read, then isProduction is false', () => {
		devFlag.value = true;
		expect(config.isProduction).toBe(false);
	});

	test('given dev (bun run dev) and NODE_ENV=production, when read, then isProduction is still false', () => {
		devFlag.value = true;
		privateEnv.NODE_ENV = 'production';
		expect(config.isProduction).toBe(false);
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

	// Review fix (PR #137 follow-up): without a ceiling, a value like
	// 99999999999999 passed parsePositiveInt fine and only blew up as an
	// `Invalid Date` the first time a QR was created with it — fail at
	// config-read time instead.
	test('given a value above the 10-year ceiling, when read, then throws naming the ceiling', () => {
		privateEnv.QR_TTL_SECONDS = '99999999999999';
		expect(() => config.qrTtlSeconds).toThrow(/QR_TTL_SECONDS/);
		expect(() => config.qrTtlSeconds).toThrow(/315360000/);
	});

	test('given exactly the 10-year ceiling, when read, then returns it', () => {
		privateEnv.QR_TTL_SECONDS = '315360000';
		expect(config.qrTtlSeconds).toBe(315_360_000);
	});

	test('given one second above the 10-year ceiling, when read, then throws', () => {
		privateEnv.QR_TTL_SECONDS = '315360001';
		expect(() => config.qrTtlSeconds).toThrow();
	});

	// EXPIRED_QR_RETENTION_SECONDS is a retention window, not a QR lifetime —
	// it deliberately has no ceiling.
	test('given EXPIRED_QR_RETENTION_SECONDS above the QR ceiling, when read, then does not throw', () => {
		privateEnv.EXPIRED_QR_RETENTION_SECONDS = '999999999999';
		expect(() => config.expiredQrRetentionSeconds).not.toThrow();
	});
});

describe('config (reusableQrTtlSeconds / qrMaxTtlSeconds)', () => {
	beforeEach(() => {
		delete privateEnv.REUSABLE_QR_TTL_SECONDS;
		delete privateEnv.QR_MAX_TTL_SECONDS;
	});

	test('given no env vars, when read, then reusableQrTtlSeconds is null (never) and qrMaxTtlSeconds is null (unbounded)', () => {
		expect(config.reusableQrTtlSeconds).toBeNull();
		expect(config.qrMaxTtlSeconds).toBeNull();
	});

	test('given valid custom values, when read, then both return them', () => {
		privateEnv.REUSABLE_QR_TTL_SECONDS = '86400';
		privateEnv.QR_MAX_TTL_SECONDS = '2592000';
		expect(config.reusableQrTtlSeconds).toBe(86_400);
		expect(config.qrMaxTtlSeconds).toBe(2_592_000);
	});

	test('given an empty string, when read, then both are null (same as unset)', () => {
		privateEnv.REUSABLE_QR_TTL_SECONDS = '';
		privateEnv.QR_MAX_TTL_SECONDS = '';
		expect(config.reusableQrTtlSeconds).toBeNull();
		expect(config.qrMaxTtlSeconds).toBeNull();
	});

	test('given zero, when read, then both throw naming the variable', () => {
		privateEnv.REUSABLE_QR_TTL_SECONDS = '0';
		expect(() => config.reusableQrTtlSeconds).toThrow(/REUSABLE_QR_TTL_SECONDS/);
		privateEnv.QR_MAX_TTL_SECONDS = '0';
		expect(() => config.qrMaxTtlSeconds).toThrow(/QR_MAX_TTL_SECONDS/);
	});

	test('given a non-numeric value, when read, then both throw', () => {
		privateEnv.REUSABLE_QR_TTL_SECONDS = 'abc';
		expect(() => config.reusableQrTtlSeconds).toThrow();
		privateEnv.QR_MAX_TTL_SECONDS = 'abc';
		expect(() => config.qrMaxTtlSeconds).toThrow();
	});

	// Same 10-year ceiling as QR_TTL_SECONDS — see that describe block's
	// comment for why (overflowing `new Date(Date.now() + seconds * 1000)`).
	test('given a value above the 10-year ceiling, when read, then both throw naming the ceiling', () => {
		privateEnv.REUSABLE_QR_TTL_SECONDS = '99999999999999';
		expect(() => config.reusableQrTtlSeconds).toThrow(/REUSABLE_QR_TTL_SECONDS/);
		privateEnv.QR_MAX_TTL_SECONDS = '99999999999999';
		expect(() => config.qrMaxTtlSeconds).toThrow(/QR_MAX_TTL_SECONDS/);
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
		delete privateEnv.REUSABLE_QR_TTL_SECONDS;
		delete privateEnv.QR_MAX_TTL_SECONDS;
		delete privateEnv.PHONE_COUNTRY_ALLOWLIST;
		// Baseline: a built server (Docker, Playwright's webServer, a bare
		// `bun build/index.js`) — NOT `bun run dev`.
		devFlag.value = false;
	});

	describe('given dev (bun run dev)', () => {
		beforeEach(() => {
			devFlag.value = true;
		});

		test('when validated with nothing configured, then does not throw — dev is never production', () => {
			expect(() => validateConfig()).not.toThrow();
		});

		test('when validated even with NODE_ENV=production, then still does not throw', () => {
			privateEnv.NODE_ENV = 'production';
			expect(() => validateConfig()).not.toThrow();
		});

		test('when skipped, then logs quietly rather than warning — expected every time under bun run dev', () => {
			const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			try {
				validateConfig();
				expect(logSpy).toHaveBeenCalled();
				expect(warnSpy).not.toHaveBeenCalled();
			} finally {
				logSpy.mockRestore();
				warnSpy.mockRestore();
			}
		});
	});

	// The fail-closed fix: a built server must validate unless explicitly
	// told it isn't production — an unset NODE_ENV must NOT skip checks.
	describe('given a built server with NODE_ENV unset', () => {
		test('when validated with nothing configured, then throws — an unset NODE_ENV is treated as production', () => {
			expect(() => validateConfig()).toThrow(/BETTER_AUTH_SECRET/);
		});

		test('when validated with a full valid production config, then does not throw', () => {
			privateEnv.BETTER_AUTH_SECRET = VALID_SECRET;
			privateEnv.PRELUDE_API_TOKEN = 'prelude-token';
			privateEnv.APP_URL = 'https://example.com';
			expect(() => validateConfig()).not.toThrow();
		});
	});

	describe('given a built server with NODE_ENV=development or test', () => {
		test('when validated with nothing configured, then does not throw (NODE_ENV=development)', () => {
			privateEnv.NODE_ENV = 'development';
			expect(() => validateConfig()).not.toThrow();
		});

		test('when validated with nothing configured, then does not throw (NODE_ENV=test)', () => {
			privateEnv.NODE_ENV = 'test';
			expect(() => validateConfig()).not.toThrow();
		});

		test('when skipped, then warns loudly — a built server was explicitly told it is not production', () => {
			privateEnv.NODE_ENV = 'test';
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			try {
				validateConfig();
				expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[WARNING]'));
			} finally {
				warnSpy.mockRestore();
			}
		});

		test('when validated with a malformed QR_TTL_SECONDS, then still throws — that check is unconditional', () => {
			privateEnv.NODE_ENV = 'test';
			privateEnv.QR_TTL_SECONDS = 'abc';
			expect(() => validateConfig()).toThrow(/QR_TTL_SECONDS/);
		});

		// Review fix (PR #137 follow-up): 99999999999999 used to pass
		// validateConfig() fine and only surface as an `Invalid Date`
		// `expiresAt` on the first QR ever created.
		test('when validated with an absurdly large QR_TTL_SECONDS, then still throws naming the 10-year ceiling', () => {
			privateEnv.NODE_ENV = 'test';
			privateEnv.QR_TTL_SECONDS = '99999999999999';
			expect(() => validateConfig()).toThrow(/QR_TTL_SECONDS/);
			expect(() => validateConfig()).toThrow(/315360000/);
		});

		test('when validated with an invalid PHONE_COUNTRY_ALLOWLIST, then still throws — that check is unconditional too', () => {
			privateEnv.NODE_ENV = 'test';
			privateEnv.PHONE_COUNTRY_ALLOWLIST = 'PT,ZZ';
			expect(() => validateConfig()).toThrow(/ZZ/);
		});

		// QR_MAX_TTL_SECONDS consistency with the two TTL defaults is also an
		// unconditional "nonsense config" check — fail at boot, not a silent
		// clamp, and not deferred until production.
		test('when validated with QR_TTL_SECONDS above QR_MAX_TTL_SECONDS, then still throws', () => {
			privateEnv.NODE_ENV = 'test';
			privateEnv.QR_TTL_SECONDS = '604800'; // 1 week
			privateEnv.QR_MAX_TTL_SECONDS = '86400'; // 1 day
			privateEnv.REUSABLE_QR_TTL_SECONDS = '3600';
			expect(() => validateConfig()).toThrow(/QR_TTL_SECONDS.*QR_MAX_TTL_SECONDS/);
		});

		test('when validated with REUSABLE_QR_TTL_SECONDS above QR_MAX_TTL_SECONDS, then still throws', () => {
			privateEnv.NODE_ENV = 'test';
			privateEnv.QR_TTL_SECONDS = '3600'; // within bounds, isolating the reusable check
			privateEnv.QR_MAX_TTL_SECONDS = '86400'; // 1 day
			privateEnv.REUSABLE_QR_TTL_SECONDS = '604800'; // 1 week
			expect(() => validateConfig()).toThrow(/REUSABLE_QR_TTL_SECONDS.*QR_MAX_TTL_SECONDS/);
		});

		test('when validated with QR_MAX_TTL_SECONDS set but REUSABLE_QR_TTL_SECONDS left unset ("never"), then still throws — "never" is incompatible with a max', () => {
			privateEnv.NODE_ENV = 'test';
			privateEnv.QR_TTL_SECONDS = '3600'; // within bounds, isolating the reusable check
			privateEnv.QR_MAX_TTL_SECONDS = '86400';
			expect(() => validateConfig()).toThrow(/REUSABLE_QR_TTL_SECONDS/);
		});

		test('when validated with QR_MAX_TTL_SECONDS set and both defaults within bounds, then does not throw', () => {
			privateEnv.NODE_ENV = 'test';
			privateEnv.QR_TTL_SECONDS = '3600';
			privateEnv.QR_MAX_TTL_SECONDS = '86400';
			privateEnv.REUSABLE_QR_TTL_SECONDS = '3600';
			expect(() => validateConfig()).not.toThrow();
		});
	});

	describe('given a production environment (NODE_ENV=production)', () => {
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

		// Review fix (PR #136): validateConfig() never read
		// config.phoneCountryAllowlist, so a bad value (e.g. a typo'd country
		// code) only surfaced the first time someone actually sent a phone
		// OTP — long after startup, and potentially in production. Read it
		// eagerly, in the same unconditional "fail fast on nonsense values"
		// block as qrTtlSeconds/expiredQrRetentionSeconds above.
		test('when validated with an invalid PHONE_COUNTRY_ALLOWLIST entry, then throws naming the entry, even before reaching the secret checks', () => {
			privateEnv.PHONE_COUNTRY_ALLOWLIST = 'PT,ZZ';
			expect(() => validateConfig()).toThrow(/ZZ/);
		});

		test('when validated with no ADDRESS_HEADER set, then warns about untrustworthy client IPs but does not throw', () => {
			privateEnv.BETTER_AUTH_SECRET = VALID_SECRET;
			privateEnv.PRELUDE_API_TOKEN = 'prelude-token';
			privateEnv.APP_URL = 'https://example.com';
			delete privateEnv.ADDRESS_HEADER;
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			try {
				expect(() => validateConfig()).not.toThrow();
				expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('ADDRESS_HEADER'));
			} finally {
				warnSpy.mockRestore();
			}
		});

		test('when validated with ADDRESS_HEADER set, then does not warn about client IPs', () => {
			privateEnv.BETTER_AUTH_SECRET = VALID_SECRET;
			privateEnv.PRELUDE_API_TOKEN = 'prelude-token';
			privateEnv.APP_URL = 'https://example.com';
			privateEnv.ADDRESS_HEADER = 'X-Forwarded-For';
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			try {
				validateConfig();
				expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('ADDRESS_HEADER'));
			} finally {
				warnSpy.mockRestore();
			}
		});
	});
});

describe('config (rateLimitEnabled / rateLimitDisableForTesting)', () => {
	beforeEach(() => {
		delete privateEnv.NODE_ENV;
		delete privateEnv.RATE_LIMIT_DISABLE_FOR_TESTING;
		devFlag.value = false;
	});

	test('given no env var, when read, then rate limiting is enabled', () => {
		expect(config.rateLimitEnabled).toBe(true);
		expect(config.rateLimitDisableForTesting).toBe(false);
	});

	test('given RATE_LIMIT_DISABLE_FOR_TESTING=true and NODE_ENV=test (not production), when read, then rate limiting is disabled', () => {
		privateEnv.RATE_LIMIT_DISABLE_FOR_TESTING = 'true';
		privateEnv.NODE_ENV = 'test';
		expect(config.rateLimitDisableForTesting).toBe(true);
		expect(config.rateLimitEnabled).toBe(false);
	});

	// The fail-closed guarantee this whole getter exists for: the escape
	// hatch must never work in production, no matter how it got set.
	test('given RATE_LIMIT_DISABLE_FOR_TESTING=true but NODE_ENV=production, when read, then rate limiting stays enabled', () => {
		privateEnv.RATE_LIMIT_DISABLE_FOR_TESTING = 'true';
		privateEnv.NODE_ENV = 'production';
		expect(config.isProduction).toBe(true);
		expect(config.rateLimitDisableForTesting).toBe(false);
		expect(config.rateLimitEnabled).toBe(true);
	});

	test('given RATE_LIMIT_DISABLE_FOR_TESTING=true but no NODE_ENV on a built server, when read, then rate limiting stays enabled (unset NODE_ENV is production)', () => {
		privateEnv.RATE_LIMIT_DISABLE_FOR_TESTING = 'true';
		expect(config.rateLimitEnabled).toBe(true);
	});

	test('given RATE_LIMIT_DISABLE_FOR_TESTING=true under bun run dev, when read, then rate limiting is disabled', () => {
		devFlag.value = true;
		privateEnv.RATE_LIMIT_DISABLE_FOR_TESTING = 'true';
		expect(config.rateLimitEnabled).toBe(false);
	});
});

describe('config (otpThrottleEnabled / otpThrottleDisableForTesting)', () => {
	beforeEach(() => {
		delete privateEnv.NODE_ENV;
		delete privateEnv.OTP_THROTTLE_DISABLE_FOR_TESTING;
		devFlag.value = false;
	});

	test('given no env var, when read, then the throttle is enabled', () => {
		expect(config.otpThrottleEnabled).toBe(true);
		expect(config.otpThrottleDisableForTesting).toBe(false);
	});

	test('given OTP_THROTTLE_DISABLE_FOR_TESTING=true and NODE_ENV=test (not production), when read, then the throttle is disabled', () => {
		privateEnv.OTP_THROTTLE_DISABLE_FOR_TESTING = 'true';
		privateEnv.NODE_ENV = 'test';
		expect(config.otpThrottleDisableForTesting).toBe(true);
		expect(config.otpThrottleEnabled).toBe(false);
	});

	// Same fail-closed guarantee as rateLimitDisableForTesting: never works
	// in production, no matter how it got set.
	test('given OTP_THROTTLE_DISABLE_FOR_TESTING=true but NODE_ENV=production, when read, then the throttle stays enabled', () => {
		privateEnv.OTP_THROTTLE_DISABLE_FOR_TESTING = 'true';
		privateEnv.NODE_ENV = 'production';
		expect(config.isProduction).toBe(true);
		expect(config.otpThrottleDisableForTesting).toBe(false);
		expect(config.otpThrottleEnabled).toBe(true);
	});

	test('given OTP_THROTTLE_DISABLE_FOR_TESTING=true but no NODE_ENV on a built server, when read, then the throttle stays enabled', () => {
		privateEnv.OTP_THROTTLE_DISABLE_FOR_TESTING = 'true';
		expect(config.otpThrottleEnabled).toBe(true);
	});
});

describe('config (trustedIpHeader)', () => {
	beforeEach(() => {
		delete privateEnv.TRUSTED_IP_HEADER;
	});

	test('given no env var, when read, then defaults to the internal header name', () => {
		expect(config.trustedIpHeader).toBe('x-mutuvia-client-ip');
	});

	test('given a custom header name in mixed case, when read, then lowercases it', () => {
		privateEnv.TRUSTED_IP_HEADER = 'X-Real-IP';
		expect(config.trustedIpHeader).toBe('x-real-ip');
	});

	test('given a header name with an invalid character, when read, then throws', () => {
		privateEnv.TRUSTED_IP_HEADER = 'x real ip!';
		expect(() => config.trustedIpHeader).toThrow(/TRUSTED_IP_HEADER/);
	});
});

describe('config (phoneCountryAllowlist)', () => {
	beforeEach(() => {
		delete privateEnv.PHONE_COUNTRY_ALLOWLIST;
	});

	test('given no env var, when read, then returns null (no restriction)', () => {
		expect(config.phoneCountryAllowlist).toBeNull();
	});

	test('given a comma-separated list with whitespace and lowercase codes, when read, then trims and uppercases', () => {
		privateEnv.PHONE_COUNTRY_ALLOWLIST = ' pt, nl ,de';
		expect(config.phoneCountryAllowlist).toEqual(['PT', 'NL', 'DE']);
	});

	test('given an invalid country code, when read, then throws naming the entry', () => {
		privateEnv.PHONE_COUNTRY_ALLOWLIST = 'PT,ZZ';
		expect(() => config.phoneCountryAllowlist).toThrow(/ZZ/);
	});
});
