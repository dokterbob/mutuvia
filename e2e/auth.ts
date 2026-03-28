/**
 * Test-side Better Auth instance.
 *
 * Playwright tests run in a separate Node.js process from the SvelteKit
 * server, so we cannot import from $lib or use bun:sqlite here. Instead we
 * use better-sqlite3 (already a devDependency) and drizzle-orm/better-sqlite3
 * to connect to the shared test.db file. DB operations (createUser, saveUser,
 * deleteUser, getCookies) work cross-process because they target the same
 * SQLite file.
 *
 * Only the testUtils plugin is loaded here — we do not need emailOTP or
 * phoneNumber on the test side.
 */

import { betterAuth } from 'better-auth';
import { testUtils } from 'better-auth/plugins';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from '../src/lib/server/schema.js';
import { E2E_DB_FILE, E2E_AUTH_SECRET, E2E_BASE_URL } from './config.js';

export const sqlite = new Database(E2E_DB_FILE);

const db = drizzle(sqlite, { schema });

export const auth = betterAuth({
	database: drizzleAdapter(db, { provider: 'sqlite' }),
	plugins: [testUtils({ captureOTP: true })],
	secret: E2E_AUTH_SECRET,
	baseURL: E2E_BASE_URL,
	trustedOrigins: [E2E_BASE_URL]
});
