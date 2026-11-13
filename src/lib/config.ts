// SPDX-License-Identifier: AGPL-3.0-or-later

import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { dev } from '$app/environment';
import { isValidHostPattern } from '$lib/server/push-endpoint';
import { getCountries, type CountryCode } from 'libphonenumber-js';

const VALID_HEADER_NAME = /^[a-z0-9-]+$/;

const ANDROID_SHA256_FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

// Placeholder shipped in .env.example / .env.docker.example. Deliberately
// obvious so it reads as an instruction rather than a usable secret — and so
// validateConfig() can catch it even if someone pads it past 32 characters.
export const BETTER_AUTH_SECRET_PLACEHOLDER = 'REPLACE_ME_RUN_bun_run_generate-secret';

// Shared validator for simple "positive integer seconds" env vars
// (QR_TTL_SECONDS, EXPIRED_QR_RETENTION_SECONDS, and more to come in a later
// PR) — keeps the pattern in one place rather than copy-pasted per getter.
function parsePositiveInt(name: string, raw: string): number {
	const value = parseInt(raw, 10);
	if (!Number.isSafeInteger(value) || value <= 0) {
		throw new Error(`${name} "${raw}" must be a positive integer`);
	}
	return value;
}

// Sanity ceiling for a QR's TTL, in seconds — 10 years. Without this, a
// typo'd env var (e.g. an extra digit or two, or seconds mistaken for
// milliseconds) passes `parsePositiveInt` fine but overflows `Date`'s
// internal millisecond range at `new Date(Date.now() + seconds * 1000)`
// (`Number.MAX_SAFE_INTEGER` ms is ~285,616 years, but far smaller sums
// already produce nonsense dates well before that ceiling), so the first QR
// ever created under the bad config silently gets an `Invalid Date`
// `expiresAt` instead of a clear failure at boot. Applies to
// QR_TTL_SECONDS, REUSABLE_QR_TTL_SECONDS and QR_MAX_TTL_SECONDS — not
// EXPIRED_QR_RETENTION_SECONDS (a retention window, not a QR lifetime).
const MAX_QR_TTL_SECONDS = 315_360_000; // 10 years (365 * 24 * 3600 * 10)

function parseQrTtlSeconds(name: string, raw: string): number {
	const value = parsePositiveInt(name, raw);
	if (value > MAX_QR_TTL_SECONDS) {
		throw new Error(`${name} "${raw}" must not exceed ${MAX_QR_TTL_SECONDS} (10 years)`);
	}
	return value;
}

// `transactions.amount` / `payment_requests.amount` are PostgreSQL `integer`
// (int4) on both providers' schemas (SQLite's `integer` column has no such
// ceiling itself, but the two providers must behave identically). A value
// above this would pass parseAmount() but then throw `22003 integer out of
// range` as an unhandled 500 at INSERT time on PG.
const PG_INT4_MAX = 2147483647;

