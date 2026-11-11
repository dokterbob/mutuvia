// SPDX-License-Identifier: AGPL-3.0-or-later
//
// SQLite settlement implementation.
//
// Drizzle's bun-sqlite driver executes `db.transaction()` callbacks
// SYNCHRONOUSLY: `SQLiteBunSession.transaction()` calls `client.transaction(() =>
// { result = transaction(tx) })` and the BEGIN/COMMIT wrapper runs that closure
// to completion before returning. If `transaction` were an `async` function,
// calling it would return a pending Promise at its first `await`, so the
// closure would return (and COMMIT) before any of the callback's statements
// actually ran. Every write below therefore uses the synchronous query API
// (`.run()` / `.all()` / `.get()`, never `await`) so the whole settlement is one
// real atomic unit guarded by `{ behavior: 'immediate' }` (an immediate
// transaction takes the write lock up front instead of on first write).

import { db } from './db.sqlite';
import { paymentRequests, transactions, connections } from './schema.sqlite';
import { config } from '$lib/config';
import { eq, and, sql } from 'drizzle-orm';
import type { SettleResult } from './settlement-types';
import { isExpired, notExpiredCondition } from './qr-expiry';

function orderedPair(a: string, b: string): [string, string] {
	return a < b ? [a, b] : [b, a];
}

/**
 * Atomically claims a one-time payment request and inserts the ledger row.
 *
 * A pre-read guards two invariants that would otherwise surface as a thrown
 * CHECK-constraint violation from the ledger insert, rather than a clean
 * `ok: false` result: the accepting user can't be the initiator (self-payment
 * — the accept route already refuses this before calling in, but this is
 * defense in depth for any other caller), and the request's amount must be a
 * positive, in-range integer (it always is for a non-reusable request
 * created via the validated send/receive routes, but a caller must never be
 * able to force a bad amount into the ledger).
 *
 * The actual claim is still the single conditional UPDATE (`status='active'
 * AND reusable=false AND not expired`) with RETURNING, run immediately after:
 * exactly one row coming back means we won the claim; zero means it was
 * already used, declined, or is expired — including when a concurrent accept
 * or a decline won the race. Nothing can interleave between the pre-read and
 * the claim since both run inside the same synchronous transaction. The
 * ledger insert and connection upsert only run after a successful claim, so a
 * loser never writes anything.
 */
export function settleOneTimeAccept(qrId: string, acceptingUserId: string): SettleResult {
	return db.transaction(
		(tx) => {
			const now = new Date();

			const [pr] = tx
				.select()
				.from(paymentRequests)
				.where(eq(paymentRequests.id, qrId))
				.limit(1)
				.all();

			if (!pr) {
				return {
					ok: false,
					status: 400,
					error: 'This QR code has expired or already been used.'
				} as const;
			}

			if (pr.initiatingUserId === acceptingUserId) {
				return { ok: false, status: 400, error: 'Cannot accept your own QR code.' } as const;
			}

			if (
				pr.amount === null ||
				!Number.isSafeInteger(pr.amount) ||
				pr.amount <= 0 ||
				pr.amount > config.maxTransactionAmount
			) {
				return { ok: false, status: 400, error: 'This QR code has an invalid amount.' } as const;
			}

			const claimed = tx
				.update(paymentRequests)
				.set({ status: 'completed', updatedAt: now })
				.where(
					and(
						eq(paymentRequests.id, qrId),
						eq(paymentRequests.status, 'active'),
						eq(paymentRequests.reusable, false),
						notExpiredCondition(paymentRequests.expiresAt, now)
					)
				)
				.returning()
				.all();

			if (claimed.length !== 1) {
				return {
					ok: false,
					status: 400,
					error: 'This QR code has expired or already been used.'
				} as const;
			}

			const qr = claimed[0];
			const fromUserId = qr.direction === 'send' ? qr.initiatingUserId : acceptingUserId;
			const toUserId = qr.direction === 'send' ? acceptingUserId : qr.initiatingUserId;

			const txId = crypto.randomUUID();
			tx.insert(transactions)
				.values({
					id: txId,
					fromUserId,
					toUserId,
					// Non-null and validated above (the UPDATE above doesn't touch
					// `amount`, so `qr.amount` — the post-claim RETURNING row — is
					// still the same value as `pr.amount`).
					amount: qr.amount!,
					unitCode: config.unitCode,
					note: qr.description,
					paymentRequestId: qr.id,
					createdAt: now
				})
				.run();

			const [lower, higher] = orderedPair(fromUserId, toUserId);
			tx.insert(connections)
				.values({ userAId: lower, userBId: higher, createdAt: now })
				.onConflictDoNothing()
				.run();

			return { ok: true, txId } as const;
		},
		{ behavior: 'immediate' }
	);
}

