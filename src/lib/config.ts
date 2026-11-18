// SPDX-License-Identifier: AGPL-3.0-or-later

import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

const ANDROID_SHA256_FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

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
		return parseInt(env.QR_TTL_SECONDS || '259200', 10);
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
		return parseInt(env.EXPIRED_QR_RETENTION_SECONDS || '259200', 10);
	},
	get appUrl() {
		return env.APP_URL || env.RENDER_EXTERNAL_URL || 'http://localhost:5173';
	},
	get communityDocUrl() {
		return publicEnv.PUBLIC_COMMUNITY_DOC_URL || '';
	},
	get preludeApiToken() {
		return env.PRELUDE_API_TOKEN || '';
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
