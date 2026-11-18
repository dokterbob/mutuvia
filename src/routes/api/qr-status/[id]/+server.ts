// SPDX-License-Identifier: AGPL-3.0-or-later

import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { paymentRequests, transactions, appUsers } from '$lib/server/schema';
import { eq, and, or } from 'drizzle-orm';
import { formatAmount } from '$lib/server/currency';
import { isExpired } from '$lib/server/qr-expiry';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	// Not logged in as an app user, the QR doesn't exist, or the caller has no
	// legitimate stake in it: all three cases are reported identically as 404 so
	// a prober can't distinguish "no such id" from "not yours".
	if (!locals.appUser) {
		return json({ error: 'Not found' }, { status: 404 });
	}

	const userId = locals.appUser.id;

	const [qr] = await db
		.select()
		.from(paymentRequests)
		.where(eq(paymentRequests.id, params.id))
		.limit(1);
	if (!qr) {
		return json({ error: 'Not found' }, { status: 404 });
	}

	// A party is the initiator, or anyone who has a transaction linked to this
	// payment request — the one-time acceptor, or (for a reusable request,
	// which can have many payers) any user who has paid it.
	const isInitiator = qr.initiatingUserId === userId;
	const [ownTx] = isInitiator
		? []
		: await db
				.select({ id: transactions.id })
				.from(transactions)
				.where(
					and(
						eq(transactions.paymentRequestId, qr.id),
						or(eq(transactions.fromUserId, userId), eq(transactions.toUserId, userId))
					)
				)
				.limit(1);

	if (!isInitiator && !ownTx) {
		return json({ error: 'Not found' }, { status: 404 });
	}

	// Check if expired
	const expired = isExpired(qr.expiresAt);
	const status = expired && qr.status === 'active' ? 'expired' : qr.status;

	let otherName = '';
	let formattedAmount = '';

	if (status === 'completed') {
		// Only a one-time request reaches 'completed', and it has exactly one
		// linked transaction (the caller was already confirmed a party to it above).
		const [tx] = await db
			.select()
			.from(transactions)
			.where(eq(transactions.paymentRequestId, qr.id))
			.limit(1);

		if (tx) {
			const otherUserId = tx.fromUserId === userId ? tx.toUserId : tx.fromUserId;
			const [otherUser] = await db
				.select()
				.from(appUsers)
				.where(eq(appUsers.id, otherUserId))
				.limit(1);
			otherName = otherUser?.displayName || 'Unknown';

			formattedAmount = formatAmount(qr.amount ?? 0);
		}
	}

	return json({ status, otherName, formattedAmount });
};
