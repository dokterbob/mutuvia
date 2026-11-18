// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Real-database tests for GET /api/qr-status/[id].
//
// Security regression: this endpoint used to require only `locals.session`
// and return status, counterparty name and amount for ANY payment-request
// id — a logged-in stranger could poll any other user's pending or completed
// payment by guessing/enumerating ids. It now requires `locals.appUser` and
// returns data only if the caller is the initiator or a party to a
// transaction linked to the request; everyone else gets an indistinguishable
// 404.
//
// These deliberately do NOT mock `$lib/server/db` / `$lib/server/schema` —
// the authorization check joins payment_requests to transactions via a
// drizzle `and(... or(...))` combinator, which is exactly the kind of query
// a fully-mocked chain can't exercise faithfully. Run against a real
// in-memory-equivalent (on-disk temp file) bun:sqlite DB instead, migrated
// with the project's actual migrations — same approach as
// settlement.sqlite.test.ts / balance.sqlite.test.ts.

import { describe, test, expect, beforeEach, afterAll, vi } from 'vitest';
import { rmSync } from 'node:fs';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import * as schema from '$lib/server/schema.sqlite';

// Must go through a `$lib/config` mock, not `process.env` — see the longer
// explanation in settlement.sqlite.test.ts. In short: SvelteKit's
// `$env/dynamic/private` snapshots env vars once at Vite startup (from
// `.env.test`), so mutating `process.env` here would have no effect and this
// file would silently share e2e's test.db with any other real-DB test file
// running in the same process.
const { TEST_DB_FILE } = vi.hoisted(() => ({
	TEST_DB_FILE: `.vitest-qr-status-sqlite-${process.pid}.db`
}));

vi.mock('$lib/config', () => ({
	config: { dbFileName: TEST_DB_FILE, dbProvider: 'sqlite', unitCode: 'EUR' }
}));

const { sqlite, db: liveDb } = await import('$lib/server/db.sqlite');
const { GET } = await import('./+server');

