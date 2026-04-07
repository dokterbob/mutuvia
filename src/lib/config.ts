// SPDX-License-Identifier: AGPL-3.0-or-later

import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

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
	get expiredQrRetentionSeconds() {
		return parseInt(env.EXPIRED_QR_RETENTION_SECONDS || '259200', 10);
	},
	get appUrl() {
		return env.APP_URL || env.RENDER_EXTERNAL_URL || 'http://localhost:5173';
	},
	get communityDocUrl() {
		return publicEnv.PUBLIC_COMMUNITY_DOC_URL || '';
	},
	get qrJwtSecret() {
		const secret = env.QR_JWT_SECRET;
		if (!secret || secret.length < 32) {
			throw new Error('QR_JWT_SECRET must be at least 32 characters');
		}
		return secret;
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
	}
};
