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

import { eq, lt, sql } from 'drizzle-orm';
import { db } from './db.pg';
import { otpThrottle } from './schema.pg';
import { LONG_WINDOW_MS, evaluateThrottle } from './otp-throttle-types';
import type { ThrottleResult } from './otp-throttle-types';

/**
 * Read-only pre-check — see otp-throttle.sqlite.ts's `checkOtpSend`. Takes no
 * advisory lock: it records nothing, and the authoritative decision is the
 * locked `checkAndRecordOtpSend` at send time.
 */
export async function checkOtpSend(destination: string): Promise<ThrottleResult> {
	const rows = await db.select().from(otpThrottle).where(eq(otpThrottle.destination, destination));
	return evaluateThrottle(rows, Date.now());
}

export async function checkAndRecordOtpSend(destination: string): Promise<ThrottleResult> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${destination}))`);

		const now = Date.now();
		const longWindowStart = new Date(now - LONG_WINDOW_MS);

		// Prune opportunistically, globally — not scoped to `destination`. See
		// otp-throttle.sqlite.ts for why: a one-off destination must not keep
		// its rows forever. This delete is unguarded by the advisory lock
		// above (that lock only serializes concurrent checks for the SAME
		// destination) and runs against every row, not just this
		// destination's — but it is still just a DELETE on rows older than
		// the long window, which PostgreSQL only ever needs row-level locks
		// for; it does not acquire a table-level lock and does not read or
		// lock rows it isn't deleting, so it cannot deadlock against, or
		// cause a serialization failure for, a concurrent transaction working
		// a different destination (no shared lock scope, no shared rows once
		// expired). Two concurrent prunes can both try to delete the same
		// already-expired row — one simply deletes 0 rows, not an error.
		await tx.delete(otpThrottle).where(lt(otpThrottle.createdAt, longWindowStart));

		const rows = await tx
			.select()
			.from(otpThrottle)
			.where(eq(otpThrottle.destination, destination));

		const result = evaluateThrottle(rows, now);
		if (!result.ok) return result;

		await tx
			.insert(otpThrottle)
			.values({ id: crypto.randomUUID(), destination, createdAt: new Date(now) });

		return { ok: true } as const;
	});
}
