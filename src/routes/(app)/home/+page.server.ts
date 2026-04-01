// SPDX-License-Identifier: AGPL-3.0-or-later

import type { PageServerLoad, Actions } from './$types';
import { getBalance } from '$lib/server/balance';
import { formatAmount } from '$lib/server/currency';
import { db } from '$lib/server/db';
import { transactions, appUsers, pendingQr } from '$lib/server/schema';
import { eq, or, desc, and } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.appUser!.id;
	const balance = await getBalance(userId);

	// Last 5 transactions
	const recentTxs = await db
		.select({
			id: transactions.id,
			fromUserId: transactions.fromUserId,
			toUserId: transactions.toUserId,
			amount: transactions.amount,
			note: transactions.note,
			createdAt: transactions.createdAt
		})
		.from(transactions)
		.where(or(eq(transactions.fromUserId, userId), eq(transactions.toUserId, userId)))
		.orderBy(desc(transactions.createdAt))
		.limit(5);

	// Get other party names
	const otherUserIds = recentTxs.map((tx) =>
		tx.fromUserId === userId ? tx.toUserId : tx.fromUserId
	);
	const uniqueIds = [...new Set(otherUserIds)] as string[];

	const userMap: Record<string, string> = {};
	for (const id of uniqueIds) {
		const [u] = await db.select().from(appUsers).where(eq(appUsers.id, id)).limit(1);
		if (u) userMap[id] = u.displayName;
	}

	const recentTransactions = recentTxs.map((tx) => {
		const isSender = tx.fromUserId === userId;
		const otherId = isSender ? tx.toUserId : tx.fromUserId;
		return {
			id: tx.id,
			otherName: userMap[otherId] || 'Unknown',
			amount: isSender ? -tx.amount : tx.amount,
			formattedAmount: formatAmount(isSender ? -tx.amount : tx.amount),
			note: tx.note,
			createdAt: tx.createdAt
		};
	});

	const pendingQrs = await db
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
		.orderBy(desc(pendingQr.createdAt))
		.limit(10);

	const pendingItems = pendingQrs.map((qr) => ({
		id: qr.id,
		direction: qr.direction,
		formattedAmount: formatAmount(qr.amount),
		note: qr.note,
		createdAt: qr.createdAt,
		expiresAt: qr.expiresAt,
		isExpired: qr.expiresAt < new Date()
	}));

	return {
		balance,
		formattedBalance: formatAmount(balance),
		recentTransactions,
		pendingItems
	};
};

export const actions: Actions = {
	cancelQr: async ({ request, locals }) => {
		const data = await request.formData();
		const qrId = data.get('qrId') as string;
		if (!qrId) return;
		const userId = locals.appUser!.id;
		// Verify ownership before cancelling
		const [qr] = await db
			.select({ id: pendingQr.id })
			.from(pendingQr)
			.where(
				and(
					eq(pendingQr.id, qrId),
					eq(pendingQr.initiatingUserId, userId),
					eq(pendingQr.status, 'pending')
				)
			)
			.limit(1);
		if (qr) {
			await db.update(pendingQr).set({ status: 'declined' }).where(eq(pendingQr.id, qrId));
		}
	}
};
