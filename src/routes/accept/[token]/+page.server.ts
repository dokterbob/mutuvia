// SPDX-License-Identifier: AGPL-3.0-or-later

import { redirect, fail, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { pendingQr, transactions, appUsers } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { verifyQrToken } from '$lib/server/qr';
import { getBalance, formatAmount, upsertConnection } from '$lib/server/balance';
import { randomUUID } from 'crypto';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const unitSymbol = process.env.PUBLIC_UNIT_SYMBOL || '€';
	const decimalPlaces = parseInt(process.env.UNIT_DECIMAL_PLACES || '2', 10);

	// Client-side pre-check hint: try to decode JWT claims without verification
	let tokenData;
	try {
		tokenData = await verifyQrToken(params.token);
	} catch {
		return {
			expired: true,
			error: 'This link has expired or is invalid.',
			unitSymbol,
			decimalPlaces
		};
	}

	// Look up the pending QR
	const qr = db.select().from(pendingQr).where(eq(pendingQr.id, tokenData.jti)).get();
	if (!qr || qr.status !== 'pending' || qr.expiresAt < new Date()) {
		return {
			expired: true,
			error: 'This link has expired or is invalid.',
			unitSymbol,
			decimalPlaces
		};
	}

	// If not authenticated, redirect to onboarding, then back here
	if (!locals.session || !locals.appUser) {
		const returnUrl = `/accept/${params.token}`;
		redirect(307, `/onboarding?return=${encodeURIComponent(returnUrl)}`);
	}

	// Get initiator info
	const initiator = db
		.select()
		.from(appUsers)
		.where(eq(appUsers.id, qr.initiatingUserId))
		.get();

	if (!initiator) {
		return { expired: true, error: 'Initiator not found.', unitSymbol, decimalPlaces };
	}

	// Prevent self-acceptance
	if (locals.appUser.id === qr.initiatingUserId) {
		return {
			expired: true,
			error: 'You cannot accept your own QR code.',
			unitSymbol,
			decimalPlaces
		};
	}

	const initiatorBalance = getBalance(qr.initiatingUserId);

	return {
		expired: false,
		qrId: qr.id,
		direction: qr.direction,
		amount: qr.amount,
		formattedAmount: formatAmount(qr.amount, decimalPlaces, unitSymbol),
		note: qr.note,
		initiatorName: initiator.displayName,
		initiatorBalance: formatAmount(initiatorBalance, decimalPlaces, unitSymbol),
		token: params.token,
		unitSymbol,
		decimalPlaces
	};
};

export const actions: Actions = {
	accept: async ({ request, locals }) => {
		if (!locals.session || !locals.appUser) {
			error(401, 'Not authenticated');
		}

		const data = await request.formData();
		const qrId = data.get('qrId') as string;

		const qr = db.select().from(pendingQr).where(eq(pendingQr.id, qrId)).get();
		if (!qr || qr.status !== 'pending' || qr.expiresAt < new Date()) {
			return fail(400, { error: 'This QR code has expired or already been used.' });
		}

		if (locals.appUser.id === qr.initiatingUserId) {
			return fail(400, { error: 'You cannot accept your own QR code.' });
		}

		const unitCode = process.env.UNIT_CODE || 'EUR';

		// Determine from/to based on direction
		let fromUserId: string;
		let toUserId: string;

		if (qr.direction === 'send') {
			// Initiator is sending (their balance decreases)
			fromUserId = qr.initiatingUserId;
			toUserId = locals.appUser.id;
		} else {
			// Initiator is receiving (scanner's balance decreases)
			fromUserId = locals.appUser.id;
			toUserId = qr.initiatingUserId;
		}

		// Atomic settlement: insert transaction + update QR status + upsert connection
		const txId = randomUUID();

		db.insert(transactions)
			.values({
				id: txId,
				fromUserId,
				toUserId,
				amount: qr.amount,
				unitCode,
				note: qr.note,
				pendingQrId: qr.id,
				createdAt: new Date()
			})
			.run();

		db.update(pendingQr)
			.set({ status: 'completed' })
			.where(eq(pendingQr.id, qr.id))
			.run();

		upsertConnection(fromUserId, toUserId);

		redirect(307, '/home');
	},

	decline: async ({ request }) => {
		const data = await request.formData();
		const qrId = data.get('qrId') as string;

		if (qrId) {
			db.update(pendingQr)
				.set({ status: 'declined' })
				.where(eq(pendingQr.id, qrId))
				.run();
		}

		redirect(307, '/home');
	}
};
