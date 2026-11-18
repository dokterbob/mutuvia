// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Verifies the unique-index migration (drizzle/sqlite/0009_*.sql) against a
// real SQLite database: it must fail loudly when pre-existing duplicate
// `user.phone_number`/`user.email` data would violate the new constraint,
// and must succeed on realistic clean data — including many users with a
// NULL phone number (SQLite treats NULLs as mutually distinct under a
// UNIQUE index, so any number of phone-less users must coexist fine).

import { describe, test, expect, afterEach, afterAll, vi } from 'vitest';
import { mkdtempSync, rmSync, cpSync, readdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { eq } from 'drizzle-orm';
import * as schema from './schema.sqlite';

const { TEST_DB_FILE } = vi.hoisted(() => ({
	TEST_DB_FILE: `.vitest-schema-sqlite-${process.pid}.db`
}));

vi.mock('$lib/config', () => ({
	config: { dbFileName: TEST_DB_FILE, dbProvider: 'sqlite' }
}));

const { sqlite, db: liveDb } = await import('./db.sqlite');

const MIGRATIONS_DIR = './drizzle/sqlite';
const NEW_MIGRATION_TAG = '0009_clumsy_typhoid_mary';

/**
 * Builds a temp migrations folder truncated to just BEFORE the new
 * unique-index migration — i.e. everything up to it, but not it or anything
 * after it (later migrations, like the rate-limit/OTP-throttle tables added
 * after this one, must not leak into the "previous migration" baseline, or
 * re-applying the FULL folder afterwards gets confused about what's already
 * applied). Reproduces "a database at the previous migration" without
 * hand-maintaining a second fixture that would drift from the real
 * migration history.
 */
function migrationsFolderWithoutNewMigration(): string {
	const dir = mkdtempSync(path.join(tmpdir(), 'mutuvia-migrations-'));
	cpSync(MIGRATIONS_DIR, dir, { recursive: true });

	const journalPath = path.join(dir, 'meta', '_journal.json');
	const journal = JSON.parse(readFileSync(journalPath, 'utf-8'));
	const cutoffIdx = journal.entries.findIndex((e: { tag: string }) => e.tag === NEW_MIGRATION_TAG);
	if (cutoffIdx === -1)
		throw new Error(`Migration tag "${NEW_MIGRATION_TAG}" not found in journal`);
	const dropped = journal.entries.slice(cutoffIdx);
	journal.entries = journal.entries.slice(0, cutoffIdx);
	writeFileSync(journalPath, JSON.stringify(journal));

	for (const file of readdirSync(dir)) {
		if (dropped.some((e: { tag: string }) => file.startsWith(e.tag))) rmSync(path.join(dir, file));
	}
	return dir;
}

function resetToSchema(migrationsFolder: string) {
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
	migrate(liveDb, { migrationsFolder });
}

function insertUser(id: string, email: string | null, phoneNumber: string | null) {
	const now = new Date();
	liveDb
		.insert(schema.user)
		.values({ id, email, phoneNumber, emailVerified: false, createdAt: now, updatedAt: now })
		.run();
}

const tempDirs: string[] = [];
afterEach(() => {
	for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

afterAll(() => {
	sqlite.close();
	for (const suffix of ['', '-wal', '-shm']) {
		rmSync(`${TEST_DB_FILE}${suffix}`, { force: true });
	}
});

describe('unique-index migration (drizzle/sqlite/0009_*) — real SQLite database', () => {
	describe('Given the database already has duplicate phone numbers before the migration runs', () => {
		test('When the migration is applied, then it fails loudly instead of silently dropping or merging rows', () => {
			const preMigrationFolder = migrationsFolderWithoutNewMigration();
			tempDirs.push(preMigrationFolder);
			resetToSchema(preMigrationFolder);

			insertUser('u1', 'one@example.com', '+15550001111');
			insertUser('u2', 'two@example.com', '+15550001111'); // duplicate phone

			// drizzle-orm's migrator wraps the underlying SQLite error in its own
			// "Failed to run the query '<sql>'" message — assert on the
			// statement it failed on rather than the inner SQLite message text.
			expect(() => migrate(liveDb, { migrationsFolder: MIGRATIONS_DIR })).toThrow(
				/CREATE UNIQUE INDEX `user_phone_number_idx`/
			);

			// Neither row was touched — the migration must not merge/delete data.
			const rows = liveDb.select().from(schema.user).all();
			expect(rows).toHaveLength(2);
		});
	});

	describe('Given the database already has duplicate emails before the migration runs', () => {
		test('When the migration is applied, then it fails loudly', () => {
			const preMigrationFolder = migrationsFolderWithoutNewMigration();
			tempDirs.push(preMigrationFolder);
			resetToSchema(preMigrationFolder);

			insertUser('u1', 'dup@example.com', null);
			insertUser('u2', 'dup@example.com', null); // duplicate email

			expect(() => migrate(liveDb, { migrationsFolder: MIGRATIONS_DIR })).toThrow(
				/CREATE UNIQUE INDEX `user_email_idx`/
			);

			const rows = liveDb.select().from(schema.user).all();
			expect(rows).toHaveLength(2);
		});
	});

	describe('Given realistic clean data with many users sharing a NULL phone number', () => {
		test('When the migration is applied, then it succeeds — NULLs never conflict with each other', () => {
			const preMigrationFolder = migrationsFolderWithoutNewMigration();
			tempDirs.push(preMigrationFolder);
			resetToSchema(preMigrationFolder);

			// Email-first users: verified real email, no phone number yet.
			insertUser('u1', 'alice@example.com', null);
			insertUser('u2', 'bob@example.com', null);
			// Phone-first user: synthetic placeholder email, verified phone.
			insertUser('u3', '15550009999@phone.placeholder', '+15550009999');

			expect(() => migrate(liveDb, { migrationsFolder: MIGRATIONS_DIR })).not.toThrow();

			const rows = liveDb.select().from(schema.user).all();
			expect(rows).toHaveLength(3);

			// The index is genuinely enforced going forward, not just created
			// successfully and then inert.
			expect(() =>
				liveDb
					.insert(schema.user)
					.values({
						id: 'u4',
						email: 'alice@example.com',
						emailVerified: false,
						createdAt: new Date(),
						updatedAt: new Date()
					})
					.run()
			).toThrow(/UNIQUE constraint failed/);

			// But a second NULL-phone user inserted AFTER the migration is fine.
			expect(() => insertUser('u5', 'carol@example.com', null)).not.toThrow();

			const [phoneRow] = liveDb.select().from(schema.user).where(eq(schema.user.id, 'u3')).all();
			expect(phoneRow.phoneNumber).toBe('+15550009999');
		});
	});
});