/**
 * Atomically settles a payment against a reusable payment request.
 *
 * Validation reads happen first (for precise error messages), then the
 * counter increment is the atomic claim: a conditional UPDATE requiring
 * `status='active' AND not expired` (the same `notExpiredCondition()` used by
 * `settleOneTimeAccept()`), with RETURNING. Only once that claim succeeds
 * does the ledger row get inserted — so a forced failure of the ledger insert
 * rolls back the counter increment too (real atomicity).
 *
 * A single `now`, taken once at the top of the transaction, is used for both
 * the pre-read's expiry check and the claim's `notExpiredCondition()` — they
 * can never disagree about what "now" means, so if the claim's WHERE still
 * matches zero rows, it was NOT expiry (the pre-read already ruled that out,
 * using the exact same `now`): it's a concurrent status change
 * (pause/archive/decline) between the pre-read and the claim. That's what
 * the claim's own zero-rows branch below reports.
 */
export function settleReusable(
	paymentRequestId: string,
	scannerId: string,
	amount: number
): SettleResult {
	// Re-validated here (not just in the route) so no caller — present or
	// future — can push a non-integer, non-positive, or over-the-sanity-bound
	// amount into the ledger; the route's own parseAmount() call is the first
	// line of defense, this is the last.
	if (!Number.isSafeInteger(amount) || amount <= 0) {
		return { ok: false, status: 400, error: 'Amount must be greater than zero' };
	}
	if (amount > config.maxTransactionAmount) {
		return { ok: false, status: 400, error: 'Amount exceeds the maximum allowed' };
	}

	return db.transaction(
		(tx) => {
			const now = new Date();

			const [pr] = tx
				.select()
				.from(paymentRequests)
				.where(eq(paymentRequests.id, paymentRequestId))
				.limit(1)
				.all();

			if (!pr) return { ok: false, status: 404, error: 'Payment request not found' } as const;
			if (pr.status !== 'active')
				return { ok: false, status: 409, error: 'Payment request is not active' } as const;
			if (!pr.reusable)
				return { ok: false, status: 400, error: 'Payment request is not reusable' } as const;
			if (scannerId === pr.initiatingUserId)
				return { ok: false, status: 400, error: 'Cannot pay yourself' } as const;
			if (pr.amount !== null && pr.amount !== amount)
				return {
					ok: false,
					status: 400,
					error: 'Amount does not match the required amount'
				} as const;
			if (isExpired(pr.expiresAt, now))
				return { ok: false, status: 410, error: 'Payment request has expired' } as const;

			const claimed = tx
				.update(paymentRequests)
				.set({
					totalReceived: sql`${paymentRequests.totalReceived} + ${amount}`,
					paymentCount: sql`${paymentRequests.paymentCount} + 1`,
					updatedAt: now
				})
				.where(
					and(
						eq(paymentRequests.id, paymentRequestId),
						eq(paymentRequests.status, 'active'),
						notExpiredCondition(paymentRequests.expiresAt, now)
					)
				)
				.returning()
				.all();

			if (claimed.length !== 1) {
				// Zero rows: the claim's WHERE uses the exact same `now` as the
				// pre-read's `isExpired()` check two lines up, so expiry can't be
				// *why* this failed — if the pre-read saw it as not expired, the
				// claim's `notExpiredCondition()` agrees, by construction, every
				// time. The only remaining way to land here is a concurrent
				// status change (pause/archive/decline) between the pre-read and
				// the claim — report that, not expiry. No ledger row has been
				// written yet (the insert below hasn't run), so there is nothing
				// to roll back.
				return {
					ok: false,
					status: 409,
					error: 'Payment request is not active'
				} as const;
			}

			const txId = crypto.randomUUID();
			tx.insert(transactions)
				.values({
					id: txId,
					fromUserId: scannerId,
					toUserId: pr.initiatingUserId,
					amount,
					note: pr.description,
					unitCode: config.unitCode,
					paymentRequestId,
					createdAt: now
				})
				.run();

			const [lower, higher] = orderedPair(scannerId, pr.initiatingUserId);
			tx.insert(connections)
				.values({ userAId: lower, userBId: higher, createdAt: now })
				.onConflictDoNothing()
				.run();

			return { ok: true, txId } as const;
		},
		{ behavior: 'immediate' }
	);
}
