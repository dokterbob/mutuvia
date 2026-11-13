// SPDX-License-Identifier: AGPL-3.0-or-later
//
// SQLite per-destination OTP throttle. Uses the same synchronous
// `db.transaction(fn, { behavior: 'immediate' })` pattern as settlement.sqlite.ts
// (see that file's header comment for why the callback must be synchronous,
// not `async`) — an immediate transaction takes bun:sqlite's single write
// lock up front, which alone is enough to serialize two concurrent throttle
// checks for the same (or any other) destination: the prune, count, and
// insert below all run as one indivisible unit.

import { eq, lt } from 'drizzle-orm';
import { db } from './db.sqlite';
import { otpThrottle } from './schema.sqlite';
import { LONG_WINDOW_MS, evaluateThrottle } from './otp-throttle-types';
import type { ThrottleResult } from './otp-throttle-types';

/**
 * Read-only: would one more send to `destination` be allowed right now?
 * Records nothing. Used as a fast pre-check that can still turn into a 429
 * for the client; the authoritative, atomic decision is
 * `checkAndRecordOtpSend`, made only when an OTP is actually about to go out.
 */
export function checkOtpSend(destination: string): ThrottleResult {
	const rows = db.select().from(otpThrottle).where(eq(otpThrottle.destination, destination)).all();
	return evaluateThrottle(rows, Date.now());
}

export function checkAndRecordOtpSend(destination: string): ThrottleResult {
	return db.transaction(
		(tx) => {
			const now = Date.now();
			const longWindowStart = new Date(now - LONG_WINDOW_MS);

			// Prune opportunistically, globally — not scoped to `destination`.
			// Nothing outside the longer window is ever consulted again for ANY
			// destination, so a one-off destination (sent to once, never again)
			// must not keep its rows forever; scoping the delete to the current
			// destination would let exactly that happen, growing the table
			// without bound. This is a full-table scan (the only index on this
			// table is `(destination, createdAt)`, which doesn't help a
			// destination-less predicate), but after it runs the table holds at
			// most LONG_WINDOW_MS (24h) worth of attempts, which is small and
			// keeps the table bounded without a separate cleanup job.
			tx.delete(otpThrottle).where(lt(otpThrottle.createdAt, longWindowStart)).run();

			const rows = tx
				.select()
				.from(otpThrottle)
				.where(eq(otpThrottle.destination, destination))
				.all();

			const result = evaluateThrottle(rows, now);
			if (!result.ok) return result;

			tx.insert(otpThrottle)
				.values({ id: crypto.randomUUID(), destination, createdAt: new Date(now) })
				.run();

			return { ok: true };
		},
		{ behavior: 'immediate' }
	);
}