export const config = {
	get appName() {
		return publicEnv.PUBLIC_APP_NAME || 'Mutuvia';
	},
	get appTagline() {
		return publicEnv.PUBLIC_APP_TAGLINE || 'Together, we are more.';
	},
	get unitCode() {
		const code = env.UNIT_CODE || 'EUR';
		try {
			new Intl.NumberFormat('en', { style: 'currency', currency: code });
		} catch {
			throw new Error(`UNIT_CODE "${code}" is not a valid ISO 4217 currency code`);
		}
		return code;
	},
	get qrTtlSeconds() {
		return parseQrTtlSeconds('QR_TTL_SECONDS', env.QR_TTL_SECONDS || '259200');
	},
	// Default expiry for a *reusable* QR, in seconds. Unset/empty means "never
	// expire" (the historical behavior, still the default) — unlike
	// `qrTtlSeconds` above, there is no numeric fallback here: `null` is a
	// real, meaningful value (see `$lib/qr-expiry`'s "never" preset), not a
	// missing one.
	get reusableQrTtlSeconds(): number | null {
		const raw = env.REUSABLE_QR_TTL_SECONDS;
		if (raw === undefined || raw === '') return null;
		return parseQrTtlSeconds('REUSABLE_QR_TTL_SECONDS', raw);
	},
	// Optional upper bound on any QR's TTL, in seconds. When set, it removes
	// every expiry preset above it (see `$lib/qr-expiry`'s `getExpiryOptions`)
	// and removes the "never" preset entirely, regardless of `reusable`.
	// `null` (unset) means no bound — every preset, including "never", stays
	// available. See `validateConfig()` for the boot-time consistency check
	// against `qrTtlSeconds`/`reusableQrTtlSeconds`.
	get qrMaxTtlSeconds(): number | null {
		const raw = env.QR_MAX_TTL_SECONDS;
		if (raw === undefined || raw === '') return null;
		return parseQrTtlSeconds('QR_MAX_TTL_SECONDS', raw);
	},
	// Sanity bound on a single transaction's amount, in minor units (cents).
	// This is NOT a credit limit — it exists only to reject fat-fingered or
	// malicious amounts (e.g. accidental extra zeros) before they reach the
	// ledger. Default (100000000 = 1,000,000.00 in a 2-decimal currency) fits
	// comfortably inside PostgreSQL's `integer` column type. Capped at
	// PG_INT4_MAX (2147483647) so the same config value behaves identically
	// on both providers and can never itself overflow the ledger column.
	get maxTransactionAmount() {
		const raw = env.MAX_TRANSACTION_AMOUNT || '100000000';
		const value = parseInt(raw, 10);
		if (!Number.isSafeInteger(value) || value <= 0 || value > PG_INT4_MAX) {
			throw new Error(
				`MAX_TRANSACTION_AMOUNT "${raw}" must be a positive integer (minor units) no greater than ${PG_INT4_MAX} (PostgreSQL integer column max), e.g. 100000000`
			);
		}
		return value;
	},
	get expiredQrRetentionSeconds() {
		return parsePositiveInt(
			'EXPIRED_QR_RETENTION_SECONDS',
			env.EXPIRED_QR_RETENTION_SECONDS || '259200'
		);
	},
	get appUrl() {
		return env.APP_URL || env.RENDER_EXTERNAL_URL || 'http://localhost:5173';
	},
	// Fails CLOSED: a built server (`dev` false — see $app/environment,
	// resolved correctly at Vite's build stage regardless of the
	// svelte-adapter-bun/NODE_ENV bake story below) is treated as production
	// UNLESS runtime NODE_ENV explicitly says otherwise (`development` or
	// `test`). An unset NODE_ENV on a built server is production — it must
	// NOT silently skip validateConfig()'s checks. `bun run dev` (`dev`
	// true) is never production, regardless of NODE_ENV.
	//
	// Deliberately reads `env.NODE_ENV` from `$env/dynamic/private` (never
	// inlined at build time) rather than a bare `process.env.NODE_ENV`
	// reference — the production bundler (rolldown, via svelte-adapter-bun)
	// statically replaces bare `process.env.NODE_ENV` reads with a literal
	// at build time, which is NOT the same thing as this app's runtime
	// environment. See the `patches/svelte-adapter-bun@*.patch` comment for
	// the full story — that bake affects Better Auth's own internal
	// isProduction, not this getter.
	get isProduction() {
		if (dev) return false;
		return env.NODE_ENV !== 'development' && env.NODE_ENV !== 'test';
	},
	// Explicit opt-in to log OTPs to the console. Defaults off; set
	// DEV_LOG_OTP=true for local dev ergonomics (see .env.example). Enabling
	// it in production is allowed but logs a loud startup warning and does
	// NOT count as a configured delivery channel — see validateConfig().
	get devLogOtp() {
		return env.DEV_LOG_OTP === 'true';
	},
	get communityDocUrl() {
		return publicEnv.PUBLIC_COMMUNITY_DOC_URL || '';
	},
	get preludeApiToken() {
		return env.PRELUDE_API_TOKEN || '';
	},
	// ── Rate limiting / abuse prevention ──
	//
	// Explicit kill switch for Better Auth's request rate limiting — never
	// implicitly derived from `isProduction`. Honoured ONLY when the runtime
	// is NOT production (see `isProduction` above): a built, production-baked
	// server (e.g. Playwright's `webServer`, which runs many sign-ins from one
	// address in parallel) can set this with `NODE_ENV=test`/`development` to
	// get deterministic tests, but the same env var can never silently
	// disable rate limiting on an actual production deployment — see
	// `validateConfig()`, which warns loudly whenever this is in effect.
	get rateLimitDisableForTesting() {
		return env.RATE_LIMIT_DISABLE_FOR_TESTING === 'true' && !this.isProduction;
	},
	get rateLimitEnabled() {
		return !this.rateLimitDisableForTesting;
	},
	// Same fail-closed shape as `rateLimitDisableForTesting`, for the
	// independent per-destination OTP send throttle (otp-throttle.ts) rather
	// than Better Auth's own IP-based limiter. Needed separately: several E2E
	// test files deliberately reuse one fixture-derived destination (e.g. the
	// same `email('user')`) across multiple sequential test cases, which
	// legitimately exceeds the throttle's real-world thresholds (3/10min,
	// 10/day) well before any single test file finishes.
	get otpThrottleDisableForTesting() {
		return env.OTP_THROTTLE_DISABLE_FOR_TESTING === 'true' && !this.isProduction;
	},
	get otpThrottleEnabled() {
		return !this.otpThrottleDisableForTesting;
	},
	// Header name Better Auth reads the client IP from for rate-limit bucketing
	// (`advanced.ipAddress.ipAddressHeaders` in auth.ts). Defaults to an
	// internal header name that `src/hooks.server.ts` always sets itself (from
	// SvelteKit's `event.getClientAddress()`, after stripping any
	// client-supplied value of the same header) — so a client can never choose
	// its own rate-limit bucket, and limiting is never silently off for lack
	// of a determinable IP. See README's "Reverse proxy / client IP" section
	// for `ADDRESS_HEADER`/`XFF_DEPTH` (svelte-adapter-bun, read directly —
	// not wrapped here) which `event.getClientAddress()` itself depends on.
	get trustedIpHeader() {
		const header = (env.TRUSTED_IP_HEADER || 'x-mutuvia-client-ip').trim().toLowerCase();
		if (!VALID_HEADER_NAME.test(header)) {
			throw new Error(
				`TRUSTED_IP_HEADER "${header}" is not a valid HTTP header name (expected letters, digits and hyphens only)`
			);
		}
		return header;
	},
	// Comma-separated ISO 3166-1 alpha-2 country codes (e.g. "PT,NL,DE,ES,FR").
	// When set, only phone numbers resolving to one of these countries may be
	// used for sign-up/OTP (enforced via `phoneNumberValidator` in auth.ts,
	// using the `libphonenumber-js` already pulled in transitively by
	// `svelte-tel-input` — see src/lib/components/ui/phone-input). `null`
	// means no restriction (the default). A phone number whose country can't
	// be determined (e.g. ambiguous/invalid) is rejected whenever this is set
	// — fail closed, since we can't confirm it's allowed.
	get phoneCountryAllowlist(): string[] | null {
		const raw = env.PHONE_COUNTRY_ALLOWLIST;
		if (!raw) return null;
		const codes = raw
			.split(',')
			.map((c) => c.trim().toUpperCase())
			.filter(Boolean);
		const valid = new Set<string>(getCountries());
		for (const code of codes) {
			if (!valid.has(code)) {
				throw new Error(
					`PHONE_COUNTRY_ALLOWLIST entry "${code}" is not a valid ISO 3166-1 alpha-2 country code`
				);
			}
		}
		return codes as CountryCode[];
	},
	// ── SMTP (email OTP) ──
	get smtpHost() {
		return env.SMTP_HOST || '';
	},
	get smtpPort() {
		const portValue = env.SMTP_PORT || '587';
		const port = parseInt(portValue, 10);
		if (!Number.isInteger(port) || port < 1 || port > 65535) {
			throw new Error(`SMTP_PORT "${portValue}" must be a valid integer between 1 and 65535`);
		}
		return port;
	},
	get smtpSecure() {
		return env.SMTP_SECURE === 'true';
	},
	get smtpUser() {
		return env.SMTP_USER || '';
	},
	get smtpPass() {
		return env.SMTP_PASS || '';
	},
	get smtpFrom() {
		return env.SMTP_FROM || `${this.appName} <noreply@example.com>`;
	},
	// ── Database ──
	get dbProvider() {
		return (env.DB_PROVIDER || 'sqlite') as 'sqlite' | 'pg';
	},
	get dbFileName() {
		return env.DB_FILE_NAME || 'sqlite.db';
	},
	get databaseUrl() {
		const url = env.DATABASE_URL;
		if (!url) throw new Error('DATABASE_URL is required when DB_PROVIDER=pg');
		return url;
	},
	// ── Web Push (VAPID) ──
	get vapidPublicKey() {
		return publicEnv.PUBLIC_VAPID_KEY ?? '';
	},
	get vapidPrivateKey() {
		const key = env.PRIVATE_VAPID_KEY;
		if (!key) throw new Error('PRIVATE_VAPID_KEY is required for push notifications');
		return key;
	},
	get vapidSubject() {
		return env.VAPID_SUBJECT ?? `mailto:admin@example.com`;
	},
	// Extra push-endpoint hosts to allow beyond the hard-coded browser vendor
	// list (see src/lib/server/push-endpoint.ts). Comma-separated; each entry
	// is either an exact host ("push.example.com") or a wildcard suffix
	// ("*.push.example.com").
	get pushEndpointExtraHosts(): string[] {
		const hosts = (env.PUSH_ENDPOINT_EXTRA_HOSTS || '')
			.split(',')
			.map((h) => h.trim().toLowerCase())
			.filter(Boolean);
		for (const host of hosts) {
			if (!isValidHostPattern(host)) {
				throw new Error(
					`PUSH_ENDPOINT_EXTRA_HOSTS entry "${host}" is not a valid host ` +
						'(expected "example.com" or "*.example.com")'
				);
			}
		}
		return hosts;
	},
	// ── Android app (Digital Asset Links) ──
	get androidPackageName() {
		return env.ANDROID_PACKAGE_NAME || 'org.mutuvia.app';
	},
	get androidSha256Fingerprints(): string[] {
		const fingerprints = (env.ANDROID_SHA256_FINGERPRINTS || '')
			.split(',')
			.map((fp) => fp.trim().toUpperCase())
			.filter(Boolean);
		for (const fp of fingerprints) {
			if (!ANDROID_SHA256_FINGERPRINT.test(fp)) {
				throw new Error(
					`ANDROID_SHA256_FINGERPRINTS entry "${fp}" is not a valid SHA-256 fingerprint ` +
						'(expected 32 colon-separated hex bytes, e.g. AA:BB:...:FF)'
				);
			}
		}
		return fingerprints;
	},
	get appVersion(): string {
		return __APP_VERSION__;
	}
};

