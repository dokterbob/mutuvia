// SPDX-License-Identifier: AGPL-3.0-or-later

import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { pendingQr, transactions, appUsers } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { formatAmount } from '$lib/server/format';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.session) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const [qr] = await db.select().from(pendingQr).where(eq(pendingQr.id, params.id)).limit(1);
	if (!qr) {
		return json({ error: 'Not found' }, { status: 404 });
	}

	// Check if expired
	const isExpired = qr.expiresAt < new Date();
	const status = isExpired && qr.status === 'pending' ? 'expired' : qr.status;

	let otherName = '';
	let formattedAmount = '';

	if (status === 'completed') {
		// Find the transaction linked to this QR
		const [tx] = await db
			.select()
			.from(transactions)
			.where(eq(transactions.pendingQrId, qr.id))
			.limit(1);

		if (tx) {
			const otherUserId = tx.fromUserId === locals.appUser?.id ? tx.toUserId : tx.fromUserId;
			const [otherUser] = await db
				.select()
				.from(appUsers)
				.where(eq(appUsers.id, otherUserId))
				.limit(1);
			otherName = otherUser?.displayName || 'Unknown';

			formattedAmount = formatAmount(qr.amount);
		}
	}

	return json({ status, otherName, formattedAmount });
};
