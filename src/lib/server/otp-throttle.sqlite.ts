// SPDX-License-Identifier: AGPL-3.0-or-later
//
// SQLite per-destination OTP throttle. Uses the same synchronous
// `db.transaction(fn, { behavior: 'immediate' })` pattern as settlement.sqlite.ts
// (see that file's header comment for why the callback must be synchronous,
// not `async`) — an immediate transaction takes bun:sqlite's single write
// lock up front, which alone is enough to serialize two concurrent throttle
// checks for the same (or any other) destination: the prune, count, and
// insert below all run as one indivisible unit.

import { eq, and, lt } from 'drizzle-orm';
import { db } from './db.sqlite';
import { otpThrottle } from './schema.sqlite';
import {
	SHORT_WINDOW_MS,
	SHORT_WINDOW_MAX,
	LONG_WINDOW_MS,
	LONG_WINDOW_MAX
} from './otp-throttle-types';
import type { ThrottleResult } from './otp-throttle-types';

export function checkAndRecordOtpSend(destination: string): ThrottleResult {
	return db.transaction(
		(tx) => {
			const now = Date.now();
			const longWindowStart = new Date(now - LONG_WINDOW_MS);

			// Prune opportunistically — nothing outside the longer window is
			// ever consulted again, so this keeps the table bounded without a
			// separate cleanup job.
			tx.delete(otpThrottle)
				.where(
					and(eq(otpThrottle.destination, destination), lt(otpThrottle.createdAt, longWindowStart))
				)
				.run();

			const rows = tx
				.select()
				.from(otpThrottle)
				.where(eq(otpThrottle.destination, destination))
				.all();

			if (rows.length >= LONG_WINDOW_MAX) {
				const oldest = rows.reduce((a, b) => (a.createdAt < b.createdAt ? a : b));
				return {
					ok: false,
					retryAfterSeconds: retryAfter(oldest.createdAt.getTime(), LONG_WINDOW_MS, now)
				};
			}

			const shortWindowStart = now - SHORT_WINDOW_MS;
			const recent = rows.filter((r) => r.createdAt.getTime() >= shortWindowStart);
			if (recent.length >= SHORT_WINDOW_MAX) {
				const oldest = recent.reduce((a, b) => (a.createdAt < b.createdAt ? a : b));
				return {
					ok: false,
					retryAfterSeconds: retryAfter(oldest.createdAt.getTime(), SHORT_WINDOW_MS, now)
				};
			}

			tx.insert(otpThrottle)
				.values({ id: crypto.randomUUID(), destination, createdAt: new Date(now) })
				.run();

			return { ok: true };
		},
		{ behavior: 'immediate' }
	);
}

function retryAfter(oldestMs: number, windowMs: number, now: number): number {
	return Math.max(1, Math.ceil((oldestMs + windowMs - now) / 1000));
}
