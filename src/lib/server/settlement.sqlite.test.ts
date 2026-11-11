// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Real-database tests for settlement.sqlite.ts.
//
// These deliberately do NOT mock `$lib/server/db` (or drizzle-orm, or the
// schema) — they run every statement against a real in-memory bun:sqlite
// database, migrated with the project's actual migrations. This is the only
// way to catch the original bug: Drizzle's bun-sqlite driver executes
// `db.transaction()` callbacks SYNCHRONOUSLY, so an `async` callback commits
// at its first `await`, running later statements outside any transaction. A
// mocked `db.transaction` that just does `await fn(tx)` can't reproduce that,
// which is exactly why the bug shipped despite existing mocked tests.

import { describe, test, expect, beforeEach, afterAll, vi } from 'vitest';
import { rmSync } from 'node:fs';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import * as schema from './schema.sqlite';
import { eq, and } from 'drizzle-orm';

// settlement.sqlite.ts imports the live singleton from `./db.sqlite`, which
// opens `config.dbFileName` at module load time. We can't inject a db
// instance into it without changing its (intentionally singleton,
// convention-matching) API, so instead we point it at a fresh on-disk temp
// file per test file run, exactly like production does, then rebuild that
// file's schema with the real migrations before each test.
//
// This MUST go through a `$lib/config` mock, not `process.env` — SvelteKit's
// `$env/dynamic/private` snapshots env vars once at Vite startup (from
// `.env.test`, which sets DB_FILE_NAME=test.db for Playwright), so mutating
// `process.env` from inside a test file has no effect on `config.dbFileName`
// and this file would silently share e2e's test.db with any other real-DB
// test file running in the same process — a genuine cross-file race.
const { TEST_DB_FILE } = vi.hoisted(() => ({
	TEST_DB_FILE: `.vitest-settlement-sqlite-${process.pid}.db`
}));

vi.mock('$lib/config', () => ({
	config: {
		dbFileName: TEST_DB_FILE,
		dbProvider: 'sqlite',
		unitCode: 'EUR',
		maxTransactionAmount: 100_000_000
	}
}));

const { sqlite, db: liveDb } = await import('./db.sqlite');
const { settleOneTimeAccept, settleReusable } = await import('./settlement.sqlite');

