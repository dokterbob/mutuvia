// SPDX-License-Identifier: AGPL-3.0-or-later

import type { PageServerLoad } from './$types';
import { getBalance } from '$lib/server/balance';
import { formatAmount } from '$lib/server/currency';
import { db } from '$lib/server/db';
import { transactions, appUsers } from '$lib/server/schema';
import { eq, or, desc } from 'drizzle-orm';
import { getPendingItems } from '$lib/server/pending-qr';

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

	const pendingItems = await getPendingItems(userId, 10);

	return {
		balance,
		formattedBalance: formatAmount(balance),
		recentTransactions,
		pendingItems
	};
};
