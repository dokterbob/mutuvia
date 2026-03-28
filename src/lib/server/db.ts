// SPDX-License-Identifier: AGPL-3.0-or-later

import { config } from '$lib/config';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { Database } from 'bun:sqlite';
import type * as SqliteSchema from './schema.sqlite';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mod: any = config.dbProvider === 'pg'
	? await import('./db.pg')
	: await import('./db.sqlite');

// Typed as the SQLite dialect for static analysis — at runtime the PG dialect is
// structurally identical (same column names/types), so query inference is correct.
export const db = mod.db as BunSQLiteDatabase<typeof SqliteSchema>;
export const sqlite = mod.sqlite as Database | null;