function resetSchema() {
	const tables = sqlite!
		.query<
			{ name: string },
			[]
		>(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
		.all();
	sqlite!.exec('PRAGMA foreign_keys = OFF;');
	for (const { name } of tables) {
		sqlite!.exec(`DROP TABLE IF EXISTS "${name}"`);
	}
	sqlite!.exec('PRAGMA foreign_keys = ON;');
	migrate(liveDb, { migrationsFolder: './drizzle/sqlite' });
}

const INITIATOR = 'initiator-1';
const ACCEPTOR = 'acceptor-1';
const PAYER = 'payer-1';
const STRANGER = 'stranger-1';

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

function seedTransaction(
	id: string,
	paymentRequestId: string,
	fromUserId: string,
	toUserId: string
) {
	liveDb
		.insert(schema.transactions)
		.values({
			id,
			fromUserId,
			toUserId,
			amount: 500,
			unitCode: 'EUR',
			paymentRequestId,
			createdAt: new Date()
		})
		.run();
}

type GetEvent = Parameters<typeof GET>[0];

function makeEvent(id: string, appUser: { id: string } | null): GetEvent {
	return {
		params: { id },
		locals: { appUser }
	} as unknown as GetEvent;
}

beforeEach(() => {
	resetSchema();
	seedUser(INITIATOR, 'Initiator');
	seedUser(ACCEPTOR, 'Acceptor');
	seedUser(PAYER, 'Payer');
	seedUser(STRANGER, 'Stranger');
});

afterAll(() => {
	sqlite!.close();
	for (const suffix of ['', '-wal', '-shm']) {
		rmSync(`${TEST_DB_FILE}${suffix}`, { force: true });
	}
});

describe('GET /api/qr-status/[id] — authorization [security]', () => {
	describe('Given no locals.appUser (unauthenticated, or session with no app user)', () => {
		test('When a one-time request exists → still returns 404, never the data', async () => {
			seedOneTimePr('pr-1');

			const res = await GET(makeEvent('pr-1', null));
			const body = await res.json();

			expect(res.status).toBe(404);
			expect(body).toEqual({ error: 'Not found' });
		});
	});

	describe('Given the id does not exist', () => {
		test('When the initiator-shaped caller polls it → returns 404', async () => {
			const res = await GET(makeEvent('no-such-id', { id: INITIATOR }));

			expect(res.status).toBe(404);
		});
	});

	describe('Given an active one-time request with no transaction yet', () => {
		test('When a stranger (not initiator, no linked transaction) polls it → returns 404', async () => {
			seedOneTimePr('pr-2');

			const res = await GET(makeEvent('pr-2', { id: STRANGER }));

			expect(res.status).toBe(404);
		});

		test('When the initiator polls it → returns 200 with the active status', async () => {
			seedOneTimePr('pr-3');

			const res = await GET(makeEvent('pr-3', { id: INITIATOR }));
			const body = await res.json();

			expect(res.status).toBe(200);
			expect(body.status).toBe('active');
		});
	});

	describe('Given a completed one-time request', () => {
		beforeEach(() => {
			seedOneTimePr('pr-4', { status: 'completed' });
			seedTransaction('tx-4', 'pr-4', ACCEPTOR, INITIATOR);
		});

		test('When the initiator polls it → returns 200 with the acceptor as otherName', async () => {
			const res = await GET(makeEvent('pr-4', { id: INITIATOR }));
			const body = await res.json();

			expect(res.status).toBe(200);
			expect(body.status).toBe('completed');
			expect(body.otherName).toBe('Acceptor');
		});

		test('When the acceptor (a party via the linked transaction) polls it → returns 200 with the initiator as otherName', async () => {
			const res = await GET(makeEvent('pr-4', { id: ACCEPTOR }));
			const body = await res.json();

			expect(res.status).toBe(200);
			expect(body.otherName).toBe('Initiator');
		});

		test('[security] When an uninvolved stranger polls it → returns 404, not the completed data', async () => {
			const res = await GET(makeEvent('pr-4', { id: STRANGER }));
			const body = await res.json();

			expect(res.status).toBe(404);
			expect(body).toEqual({ error: 'Not found' });
		});
	});

	describe('Given a reusable request with a payment from one of several payers', () => {
		beforeEach(() => {
			seedReusablePr('pr-5');
			seedTransaction('tx-5', 'pr-5', PAYER, INITIATOR);
		});

		test('When that payer polls it → returns 200 (they are a party via their own transaction)', async () => {
			const res = await GET(makeEvent('pr-5', { id: PAYER }));

			expect(res.status).toBe(200);
		});

		test('[security] When a different, uninvolved user polls it → returns 404', async () => {
			const res = await GET(makeEvent('pr-5', { id: STRANGER }));

			expect(res.status).toBe(404);
		});

		test('When the initiator polls it → returns 200', async () => {
			const res = await GET(makeEvent('pr-5', { id: INITIATOR }));

			expect(res.status).toBe(200);
		});
	});

	// PR #137: a reusable QR can now have a real `expiresAt` (previously
	// always null). An expired reusable QR must report `status: 'expired'`
	// here too, even though its DB `status` column stays 'active' until the
	// owner pauses/archives it — this is the "treat it as expired everywhere
	// it's listed or opened" requirement.
	describe('Given a reusable request whose expiresAt is in the past', () => {
		beforeEach(() => {
			seedReusablePr('pr-6', { expiresAt: new Date(Date.now() - 1000) });
		});

		test("When the initiator polls it → reports status 'expired', not 'active'", async () => {
			const res = await GET(makeEvent('pr-6', { id: INITIATOR }));
			const body = await res.json();

			expect(res.status).toBe(200);
			expect(body.status).toBe('expired');
		});
	});

	// Boundary: expiresAt exactly equal to "now" counts as expired (`<=`,
	// not `<`) — see $lib/server/qr-expiry's isExpired().
	describe('Given a one-time request whose expiresAt is exactly now', () => {
		test("When the initiator polls it → reports status 'expired'", async () => {
			const now = new Date();
			seedOneTimePr('pr-7', { expiresAt: now });

			const res = await GET(makeEvent('pr-7', { id: INITIATOR }));
			const body = await res.json();

			expect(body.status).toBe('expired');
		});
	});

	describe('Given a one-time request whose expiresAt is in the future', () => {
		test("When the initiator polls it → reports status 'active', not 'expired'", async () => {
			seedOneTimePr('pr-8', { expiresAt: new Date(Date.now() + 300_000) });

			const res = await GET(makeEvent('pr-8', { id: INITIATOR }));
			const body = await res.json();

			expect(body.status).toBe('active');
		});
	});
});
