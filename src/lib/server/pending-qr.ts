// SPDX-License-Identifier: AGPL-3.0-or-later

import { db } from '$lib/server/db';
import { pendingQr } from '$lib/server/schema';
import { formatAmount } from '$lib/server/currency';
import { eq, and, desc, gt } from 'drizzle-orm';
import { config } from '$lib/config';

export async function getPendingItems(userId: string, limit?: number) {
	const retentionCutoff = new Date(Date.now() - config.expiredQrRetentionSeconds * 1000);

	const query = db
		.select({
			id: pendingQr.id,
			direction: pendingQr.direction,
			amount: pendingQr.amount,
			note: pendingQr.note,
			createdAt: pendingQr.createdAt,
			expiresAt: pendingQr.expiresAt
		})
		.from(pendingQr)
		.where(
			and(
				eq(pendingQr.initiatingUserId, userId),
				eq(pendingQr.status, 'pending'),
				gt(pendingQr.expiresAt, retentionCutoff)
			)
		)
		.orderBy(desc(pendingQr.createdAt));

	const rows = limit !== undefined ? await query.limit(limit) : await query;

	return rows.map((qr) => ({
		id: qr.id,
		direction: qr.direction,
		formattedAmount: formatAmount(qr.amount),
		note: qr.note,
		createdAt: qr.createdAt,
		expiresAt: qr.expiresAt,
		isExpired: qr.expiresAt <= new Date()
	}));
}

export async function getPendingItemById(id: string, userId: string) {
	const [qr] = await db
		.select()
		.from(pendingQr)
		.where(and(eq(pendingQr.id, id), eq(pendingQr.initiatingUserId, userId)))
		.limit(1);

	if (!qr) return null;

	return {
		id: qr.id,
		direction: qr.direction,
		amount: qr.amount,
		formattedAmount: formatAmount(qr.amount),
		note: qr.note,
		createdAt: qr.createdAt,
		expiresAt: qr.expiresAt,
		status: qr.status,
		isExpired: qr.expiresAt <= new Date()
	};
}

export async function cancelPendingQr(qrId: string, userId: string): Promise<void> {
	await db
		.update(pendingQr)
		.set({ status: 'declined' })
		.where(
			and(
				eq(pendingQr.id, qrId),
				eq(pendingQr.initiatingUserId, userId),
				eq(pendingQr.status, 'pending')
			)
		);
}
