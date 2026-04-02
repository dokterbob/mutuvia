// SPDX-License-Identifier: AGPL-3.0-or-later

import { db } from '$lib/server/db';
import { pendingQr } from '$lib/server/schema';
import { formatAmount } from '$lib/server/currency';
import { eq, and, desc } from 'drizzle-orm';

export async function getPendingItems(userId: string, limit?: number) {
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
		.where(and(eq(pendingQr.initiatingUserId, userId), eq(pendingQr.status, 'pending')))
		.orderBy(desc(pendingQr.createdAt));

	const rows = limit !== undefined ? await query.limit(limit) : await query;

	return rows.map((qr) => ({
		id: qr.id,
		direction: qr.direction,
		formattedAmount: formatAmount(qr.amount),
		note: qr.note,
		createdAt: qr.createdAt,
		expiresAt: qr.expiresAt,
		isExpired: qr.expiresAt < new Date()
	}));
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
