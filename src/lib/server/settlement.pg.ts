// SPDX-License-Identifier: AGPL-3.0-or-later
//
// PostgreSQL settlement implementation — a real async transaction via
// `bun:sql`'s `client.begin()`. See settlement.sqlite.ts for why the SQLite
// side needs a synchronous callback instead of the `async`/`await` style used
// here.

import { db } from './db.pg';
import { paymentRequests, transactions, connections } from './schema.pg';
import { config } from '$lib/config';
import { eq, and, sql } from 'drizzle-orm';
import type { SettleResult } from './settlement-types';
import { isExpired, notExpiredCondition } from './qr-expiry';

function orderedPair(a: string, b: string): [string, string] {
	return a < b ? [a, b] : [b, a];
}

/**
 * See settlement.sqlite.ts#settleOneTimeAccept for the claim-then-write
 * rationale, and for why this starts with a pre-read guarding self-payment
 * and the amount bound (defense in depth against a thrown CHECK-constraint
 * violation instead of a clean `ok: false`).
 */
export async function settleOneTimeAccept(
	qrId: string,
	acceptingUserId: string
): Promise<SettleResult> {
	return db.transaction(async (tx) => {
		const now = new Date();

		const [pr] = await tx
			.select()
			.from(paymentRequests)
			.where(eq(paymentRequests.id, qrId))
			.limit(1);

		if (!pr) {
			return { ok: false, status: 400, error: 'This QR code has expired or already been used.' };
		}

		if (pr.initiatingUserId === acceptingUserId) {
			return { ok: false, status: 400, error: 'Cannot accept your own QR code.' };
		}

		if (
			pr.amount === null ||
			!Number.isSafeInteger(pr.amount) ||
			pr.amount <= 0 ||
			pr.amount > config.maxTransactionAmount
		) {
			return { ok: false, status: 400, error: 'This QR code has an invalid amount.' };
		}

		const claimed = await tx
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
			.returning();

		if (claimed.length !== 1) {
			return { ok: false, status: 400, error: 'This QR code has expired or already been used.' };
		}

		const qr = claimed[0];
		const fromUserId = qr.direction === 'send' ? qr.initiatingUserId : acceptingUserId;
		const toUserId = qr.direction === 'send' ? acceptingUserId : qr.initiatingUserId;

		const txId = crypto.randomUUID();
		await tx.insert(transactions).values({
			id: txId,
			fromUserId,
			toUserId,
			// Non-null and validated above (the UPDATE above doesn't touch
			// `amount`, so `qr.amount` — the post-claim RETURNING row — is still
			// the same value as `pr.amount`).
			amount: qr.amount!,
			unitCode: config.unitCode,
			note: qr.description,
			paymentRequestId: qr.id,
			createdAt: now
		});

		const [lower, higher] = orderedPair(fromUserId, toUserId);
		await tx
			.insert(connections)
			.values({ userAId: lower, userBId: higher, createdAt: now })
			.onConflictDoNothing();

		return { ok: true, txId };
	});
}

/**
 * See settlement.sqlite.ts#settleReusable for the claim-then-write
 * rationale, the claim's `notExpiredCondition()` (matching
 * `settleOneTimeAccept()`), why the pre-read and the claim share one `now`
 * taken at the top of the transaction, and why the claim's zero-rows branch
 * reports 409 "not active" rather than 410 "expired" — expiry can't be the
 * cause once both checks agree on `now`. That race (a concurrent
 * pause/archive/decline landing between the pre-read and the claim) is
 * also the more realistic one specifically on Postgres: under the default
 * READ COMMITTED isolation, each statement in this transaction sees a fresh
 * snapshot, so a concurrent transaction's committed status change becomes
 * visible to the claim's own `WHERE` even though the pre-read didn't see it.
 */
export async function settleReusable(
	paymentRequestId: string,
	scannerId: string,
	amount: number
): Promise<SettleResult> {
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

	return db.transaction(async (tx) => {
		const now = new Date();

		const [pr] = await tx
			.select()
			.from(paymentRequests)
			.where(eq(paymentRequests.id, paymentRequestId))
			.limit(1);

		if (!pr) return { ok: false, status: 404, error: 'Payment request not found' };
		if (pr.status !== 'active')
			return { ok: false, status: 409, error: 'Payment request is not active' };
		if (!pr.reusable) return { ok: false, status: 400, error: 'Payment request is not reusable' };
		if (scannerId === pr.initiatingUserId)
			return { ok: false, status: 400, error: 'Cannot pay yourself' };
		if (pr.amount !== null && pr.amount !== amount)
			return { ok: false, status: 400, error: 'Amount does not match the required amount' };
		if (isExpired(pr.expiresAt, now))
			return { ok: false, status: 410, error: 'Payment request has expired' };

		const claimed = await tx
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
			.returning();

		if (claimed.length !== 1) {
			// Zero rows: the claim's WHERE uses the exact same `now` as the
			// pre-read's `isExpired()` check above, so expiry can't be *why* this
			// failed — if the pre-read saw it as not expired, the claim's
			// `notExpiredCondition()` agrees, by construction, every time. The
			// only remaining way to land here is a concurrent status change
			// (pause/archive/decline) between the pre-read and the claim —
			// report that, not expiry. No ledger row has been written yet, so
			// there is nothing to roll back.
			return { ok: false, status: 409, error: 'Payment request is not active' };
		}

		const txId = crypto.randomUUID();
		await tx.insert(transactions).values({
			id: txId,
			fromUserId: scannerId,
			toUserId: pr.initiatingUserId,
			amount,
			note: pr.description,
			unitCode: config.unitCode,
			paymentRequestId,
			createdAt: now
		});

		const [lower, higher] = orderedPair(scannerId, pr.initiatingUserId);
		await tx
			.insert(connections)
			.values({ userAId: lower, userBId: higher, createdAt: now })
			.onConflictDoNothing();

		return { ok: true, txId };
	});
}
