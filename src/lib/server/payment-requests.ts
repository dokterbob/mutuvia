// SPDX-License-Identifier: AGPL-3.0-or-later

import { db } from '$lib/server/db';
import { paymentRequests, transactions } from '$lib/server/schema';
import { formatAmount } from '$lib/server/currency';
import { eq, and, desc, gt, isNull, or, inArray, sql } from 'drizzle-orm';
import { config } from '$lib/config';
import { upsertConnection } from '$lib/server/balance';

export async function getPendingItems(userId: string, limit?: number) {
	const retentionCutoff = new Date(Date.now() - config.expiredQrRetentionSeconds * 1000);

	const query = db
		.select({
			id: paymentRequests.id,
			direction: paymentRequests.direction,
			amount: paymentRequests.amount,
			description: paymentRequests.description,
			reusable: paymentRequests.reusable,
			status: paymentRequests.status,
			paymentCount: paymentRequests.paymentCount,
			totalReceived: paymentRequests.totalReceived,
			createdAt: paymentRequests.createdAt,
			expiresAt: paymentRequests.expiresAt
		})
		.from(paymentRequests)
		.where(
			and(
				eq(paymentRequests.initiatingUserId, userId),
				or(
					eq(paymentRequests.status, 'active'),
					and(eq(paymentRequests.status, 'paused'), eq(paymentRequests.reusable, true))
				),
				or(isNull(paymentRequests.expiresAt), gt(paymentRequests.expiresAt, retentionCutoff))
			)
		)
		.orderBy(desc(paymentRequests.createdAt));

	const rows = limit !== undefined ? await query.limit(limit) : await query;

	return rows.map((qr) => ({
		id: qr.id,
		direction: qr.direction,
		formattedAmount: qr.amount !== null ? formatAmount(qr.amount) : null,
		note: qr.description,
		reusable: qr.reusable,
		status: qr.status,
		isPaused: qr.status === 'paused',
		paymentCount: qr.paymentCount,
		totalReceived: qr.totalReceived,
		createdAt: qr.createdAt,
		expiresAt: qr.expiresAt,
		isExpired: qr.expiresAt ? qr.expiresAt <= new Date() : false
	}));
}

export async function getPendingItemById(id: string, userId: string) {
	const [qr] = await db
		.select()
		.from(paymentRequests)
		.where(and(eq(paymentRequests.id, id), eq(paymentRequests.initiatingUserId, userId)))
		.limit(1);

	if (!qr) return null;

	return {
		id: qr.id,
		direction: qr.direction,
		amount: qr.amount,
		formattedAmount: qr.amount !== null ? formatAmount(qr.amount) : null,
		description: qr.description,
		note: qr.description,
		reusable: qr.reusable,
		paymentCount: qr.paymentCount,
		totalReceived: qr.totalReceived,
		createdAt: qr.createdAt,
		expiresAt: qr.expiresAt,
		status: qr.status,
		isExpired: qr.expiresAt ? qr.expiresAt <= new Date() : false
	};
}

export async function cancelPaymentRequest(qrId: string, userId: string): Promise<void> {
	await db
		.update(paymentRequests)
		.set({ status: 'declined' })
		.where(
			and(
				eq(paymentRequests.id, qrId),
				eq(paymentRequests.initiatingUserId, userId),
				eq(paymentRequests.status, 'active')
			)
		);
}

export async function settleReusable(
	paymentRequestId: string,
	scannerId: string,
	amount: number
): Promise<{ ok: true; txId: string } | { ok: false; status: number; error: string }> {
	if (amount <= 0) {
		return { ok: false, status: 400, error: 'Amount must be greater than zero' };
	}

	return await db.transaction(async (tx) => {
		const [pr] = await tx
			.select()
			.from(paymentRequests)
			.where(eq(paymentRequests.id, paymentRequestId))
			.limit(1);

		if (!pr) {
			return { ok: false, status: 404, error: 'Payment request not found' };
		}

		if (pr.status !== 'active') {
			return { ok: false, status: 409, error: 'Payment request is not active' };
		}

		if (!pr.reusable) {
			return { ok: false, status: 400, error: 'Payment request is not reusable' };
		}

		if (scannerId === pr.initiatingUserId) {
			return { ok: false, status: 400, error: 'Cannot pay yourself' };
		}

		if (pr.amount !== null && pr.amount !== amount) {
			return { ok: false, status: 400, error: 'Amount does not match the required amount' };
		}

		if (pr.expiresAt && pr.expiresAt <= new Date()) {
			return { ok: false, status: 410, error: 'Payment request has expired' };
		}

		const txId = crypto.randomUUID();
		const now = new Date();

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

		await tx
			.update(paymentRequests)
			.set({
				totalReceived: sql`${paymentRequests.totalReceived} + ${amount}`,
				paymentCount: sql`${paymentRequests.paymentCount} + 1`,
				updatedAt: now
			})
			.where(eq(paymentRequests.id, paymentRequestId));

		await upsertConnection(scannerId, pr.initiatingUserId);

		return { ok: true, txId };
	});
}

export async function pausePaymentRequest(id: string, userId: string): Promise<void> {
	await db
		.update(paymentRequests)
		.set({ status: 'paused', updatedAt: new Date() })
		.where(
			and(
				eq(paymentRequests.id, id),
				eq(paymentRequests.initiatingUserId, userId),
				eq(paymentRequests.status, 'active'),
				eq(paymentRequests.reusable, true)
			)
		);
}

export async function resumePaymentRequest(id: string, userId: string): Promise<void> {
	await db
		.update(paymentRequests)
		.set({ status: 'active', updatedAt: new Date() })
		.where(
			and(
				eq(paymentRequests.id, id),
				eq(paymentRequests.initiatingUserId, userId),
				eq(paymentRequests.status, 'paused'),
				eq(paymentRequests.reusable, true)
			)
		);
}

export async function archivePaymentRequest(id: string, userId: string): Promise<void> {
	await db
		.update(paymentRequests)
		.set({ status: 'archived', updatedAt: new Date() })
		.where(
			and(
				eq(paymentRequests.id, id),
				eq(paymentRequests.initiatingUserId, userId),
				inArray(paymentRequests.status, ['active', 'paused']),
				eq(paymentRequests.reusable, true)
			)
		);
}
