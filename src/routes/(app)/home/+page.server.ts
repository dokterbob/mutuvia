// SPDX-License-Identifier: AGPL-3.0-or-later

import type { PageServerLoad } from './$types';
import { getBalance, formatAmount } from '$lib/server/balance';
import { db } from '$lib/server/db';
import { transactions, appUsers } from '$lib/server/schema';
import { eq, or, desc } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.appUser!.id;
	const balance = getBalance(userId);

	const unitSymbol = process.env.PUBLIC_UNIT_SYMBOL || '€';
	const decimalPlaces = parseInt(process.env.UNIT_DECIMAL_PLACES || '2', 10);

	// Last 5 transactions
	const recentTxs = db
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
		.limit(5)
		.all();

	// Get other party names
	const otherUserIds = recentTxs.map((tx) =>
		tx.fromUserId === userId ? tx.toUserId : tx.fromUserId
	);
	const uniqueIds = [...new Set(otherUserIds)];

	const userMap: Record<string, string> = {};
	for (const id of uniqueIds) {
		const u = db.select().from(appUsers).where(eq(appUsers.id, id)).get();
		if (u) userMap[id] = u.displayName;
	}

	const recentTransactions = recentTxs.map((tx) => {
		const isSender = tx.fromUserId === userId;
		const otherId = isSender ? tx.toUserId : tx.fromUserId;
		return {
			id: tx.id,
			otherName: userMap[otherId] || 'Unknown',
			amount: isSender ? -tx.amount : tx.amount,
			formattedAmount: formatAmount(isSender ? -tx.amount : tx.amount, decimalPlaces, unitSymbol),
			note: tx.note,
			createdAt: tx.createdAt
		};
	});

	return {
		balance,
		formattedBalance: formatAmount(balance, decimalPlaces, unitSymbol),
		recentTransactions,
		unitSymbol,
		decimalPlaces
	};
};
