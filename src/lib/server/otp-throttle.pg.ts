// SPDX-License-Identifier: AGPL-3.0-or-later
//
// PostgreSQL per-destination OTP throttle.
//
// Unlike settlement.pg.ts's claims (a single conditional UPDATE), this check
// is "count rows across a table, then decide" — under PostgreSQL's default
// READ COMMITTED isolation, two concurrent transactions for the SAME
// destination could each count the other's not-yet-committed insert as
// absent, both conclude they're under the limit, and both insert — exactly
// the race the per-destination throttle must not have. A transaction-scoped
// advisory lock keyed by the destination (`pg_advisory_xact_lock`, held
// until COMMIT/ROLLBACK and released automatically either way) serializes
// concurrent checks for that one destination — the same effect bun:sqlite's
// single writer gives otp-throttle.sqlite.ts for free — without blocking
// unrelated destinations against each other.
//
// `hashtext()` can collide (it's a 32-bit hash), which would serialize two
// *different* destinations against each other on an unlucky hash collision
// — a availability nit (occasionally stricter throttling), never a
// correctness problem, since the lock only ever makes this MORE strict, not
// less.

import { eq, and, lt, sql } from 'drizzle-orm';
import { db } from './db.pg';
import { otpThrottle } from './schema.pg';
import {
	SHORT_WINDOW_MS,
	SHORT_WINDOW_MAX,
	LONG_WINDOW_MS,
	LONG_WINDOW_MAX
} from './otp-throttle-types';
import type { ThrottleResult } from './otp-throttle-types';

export async function checkAndRecordOtpSend(destination: string): Promise<ThrottleResult> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${destination}))`);

		const now = Date.now();
		const longWindowStart = new Date(now - LONG_WINDOW_MS);

		await tx
			.delete(otpThrottle)
			.where(
				and(eq(otpThrottle.destination, destination), lt(otpThrottle.createdAt, longWindowStart))
			);

		const rows = await tx
			.select()
			.from(otpThrottle)
			.where(eq(otpThrottle.destination, destination));

		if (rows.length >= LONG_WINDOW_MAX) {
			const oldest = rows.reduce((a, b) => (a.createdAt < b.createdAt ? a : b));
			return {
				ok: false,
				retryAfterSeconds: retryAfter(oldest.createdAt.getTime(), LONG_WINDOW_MS, now)
			} as const;
		}

		const shortWindowStart = now - SHORT_WINDOW_MS;
		const recent = rows.filter((r) => r.createdAt.getTime() >= shortWindowStart);
		if (recent.length >= SHORT_WINDOW_MAX) {
			const oldest = recent.reduce((a, b) => (a.createdAt < b.createdAt ? a : b));
			return {
				ok: false,
				retryAfterSeconds: retryAfter(oldest.createdAt.getTime(), SHORT_WINDOW_MS, now)
			} as const;
		}

		await tx
			.insert(otpThrottle)
			.values({ id: crypto.randomUUID(), destination, createdAt: new Date(now) });

		return { ok: true } as const;
	});
}

function retryAfter(oldestMs: number, windowMs: number, now: number): number {
	return Math.max(1, Math.ceil((oldestMs + windowMs - now) / 1000));
}