/**
 * Startup validation — called once from `src/hooks.server.ts`'s `init` hook,
 * i.e. when the server actually starts (dev server, Docker container,
 * Playwright's webServer). NOT called during `bun run build`/prerendering,
 * so it's safe for CI and the Docker build stage to run without any secrets
 * configured.
 *
 * Deliberately narrow: only checks what's needed to catch an insecure or
 * broken production deployment early, with one clear message per problem.
 * Never logs secret values.
 */
export function validateConfig(): void {
	// Fail fast on nonsense values regardless of environment — reading these
	// getters triggers their own validation.
	void config.qrTtlSeconds;
	void config.expiredQrRetentionSeconds;
	void config.reusableQrTtlSeconds;
	void config.qrMaxTtlSeconds;
	// Review fix (PR #136): without this, a bad PHONE_COUNTRY_ALLOWLIST value
	// (e.g. a typo'd country code) wouldn't surface until the first real
	// phone OTP send tried to read it — long after startup, possibly in
	// production.
	void config.phoneCountryAllowlist;

	// An operator default that QR_MAX_TTL_SECONDS itself forbids is a
	// deployment misconfiguration, not something to clamp silently (which
	// would make the operator's own default env var a lie). Fail at boot,
	// before any QR is ever created under the broken config. Checked
	// unconditionally (like the getters above), not just in production.
	const maxTtl = config.qrMaxTtlSeconds;
	if (maxTtl !== null) {
		if (config.qrTtlSeconds > maxTtl) {
			throw new Error(
				`QR_TTL_SECONDS (${config.qrTtlSeconds}) exceeds QR_MAX_TTL_SECONDS (${maxTtl})`
			);
		}
		const reusableDefault = config.reusableQrTtlSeconds;
		if (reusableDefault === null) {
			throw new Error(
				'REUSABLE_QR_TTL_SECONDS is unset (meaning reusable QRs default to "never expire") ' +
					'but QR_MAX_TTL_SECONDS is set — "never" is incompatible with a max TTL. Set ' +
					'REUSABLE_QR_TTL_SECONDS to a bounded duration, or unset QR_MAX_TTL_SECONDS.'
			);
		}
		if (reusableDefault > maxTtl) {
			throw new Error(
				`REUSABLE_QR_TTL_SECONDS (${reusableDefault}) exceeds QR_MAX_TTL_SECONDS (${maxTtl})`
			);
		}
	}

	if (config.rateLimitDisableForTesting) {
		// Always worth a loud, visible line — even under `bun run dev` — since
		// this flag existing at all is solely for deterministic E2E/test runs.
		console.warn(
			'[WARNING] Rate limiting is DISABLED via RATE_LIMIT_DISABLE_FOR_TESTING=true. ' +
				'This has no effect in production (see config.isProduction) — if you see this ' +
				'warning on a real deployment, that env var should not be set there at all.'
		);
	}

	if (config.otpThrottleDisableForTesting) {
		console.warn(
			'[WARNING] The per-destination OTP send throttle is DISABLED via ' +
				'OTP_THROTTLE_DISABLE_FOR_TESTING=true. This has no effect in production (see ' +
				'config.isProduction) — if you see this warning on a real deployment, that env var ' +
				'should not be set there at all.'
		);
	}

	if (!config.isProduction) {
		if (dev) {
			// `bun run dev` — expected every time, not worth a warning.
			console.log('[config] Skipping production startup validation (bun run dev).');
		} else {
			// A built server (Docker-shaped, not `bun run dev`) explicitly told
			// via NODE_ENV that it isn't production — worth flagging loudly,
			// since it disables the BETTER_AUTH_SECRET/OTP-channel checks and
			// should only happen for E2E or deliberate non-production testing.
			console.warn(
				`[WARNING] Skipping production startup validation — built server with NODE_ENV=${env.NODE_ENV} (dev=${dev}).`
			);
		}
		return;
	}

	// Rate limiting keys on the client IP (see `advanced.ipAddress` in
	// auth.ts). `src/hooks.server.ts` always feeds it SvelteKit's own
	// `event.getClientAddress()`, which — behind a reverse proxy — is only
	// correct once `ADDRESS_HEADER` (and usually `XFF_DEPTH`) are configured
	// for svelte-adapter-bun; read directly here (not wrapped by this module)
	// because it's the adapter's own env var, not ours. Without it,
	// `getClientAddress()` falls back to the raw socket address — the proxy's
	// own address for every request — so rate limiting still runs (never
	// silently skipped) but buckets every real visitor together. We can't
	// tell from here whether this deployment actually sits behind a proxy, so
	// this errs toward warning rather than staying silent.
	if (!env.ADDRESS_HEADER) {
		console.warn(
			'[WARNING] ADDRESS_HEADER is not set. If this server is behind a reverse proxy, rate ' +
				"limiting will bucket every visitor by the proxy's own address instead of their real " +
				"IP — set ADDRESS_HEADER (and XFF_DEPTH) for svelte-adapter-bun. See README's " +
				'"Reverse proxy / client IP" section.'
		);
	}

	const secret = env.BETTER_AUTH_SECRET;
	if (!secret) {
		throw new Error('BETTER_AUTH_SECRET is required in production');
	}
	if (secret.length < 32) {
		throw new Error('BETTER_AUTH_SECRET must be at least 32 characters in production');
	}
	if (secret === BETTER_AUTH_SECRET_PLACEHOLDER) {
		throw new Error(
			'BETTER_AUTH_SECRET is still set to the .env.example placeholder — generate a real secret with `bun run generate-secret`'
		);
	}

	if (!config.preludeApiToken && !config.smtpHost) {
		throw new Error(
			'Neither PRELUDE_API_TOKEN nor SMTP_HOST is configured — at least one OTP delivery channel is required in production'
		);
	}

	if (config.devLogOtp) {
		console.warn(
			'[SECURITY WARNING] DEV_LOG_OTP=true in production — OTP codes will be printed to the server console. ' +
				'This should only be enabled temporarily, by deliberate operator choice.'
		);
	}

	if (!config.appUrl.startsWith('https://')) {
		console.warn(
			`[WARNING] APP_URL "${config.appUrl}" is not https in production — the Better Auth ` +
				'session cookie will NOT get the Secure attribute (see advanced.useSecureCookies in ' +
				'auth.ts), and QR links will be built as http.'
		);
	}
}
