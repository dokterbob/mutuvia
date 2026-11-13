// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Real-database tests for otp-throttle.sqlite.ts — see settlement.sqlite.test.ts
// for why this goes through a real on-disk bun:sqlite DB (migrated with the
// project's actual migrations) rather than mocking the DB layer.

import { describe, test, expect, beforeEach, afterAll, vi } from 'vitest';
import { rmSync } from 'node:fs';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import * as schema from './schema.sqlite';
import { eq } from 'drizzle-orm';

const { TEST_DB_FILE } = vi.hoisted(() => ({
	TEST_DB_FILE: `.vitest-otp-throttle-sqlite-${process.pid}.db`
}));

vi.mock('$lib/config', () => ({
	config: { dbFileName: TEST_DB_FILE, dbProvider: 'sqlite' }
}));

const { sqlite, db: liveDb } = await import('./db.sqlite');
const { checkAndRecordOtpSend, checkOtpSend } = await import('./otp-throttle.sqlite');

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

function seedAttempt(destination: string, ageMs: number) {
	liveDb
		.insert(schema.otpThrottle)
		.values({
			id: crypto.randomUUID(),
			destination,
			createdAt: new Date(Date.now() - ageMs)
		})
		.run();
}

function countRows(destination: string): number {
	return liveDb
		.select()
		.from(schema.otpThrottle)
		.where(eq(schema.otpThrottle.destination, destination))
		.all().length;
}

beforeEach(() => {
	resetSchema();
});

afterAll(() => {
	sqlite.close();
	for (const suffix of ['', '-wal', '-shm']) {
		rmSync(`${TEST_DB_FILE}${suffix}`, { force: true });
	}
});

describe('checkAndRecordOtpSend — real SQLite transaction', () => {
	describe('Given no prior sends to a destination', () => {
		test('When sent, then it is allowed and recorded', () => {
			const result = checkAndRecordOtpSend('+15550001111');
			expect(result).toEqual({ ok: true });
			expect(countRows('+15550001111')).toBe(1);
		});
	});

	describe('Given 3 sends already within the last 10 minutes', () => {
		test('When a 4th is attempted, then it is throttled with a positive retryAfterSeconds, and nothing extra is recorded', () => {
			const dest = 'abuser@example.com';
			seedAttempt(dest, 1_000);
			seedAttempt(dest, 2_000);
			seedAttempt(dest, 3_000);

			const result = checkAndRecordOtpSend(dest);

			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.retryAfterSeconds).toBeGreaterThan(0);
			expect(countRows(dest)).toBe(3);
		});
	});

	describe('Given 3 sends more than 10 minutes ago', () => {
		test('When another is attempted, then the short window has reset and it is allowed', () => {
			const dest = 'ok-again@example.com';
			const elevenMinutes = 11 * 60 * 1000;
			seedAttempt(dest, elevenMinutes);
			seedAttempt(dest, elevenMinutes + 1000);
			seedAttempt(dest, elevenMinutes + 2000);

			const result = checkAndRecordOtpSend(dest);

			expect(result).toEqual({ ok: true });
			expect(countRows(dest)).toBe(4);
		});
	});

	describe('Given 10 sends spread across the day (short window clear each time)', () => {
		test('When an 11th is attempted, then the daily cap still throttles it', () => {
			const dest = 'daily-cap@example.com';
			// 10 sends, each > 10 minutes apart so the short window never trips,
			// all within the last 24 hours.
			for (let i = 0; i < 10; i++) {
				seedAttempt(dest, (i + 1) * 20 * 60 * 1000); // 20, 40, 60, ... minutes ago
			}

			const result = checkAndRecordOtpSend(dest);

			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.retryAfterSeconds).toBeGreaterThan(0);
			expect(countRows(dest)).toBe(10);
		});
	});

	describe('Given a send older than 24 hours for a destination', () => {
		test('When another destination attempt is made, then the stale row is pruned and does not count', () => {
			const dest = 'prune-me@example.com';
			const twoDaysAgo = 2 * 24 * 60 * 60 * 1000;
			seedAttempt(dest, twoDaysAgo);

			const result = checkAndRecordOtpSend(dest);

			expect(result).toEqual({ ok: true });
			// The stale row was pruned; only the fresh one from this call remains.
			expect(countRows(dest)).toBe(1);
		});
	});

	describe('Given two different destinations', () => {
		test('When both send near their limits, then one destination never affects the other', () => {
			seedAttempt('a@example.com', 1000);
			seedAttempt('a@example.com', 2000);
			seedAttempt('a@example.com', 3000);

			const resultA = checkAndRecordOtpSend('a@example.com');
			const resultB = checkAndRecordOtpSend('b@example.com');

			expect(resultA.ok).toBe(false);
			expect(resultB.ok).toBe(true);
		});
	});

	describe('Given a stale row (>24h) for a destination that is never sent to again', () => {
		test('When a send happens for an unrelated, different destination, then the stale row is globally pruned', () => {
			const staleDest = 'one-off-stale@example.com';
			const twoDaysAgo = 2 * 24 * 60 * 60 * 1000;
			seedAttempt(staleDest, twoDaysAgo);

			const result = checkAndRecordOtpSend('unrelated-fresh@example.com');

			expect(result).toEqual({ ok: true });
			// The prune must not be scoped to the current request's destination —
			// otherwise a destination used once and never again keeps its row
			// forever, growing the table without bound.
			expect(countRows(staleDest)).toBe(0);
		});
	});

	describe('Given a non-expired row for a different destination', () => {
		test('When a send happens for an unrelated destination, then the non-expired row is kept', () => {
			const otherDest = 'still-fresh-other@example.com';
			seedAttempt(otherDest, 1_000);

			const result = checkAndRecordOtpSend('unrelated-fresh-2@example.com');

			expect(result).toEqual({ ok: true });
			expect(countRows(otherDest)).toBe(1);
		});
	});
});

describe('checkOtpSend — read-only pre-check', () => {
	describe('Given a destination under its limits', () => {
		test('When checked, then it is allowed and nothing is recorded', () => {
			seedAttempt('+15550100001', 60_000);

			expect(checkOtpSend('+15550100001')).toEqual({ ok: true });
			expect(countRows('+15550100001')).toBe(1);
		});
	});

	describe('Given 3 sends within the last 10 minutes', () => {
		test('When checked, then it reports the same throttle as checkAndRecordOtpSend would', () => {
			for (let i = 0; i < 3; i++) seedAttempt('+15550100002', 60_000);

			const result = checkOtpSend('+15550100002');

			expect(result.ok).toBe(false);
			expect(result.ok === false && result.retryAfterSeconds).toBeGreaterThan(0);
			expect(countRows('+15550100002')).toBe(3);
		});
	});

	describe('Given 10 unpruned sends that are all older than 24 hours', () => {
		test('When checked, then they are ignored, matching a pruned table', () => {
			for (let i = 0; i < 10; i++) seedAttempt('+15550100003', 25 * 60 * 60 * 1000);

			expect(checkOtpSend('+15550100003')).toEqual({ ok: true });
		});
	});
});
