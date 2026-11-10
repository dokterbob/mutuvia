// SPDX-License-Identifier: AGPL-3.0-or-later
//
// PostgreSQL settlement implementation — a real async transaction via
// `bun:sql`'s `client.begin()`. See settlement.sqlite.ts for why the SQLite
// side needs a synchronous callback instead of the `async`/`await` style used
// here.

import { db } from './db.pg';
import { paymentRequests, transactions, connections } from './schema.pg';
import { config } from '$lib/config';
import { eq, and, or, isNull, gt, sql } from 'drizzle-orm';
import type { SettleResult } from './settlement-types';

function orderedPair(a: string, b: string): [string, string] {
	return a < b ? [a, b] : [b, a];
}

/** See settlement.sqlite.ts#settleOneTimeAccept for the claim-then-write rationale. */
export async function settleOneTimeAccept(
	qrId: string,
	acceptingUserId: string
): Promise<SettleResult> {
	return db.transaction(async (tx) => {
		const now = new Date();

		const claimed = await tx
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
			amount: qr.amount ?? 0,
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

/** See settlement.sqlite.ts#settleReusable for the claim-then-write rationale. */
export async function settleReusable(
	paymentRequestId: string,
	scannerId: string,
	amount: number
): Promise<SettleResult> {
	if (amount <= 0) {
		return { ok: false, status: 400, error: 'Amount must be greater than zero' };
	}

	return db.transaction(async (tx) => {
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
		if (pr.expiresAt && pr.expiresAt <= new Date())
			return { ok: false, status: 410, error: 'Payment request has expired' };

		const now = new Date();

		const claimed = await tx
			.update(paymentRequests)
			.set({
				totalReceived: sql`${paymentRequests.totalReceived} + ${amount}`,
				paymentCount: sql`${paymentRequests.paymentCount} + 1`,
				updatedAt: now
			})
			.where(and(eq(paymentRequests.id, paymentRequestId), eq(paymentRequests.status, 'active')))
			.returning();

		if (claimed.length !== 1) {
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