function resetSchema() {
	// Drop + recreate so every test starts from a clean, fully-migrated DB.
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

const INITIATOR = 'initiator-1';
const ACCEPTOR = 'acceptor-1';
const OTHER = 'other-1';

function seedUser(id: string, displayName: string) {
	const now = new Date();
	liveDb
		.insert(schema.user)
		.values({ id: `auth-${id}`, emailVerified: false, createdAt: now, updatedAt: now })
		.run();
	liveDb
		.insert(schema.appUsers)
		.values({ id, betterAuthUserId: `auth-${id}`, displayName, createdAt: now })
		.run();
}

function seedOneTimePr(
	id: string,
	overrides: Partial<typeof schema.paymentRequests.$inferInsert> = {}
) {
	const now = new Date();
	liveDb
		.insert(schema.paymentRequests)
		.values({
			id,
			initiatingUserId: INITIATOR,
			reusable: false,
			direction: 'send',
			amount: 500,
			status: 'active',
			initiatorName: 'Initiator',
			createdAt: now,
			updatedAt: now,
			...overrides
		})
		.run();
}

function seedReusablePr(
	id: string,
	overrides: Partial<typeof schema.paymentRequests.$inferInsert> = {}
) {
	const now = new Date();
	liveDb
		.insert(schema.paymentRequests)
		.values({
			id,
			initiatingUserId: INITIATOR,
			reusable: true,
			direction: 'receive',
			amount: null,
			status: 'active',
			initiatorName: 'Initiator',
			createdAt: now,
			updatedAt: now,
			totalReceived: 0,
			paymentCount: 0,
			...overrides
		})
		.run();
}

function getPr(id: string) {
	return liveDb
		.select()
		.from(schema.paymentRequests)
		.where(eq(schema.paymentRequests.id, id))
		.get();
}

function countTransactions(paymentRequestId: string): number {
	const rows = liveDb
		.select()
		.from(schema.transactions)
		.where(eq(schema.transactions.paymentRequestId, paymentRequestId))
		.all();
	return rows.length;
}

beforeEach(() => {
	resetSchema();
	seedUser(INITIATOR, 'Initiator');
	seedUser(ACCEPTOR, 'Acceptor');
	seedUser(OTHER, 'Other');
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

describe('settleOneTimeAccept — real SQLite transaction', () => {
	describe('Given an active one-time payment request', () => {
		test('When accepted → returns ok:true and inserts exactly one ledger row', () => {
			seedOneTimePr('pr-1');

			const result = settleOneTimeAccept('pr-1', ACCEPTOR);

			expect(result).toMatchObject({ ok: true });
			expect(countTransactions('pr-1')).toBe(1);
			expect(getPr('pr-1')?.status).toBe('completed');
		});

		test('When accepted twice (race) → exactly one ledger row and one failure', () => {
			seedOneTimePr('pr-2');

			const first = settleOneTimeAccept('pr-2', ACCEPTOR);
			const second = settleOneTimeAccept('pr-2', OTHER);

			expect(first.ok).toBe(true);
			expect(second.ok).toBe(false);
			expect(countTransactions('pr-2')).toBe(1);
			expect(getPr('pr-2')?.status).toBe('completed');
		});
	});

	describe('Given a decline already won the race', () => {
		test('When accept is attempted afterwards → fails, no ledger row, status stays declined', () => {
			seedOneTimePr('pr-3');
			// Emulates the decline action's own atomic conditional UPDATE
			// (+page.server.ts `decline`), which is unchanged by this PR.
			liveDb
				.update(schema.paymentRequests)
				.set({ status: 'declined' })
				.where(eq(schema.paymentRequests.id, 'pr-3'))
				.run();

			const result = settleOneTimeAccept('pr-3', ACCEPTOR);

			expect(result.ok).toBe(false);
			expect(countTransactions('pr-3')).toBe(0);
			expect(getPr('pr-3')?.status).toBe('declined');
		});
	});

	describe('Given accept already won the race', () => {
		test('When a decline-style conditional update is attempted afterwards → status stays completed, ledger row untouched', () => {
			seedOneTimePr('pr-4');
			const accepted = settleOneTimeAccept('pr-4', ACCEPTOR);
			expect(accepted.ok).toBe(true);

			// Same WHERE guard as the decline action (+page.server.ts `decline`,
			// unchanged by this PR): status='active' AND reusable=false. Since the
			// row is already 'completed', this guard matches zero rows — the
			// decline is a no-op.
			liveDb
				.update(schema.paymentRequests)
				.set({ status: 'declined' })
				.where(
					and(
						eq(schema.paymentRequests.id, 'pr-4'),
						eq(schema.paymentRequests.status, 'active'),
						eq(schema.paymentRequests.reusable, false)
					)
				)
				.run();

			// Invariant that matters: never both a ledger row AND a non-completed
			// status.
			expect(getPr('pr-4')?.status).toBe('completed');
			expect(countTransactions('pr-4')).toBe(1);
		});
	});

	describe('Given an expired one-time payment request', () => {
		test('When accepted → fails and writes nothing', () => {
			seedOneTimePr('pr-5', { expiresAt: new Date(Date.now() - 1000) });

			const result = settleOneTimeAccept('pr-5', ACCEPTOR);

			expect(result.ok).toBe(false);
			expect(countTransactions('pr-5')).toBe(0);
		});

		// Boundary: expiresAt exactly equal to "now" counts as expired (the
		// claim's SQL condition is `expiresAt IS NULL OR expiresAt > now`, so
		// equality fails the claim) — see $lib/server/qr-expiry's isExpired(),
		// which every other expiry check in the app now shares.
		test('When expiresAt is exactly now → still fails (the <= boundary, not <)', () => {
			seedOneTimePr('pr-5b', { expiresAt: new Date() });

			const result = settleOneTimeAccept('pr-5b', ACCEPTOR);

			expect(result.ok).toBe(false);
			expect(countTransactions('pr-5b')).toBe(0);
		});
	});

	describe('Given the accepting user is the initiator (self-payment)', () => {
		test('When accepted → fails cleanly without writing a ledger row, even though the route already refuses this first', () => {
			seedOneTimePr('pr-self', { initiatingUserId: INITIATOR });

			const result = settleOneTimeAccept('pr-self', INITIATOR);

			expect(result).toMatchObject({ ok: false, status: 400 });
			expect(countTransactions('pr-self')).toBe(0);
			// The claim never ran, so the request is still claimable afterwards.
			expect(getPr('pr-self')?.status).toBe('active');
		});
	});

	describe('Given the request has an amount above the configured sanity bound', () => {
		test('When accepted → fails cleanly instead of throwing a CHECK-constraint error', () => {
			// Only the app-level max (config.maxTransactionAmount), not the DB's
			// `amount > 0` CHECK, bounds this value — so seeding it directly is a
			// legitimate way to simulate data that predates a lowered max, or any
			// future caller that bypasses parseAmount().
			seedOneTimePr('pr-over-max', { amount: 100_000_001 });

			const result = settleOneTimeAccept('pr-over-max', ACCEPTOR);

			expect(result).toMatchObject({ ok: false, status: 400 });
			expect(countTransactions('pr-over-max')).toBe(0);
			expect(getPr('pr-over-max')?.status).toBe('active');
		});
	});

	describe('Given a receive-direction request', () => {
		test('When accepted → ledger row has the scanner as fromUserId', () => {
			seedOneTimePr('pr-6', { direction: 'receive' });

			settleOneTimeAccept('pr-6', ACCEPTOR);

			const [row] = liveDb
				.select()
				.from(schema.transactions)
				.where(eq(schema.transactions.paymentRequestId, 'pr-6'))
				.all();
			expect(row.fromUserId).toBe(ACCEPTOR);
			expect(row.toUserId).toBe(INITIATOR);
		});

		test('When accepted → upserts a connection between the two parties', () => {
			seedOneTimePr('pr-7', { direction: 'receive' });

			settleOneTimeAccept('pr-7', ACCEPTOR);

			const rows = liveDb.select().from(schema.connections).all();
			expect(rows).toHaveLength(1);
		});
	});
});

describe('settleReusable — real SQLite transaction', () => {
	describe('Given an active reusable payment request', () => {
		test('When settled → increments totalReceived/paymentCount and inserts a ledger row', () => {
			seedReusablePr('rpr-1');

			const result = settleReusable('rpr-1', ACCEPTOR, 1000);

			expect(result).toMatchObject({ ok: true });
			const pr = getPr('rpr-1');
			expect(pr?.totalReceived).toBe(1000);
			expect(pr?.paymentCount).toBe(1);
			expect(countTransactions('rpr-1')).toBe(1);
		});

		test('When settled twice → counters reflect both payments', () => {
			seedReusablePr('rpr-2');

			settleReusable('rpr-2', ACCEPTOR, 300);
			settleReusable('rpr-2', OTHER, 200);

			const pr = getPr('rpr-2');
			expect(pr?.totalReceived).toBe(500);
			expect(pr?.paymentCount).toBe(2);
			expect(countTransactions('rpr-2')).toBe(2);
		});
	});

	describe('Given the request is paused between read and claim', () => {
		test('When settled → fails without writing a ledger row or touching counters', () => {
			seedReusablePr('rpr-3', { status: 'paused' });

			const result = settleReusable('rpr-3', ACCEPTOR, 1000);

			expect(result.ok).toBe(false);
			expect(countTransactions('rpr-3')).toBe(0);
			expect(getPr('rpr-3')?.totalReceived).toBe(0);
		});
	});

	// Reusable QRs can now have a real `expiresAt` (previously always null)
	// — see $lib/server/qr-expiry. `status` on the row stays 'active' even
	// after it expires (nothing auto-transitions it), so this must come from
	// the `isExpired()` check, not the `status` column.
	describe('Given an expired reusable payment request', () => {
		test('When settled → fails with 410 and touches no counters or ledger', () => {
			seedReusablePr('rpr-expired', { expiresAt: new Date(Date.now() - 1000) });

			const result = settleReusable('rpr-expired', ACCEPTOR, 1000);

			expect(result).toMatchObject({ ok: false, status: 410 });
			expect(countTransactions('rpr-expired')).toBe(0);
			expect(getPr('rpr-expired')?.totalReceived).toBe(0);
		});
	});

	describe('Given the ledger insert fails after the counter claim already succeeded', () => {
		test('When settled → the whole transaction rolls back (counters stay unchanged, no ledger row)', () => {
			seedReusablePr('rpr-4');

			// Force the ledger INSERT (which runs strictly after the counter-update
			// claim inside the same transaction) to fail, via a trigger that aborts
			// whenever a transaction row references this specific payment request.
			// This demonstrates real rollback on SQLite: without the fix (the old
			// `async` callback, which commits before any statement runs for real),
			// there would be no transaction to roll back and partial writes could
			// persist; with the fix, the prior counter increment is undone too.
			sqlite.exec(`
				CREATE TRIGGER force_ledger_insert_failure
				BEFORE INSERT ON transactions
				WHEN NEW.payment_request_id = 'rpr-4'
				BEGIN
					SELECT RAISE(ABORT, 'forced ledger insert failure for test');
				END;
			`);

			expect(() => settleReusable('rpr-4', ACCEPTOR, 1000)).toThrow();

			expect(countTransactions('rpr-4')).toBe(0);
			const pr = getPr('rpr-4');
			expect(pr?.totalReceived).toBe(0);
			expect(pr?.paymentCount).toBe(0);
		});
	});

	describe('Given amount is invalid', () => {
		test('When settled with amount 0 → fails before touching the database', () => {
			seedReusablePr('rpr-5');

			const result = settleReusable('rpr-5', ACCEPTOR, 0);

			expect(result).toMatchObject({ ok: false, status: 400 });
		});

		test('When settled with a negative amount → fails before touching the database', () => {
			seedReusablePr('rpr-6');

			const result = settleReusable('rpr-6', ACCEPTOR, -100);

			expect(result).toMatchObject({ ok: false, status: 400 });
			expect(countTransactions('rpr-6')).toBe(0);
		});

		test('When settled with a non-integer amount → fails before touching the database', () => {
			seedReusablePr('rpr-7');

			const result = settleReusable('rpr-7', ACCEPTOR, 10.5);

			expect(result).toMatchObject({ ok: false, status: 400 });
			expect(countTransactions('rpr-7')).toBe(0);
		});

		test('When settled with an amount above the configured sanity bound → fails before touching the database', () => {
			seedReusablePr('rpr-8');

			const result = settleReusable('rpr-8', ACCEPTOR, 100_000_001);

			expect(result).toMatchObject({ ok: false, status: 400 });
			expect(countTransactions('rpr-8')).toBe(0);
			expect(getPr('rpr-8')?.totalReceived).toBe(0);
		});
	});
});

describe('transactions CHECK constraints — real SQLite transaction', () => {
	describe('Given a direct insert with a non-positive amount', () => {
		test('When amount is negative → the insert is rejected', () => {
			seedOneTimePr('pr-check-neg');

			expect(() =>
				liveDb
					.insert(schema.transactions)
					.values({
						id: 'tx-check-neg',
						fromUserId: ACCEPTOR,
						toUserId: INITIATOR,
						amount: -500,
						unitCode: 'EUR',
						createdAt: new Date()
					})
					.run()
			).toThrow(/CHECK constraint failed/);

			expect(countTransactions('pr-check-neg')).toBe(0);
		});

		test('When amount is zero → the insert is rejected', () => {
			expect(() =>
				liveDb
					.insert(schema.transactions)
					.values({
						id: 'tx-check-zero',
						fromUserId: ACCEPTOR,
						toUserId: INITIATOR,
						amount: 0,
						unitCode: 'EUR',
						createdAt: new Date()
					})
					.run()
			).toThrow(/CHECK constraint failed/);
		});
	});

	describe('Given a direct insert where fromUserId equals toUserId', () => {
		test('When the two user ids match → the insert is rejected', () => {
			expect(() =>
				liveDb
					.insert(schema.transactions)
					.values({
						id: 'tx-check-self',
						fromUserId: ACCEPTOR,
						toUserId: ACCEPTOR,
						amount: 500,
						unitCode: 'EUR',
						createdAt: new Date()
					})
					.run()
			).toThrow(/CHECK constraint failed/);
		});
	});
});

describe('payment_requests CHECK constraint — real SQLite transaction', () => {
	describe('Given a direct insert with a non-positive amount', () => {
		test('When amount is negative → the insert is rejected', () => {
			expect(() => seedOneTimePr('pr-check-neg-amount', { amount: -1 })).toThrow(
				/CHECK constraint failed/
			);
		});

		test('When amount is zero → the insert is rejected', () => {
			expect(() => seedOneTimePr('pr-check-zero-amount', { amount: 0 })).toThrow(
				/CHECK constraint failed/
			);
		});
	});

	describe('Given a direct insert with a null amount (open-amount reusable request)', () => {
		test('When amount is null → the insert succeeds', () => {
			expect(() => seedReusablePr('pr-check-null-amount', { amount: null })).not.toThrow();
		});
	});
});
