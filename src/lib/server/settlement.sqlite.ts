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
import { eq, and, or, isNull, gt, sql } from 'drizzle-orm';
import type { SettleResult } from './settlement-types';

function orderedPair(a: string, b: string): [string, string] {
	return a < b ? [a, b] : [b, a];
}

/**
 * Atomically claims a one-time payment request and inserts the ledger row.
 *
 * The claim is a single conditional UPDATE (`status='active' AND
 * reusable=false AND not expired`) with RETURNING. Exactly one row coming
 * back means we won the claim; zero means it was already used, declined, or
 * is expired — including when a concurrent accept or a decline won the race.
 * The ledger insert and connection upsert only run after a successful claim,
 * so a loser never writes anything.
 */
export function settleOneTimeAccept(qrId: string, acceptingUserId: string): SettleResult {
	return db.transaction(
		(tx) => {
			const now = new Date();

			const claimed = tx
				.update(paymentRequests)
				.set({ status: 'completed', updatedAt: now })
				.where(
					and(
						eq(paymentRequests.id, qrId),
						eq(paymentRequests.status, 'active'),
						eq(paymentRequests.reusable, false),
						or(isNull(paymentRequests.expiresAt), gt(paymentRequests.expiresAt, now))
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
					amount: qr.amount ?? 0,
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
 * `status='active'`, with RETURNING. Only once that claim succeeds does the
 * ledger row get inserted — so a forced failure of the ledger insert rolls
 * back the counter increment too (real atomicity), and a request that was
 * paused/archived/declined between the read and the claim is rejected
 * without writing a ledger row.
 */
export function settleReusable(
	paymentRequestId: string,
	scannerId: string,
	amount: number
): SettleResult {
	if (amount <= 0) {
		return { ok: false, status: 400, error: 'Amount must be greater than zero' };
	}

	return db.transaction(
		(tx) => {
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
			if (pr.expiresAt && pr.expiresAt <= new Date())
				return { ok: false, status: 410, error: 'Payment request has expired' } as const;

			const now = new Date();

			const claimed = tx
				.update(paymentRequests)
				.set({
					totalReceived: sql`${paymentRequests.totalReceived} + ${amount}`,
					paymentCount: sql`${paymentRequests.paymentCount} + 1`,
					updatedAt: now
				})
				.where(and(eq(paymentRequests.id, paymentRequestId), eq(paymentRequests.status, 'active')))
				.returning()
				.all();

			if (claimed.length !== 1) {
				return { ok: false, status: 409, error: 'Payment request is not active' } as const;
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
