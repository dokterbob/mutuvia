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
		return env.UNIT_CODE || 'EUR';
	},
	get qrTtlSeconds() {
		return parseInt(env.QR_TTL_SECONDS || '259200', 10);
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
	}
};
