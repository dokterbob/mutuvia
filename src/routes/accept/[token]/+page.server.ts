// SPDX-License-Identifier: AGPL-3.0-or-later

import { redirect, fail, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { pendingQr, transactions, appUsers } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { verifyQrToken } from '$lib/server/qr';
import { getBalance, upsertConnection } from '$lib/server/balance';
import { formatAmount } from '$lib/server/currency';
import { config } from '$lib/config';
import { randomUUID } from 'crypto';
import { emit } from '$lib/server/sse-registry';
import { sendPushToUser } from '$lib/server/push-sender';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	// Client-side pre-check hint: try to decode JWT claims without verification
	let tokenData;
	try {
		tokenData = await verifyQrToken(params.token);
	} catch {
		return {
			expired: true,
			error: 'This link has expired or is invalid.'
		};
	}

	// Look up the pending QR
	const [qr] = await db.select().from(pendingQr).where(eq(pendingQr.id, tokenData.jti)).limit(1);
	if (!qr || qr.status !== 'pending' || qr.expiresAt < new Date()) {
		return {
			expired: true,
			error: 'This link has expired or is invalid.'
		};
	}

	// Get initiator info (needed for both authenticated and unauthenticated views)
	const [initiator] = await db
		.select()
		.from(appUsers)
		.where(eq(appUsers.id, qr.initiatingUserId))
		.limit(1);

	if (!initiator) {
		return { expired: true, error: 'Initiator not found.' };
	}

	const needsAuth = !locals.session || !locals.appUser;

	if (needsAuth) {
		// Return enough info to show the transaction preview. qrId is included only for the
		// Decline action; the Accept action enforces auth server-side and is not rendered here.
		// The startFastTrack / startFullOnboarding actions handle the auth redirect.
		return {
			expired: false,
			needsAuth: true,
			qrId: qr.id,
			direction: qr.direction,
			amount: qr.amount,
			formattedAmount: formatAmount(qr.amount),
			note: qr.note,
			initiatorName: initiator.displayName,
			token: params.token
		};
	}

	// Prevent self-acceptance (appUser is non-null here: needsAuth guard above returned early)
	if (locals.appUser!.id === qr.initiatingUserId) {
		return {
			expired: true,
			error: 'You cannot accept your own QR code.'
		};
	}

	const initiatorBalance = await getBalance(qr.initiatingUserId);

	return {
		expired: false,
		needsAuth: false,
		qrId: qr.id,
		direction: qr.direction,
		amount: qr.amount,
		formattedAmount: formatAmount(qr.amount),
		note: qr.note,
		initiatorName: initiator.displayName,
		initiatorBalance: formatAmount(initiatorBalance),
		token: params.token
	};
};

function setQrReturnCookies(
	cookies: import('@sveltejs/kit').Cookies,
	token: string,
	skipIntros: boolean
) {
	const opts = { path: '/', httpOnly: true, sameSite: 'lax' as const, maxAge: config.qrTtlSeconds };
	cookies.set('qr_return_to', `/accept/${token}`, opts);
	if (skipIntros) cookies.set('qr_skip_intros', '1', opts);
}

export const actions: Actions = {
	startFastTrack: async ({ params, cookies }) => {
		setQrReturnCookies(cookies, params.token, true);
		redirect(307, '/onboarding/phone');
	},

	startFullOnboarding: async ({ params, cookies }) => {
		setQrReturnCookies(cookies, params.token, false);
		redirect(307, '/onboarding');
	},

	accept: async ({ request, locals }) => {
		if (!locals.session || !locals.appUser) {
			error(401, 'Not authenticated');
		}

		const data = await request.formData();
		const qrId = data.get('qrId') as string;

		const [qr] = await db.select().from(pendingQr).where(eq(pendingQr.id, qrId)).limit(1);
		if (!qr || qr.status !== 'pending' || qr.expiresAt < new Date()) {
			return fail(400, { error: 'This QR code has expired or already been used.' });
		}

		if (locals.appUser.id === qr.initiatingUserId) {
			return fail(400, { error: 'You cannot accept your own QR code.' });
		}

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

		await db.insert(transactions).values({
			id: txId,
			fromUserId,
			toUserId,
			amount: qr.amount,
			unitCode: config.unitCode,
			note: qr.note,
			pendingQrId: qr.id,
			createdAt: new Date()
		});

		await db.update(pendingQr).set({ status: 'completed' }).where(eq(pendingQr.id, qr.id));

		await upsertConnection(fromUserId, toUserId);

		// Notify both parties. Data prep uses individual fallbacks so a formatting
		// or look-up failure can never silently prevent the emit() calls.
		const acceptingUser = locals.appUser;

		let formattedAmt: string;
		try {
			formattedAmt = formatAmount(qr.amount);
		} catch {
			formattedAmt = String(qr.amount);
		}

		let initiatorName = 'Someone';
		try {
			const [initiatingUser] = await db
				.select({ displayName: appUsers.displayName })
				.from(appUsers)
				.where(eq(appUsers.id, qr.initiatingUserId))
				.limit(1);
			initiatorName = initiatingUser?.displayName ?? 'Someone';
		} catch (err) {
			console.error('Failed to look up initiating user for notification:', err);
		}

		const eventId = randomUUID();
		const completedForInitiator = {
			type: 'qr_completed' as const,
			id: eventId,
			qrId: qr.id,
			otherName: acceptingUser.displayName,
			formattedAmount: formattedAmt
		};
		const completedForAcceptor = {
			type: 'qr_completed' as const,
			id: randomUUID(),
			qrId: qr.id,
			otherName: initiatorName,
			formattedAmount: formattedAmt
		};

		// SSE: push to any open tabs for both users.
		emit(qr.initiatingUserId, completedForInitiator);
		emit(acceptingUser.id, completedForAcceptor);

		// Push: only needed for the initiator (acceptor is present, SW will postMessage instead).
		sendPushToUser(qr.initiatingUserId, completedForInitiator).catch((err) => {
			console.error('Push notification failed for QR acceptance:', err);
		});

		redirect(307, '/home');
	},

	decline: async ({ request, params }) => {
		const data = await request.formData();
		const qrId = data.get('qrId') as string;

		// Verify the token to ensure the decline is bound to the correct QR code.
		let tokenData;
		try {
			tokenData = await verifyQrToken(params.token);
		} catch {
			return fail(400, { error: 'Invalid or expired token.' });
		}
		if (!qrId || qrId !== tokenData.jti) {
			return fail(400, { error: 'QR ID does not match token.' });
		}

		const [qr] = await db
			.select({ initiatingUserId: pendingQr.initiatingUserId })
			.from(pendingQr)
			.where(eq(pendingQr.id, qrId))
			.limit(1);

		await db.update(pendingQr).set({ status: 'declined' }).where(eq(pendingQr.id, qrId));

		if (qr) {
			const declinedEvent = { type: 'qr_declined' as const, id: randomUUID(), qrId };
			emit(qr.initiatingUserId, declinedEvent);
			sendPushToUser(qr.initiatingUserId, declinedEvent).catch((err) => {
				console.error('Push notification failed for QR decline:', err);
			});
		}

		redirect(307, '/home');
	}
};
