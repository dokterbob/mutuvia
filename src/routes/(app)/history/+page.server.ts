// SPDX-License-Identifier: AGPL-3.0-or-later

import type { PageServerLoad } from './$types';
import { formatAmount } from '$lib/server/currency';
import { db } from '$lib/server/db';
import { transactions, appUsers } from '$lib/server/schema';
import { eq, or, desc } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.appUser!.id;

	const allTxs = await db
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
		.orderBy(desc(transactions.createdAt));

	const otherUserIds = [
		...new Set(allTxs.map((tx) => (tx.fromUserId === userId ? tx.toUserId : tx.fromUserId)))
	] as string[];
	const userMap: Record<string, string> = {};
	for (const id of otherUserIds) {
		const [u] = await db.select().from(appUsers).where(eq(appUsers.id, id)).limit(1);
		if (u) userMap[id] = u.displayName;
	}

	const txList = allTxs.map((tx) => {
		const isSender = tx.fromUserId === userId;
		const otherId = isSender ? tx.toUserId : tx.fromUserId;
		return {
			id: tx.id,
			type: isSender ? ('sent' as const) : ('received' as const),
			otherName: userMap[otherId] || 'Unknown',
			amount: isSender ? -tx.amount : tx.amount,
			formattedAmount: formatAmount(isSender ? -tx.amount : tx.amount),
			note: tx.note,
			createdAt: tx.createdAt
		};
	});

	return { transactions: txList };
};
