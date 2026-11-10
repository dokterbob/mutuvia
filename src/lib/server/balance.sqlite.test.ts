// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Real-database test for upsertConnection. This deliberately does NOT mock
// `$lib/server/db` — the bug was a select-then-insert race on the
// (userAId, userBId) composite primary key, which a mocked db chain can't
// reproduce. `balance.test.ts` keeps the fully-mocked unit tests for the
// read-only query functions in this module.

import { describe, test, expect, beforeEach, afterAll, vi } from 'vitest';
import { rmSync } from 'node:fs';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import * as schema from './schema.sqlite';

// Must go through a `$lib/config` mock, not `process.env` — see the longer
// explanation in settlement.sqlite.test.ts. In short: SvelteKit's
// `$env/dynamic/private` snapshots env vars once at Vite startup (from
// `.env.test`, which sets DB_FILE_NAME=test.db for Playwright), so mutating
// `process.env` here would have no effect and this file would silently share
// e2e's test.db with any other real-DB test file running in the same process.
const { TEST_DB_FILE } = vi.hoisted(() => ({
	TEST_DB_FILE: `.vitest-balance-sqlite-${process.pid}.db`
}));

vi.mock('$lib/config', () => ({
	config: { dbFileName: TEST_DB_FILE, dbProvider: 'sqlite' }
}));

const { sqlite, db: liveDb } = await import('./db.sqlite');
const { upsertConnection } = await import('./balance');

function resetSchema() {
	const tables = sqlite
		.query<
			{ name: string },
			[]
		>(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
		.all();
	sqlite.exec('PRAGMA foreign_keys = OFF;');
	for (const { name } of tables) {
		sqlite.exec(`DROP TABLE IF EXISTS "${name}"`);
	}
	sqlite.exec('PRAGMA foreign_keys = ON;');
	migrate(liveDb, { migrationsFolder: './drizzle/sqlite' });
}

function seedUser(id: string) {
	const now = new Date();
	liveDb
		.insert(schema.user)
		.values({ id: `auth-${id}`, emailVerified: false, createdAt: now, updatedAt: now })
		.run();
	liveDb
		.insert(schema.appUsers)
		.values({ id, betterAuthUserId: `auth-${id}`, displayName: id, createdAt: now })
		.run();
}

beforeEach(() => {
	resetSchema();
	seedUser('user-a');
	seedUser('user-b');
});

afterAll(() => {
	// Close before unlinking: deleting a WAL-mode DB's file (or its -shm
	// mmap'd file) while the connection is still open corrupts it (SQLITE_IOERR
	// on the next statement) — that's why this is afterAll, not afterEach.
	sqlite.close();
	for (const suffix of ['', '-wal', '-shm']) {
		rmSync(`${TEST_DB_FILE}${suffix}`, { force: true });
	}
});

describe('upsertConnection — real SQLite', () => {
	test('Given no existing connection, When called → inserts exactly one row', async () => {
		await upsertConnection('user-a', 'user-b');

		const rows = liveDb.select().from(schema.connections).all();
		expect(rows).toHaveLength(1);
	});

	test('Given the pair already connected, When called again → does not throw and stays one row', async () => {
		await upsertConnection('user-a', 'user-b');

		await expect(upsertConnection('user-b', 'user-a')).resolves.toBeUndefined();

		const rows = liveDb.select().from(schema.connections).all();
		expect(rows).toHaveLength(1);
	});

	test('Given concurrent calls for the same pair, When awaited together → neither throws and exactly one row exists', async () => {
		const results = await Promise.allSettled([
			upsertConnection('user-a', 'user-b'),
			upsertConnection('user-a', 'user-b'),
			upsertConnection('user-b', 'user-a')
		]);

		expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
		const rows = liveDb.select().from(schema.connections).all();
		expect(rows).toHaveLength(1);
	});
});
