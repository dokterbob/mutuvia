// SPDX-License-Identifier: AGPL-3.0-or-later

import { db } from '$lib/server/db';
import { paymentRequests } from '$lib/server/schema';
import { formatAmount } from '$lib/server/currency';
import { eq, and, desc, gt, isNull, or, inArray } from 'drizzle-orm';
import { config } from '$lib/config';
import { isExpired } from './qr-expiry';

export { settleOneTimeAccept, settleReusable } from './settlement';

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
		isExpired: isExpired(qr.expiresAt)
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
		isExpired: isExpired(qr.expiresAt)
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
