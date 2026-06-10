// SPDX-License-Identifier: AGPL-3.0-or-later

import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { formatAmount } from '$lib/server/currency';
import { getContactBalance } from '$lib/server/balance';
import { db } from '$lib/server/db';
import { appUsers, transactions } from '$lib/server/schema';
import { eq, or, and, desc } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals, params }) => {
	const userId = locals.appUser!.id;
	const otherId = params.id;

	const [other] = await db.select().from(appUsers).where(eq(appUsers.id, otherId)).limit(1);
	if (!other) error(404);

	const sharedTxs = await db
		.select({
			id: transactions.id,
			fromUserId: transactions.fromUserId,
			toUserId: transactions.toUserId,
			amount: transactions.amount,
			note: transactions.note,
			createdAt: transactions.createdAt
		})
		.from(transactions)
		.where(
			or(
				and(eq(transactions.fromUserId, userId), eq(transactions.toUserId, otherId)),
				and(eq(transactions.fromUserId, otherId), eq(transactions.toUserId, userId))
			)
		)
		.orderBy(desc(transactions.createdAt));

	if (sharedTxs.length === 0) error(404);

	const balance = await getContactBalance(userId, otherId);

	const txList = sharedTxs.map((tx) => {
		const isSender = tx.fromUserId === userId;
		const signed = isSender ? -tx.amount : tx.amount;
		return {
			id: tx.id,
			amount: signed,
			formattedAmount: formatAmount(signed),
			note: tx.note,
			createdAt: tx.createdAt
		};
	});

	return {
		contact: {
			id: otherId,
			name: other.displayName,
			balance,
			formattedBalance: formatAmount(balance)
		},
		transactions: txList
	};
};
