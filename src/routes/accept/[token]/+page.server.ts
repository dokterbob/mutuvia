// SPDX-License-Identifier: AGPL-3.0-or-later

import { redirect, fail, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { paymentRequests, transactions } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { getBalance, upsertConnection } from '$lib/server/balance';
import { formatAmount } from '$lib/server/currency';
import { config } from '$lib/config';
import { emit } from '$lib/server/sse-registry';
import { sendPushToUser } from '$lib/server/push-sender';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const [qr] = await db
		.select()
		.from(paymentRequests)
		.where(eq(paymentRequests.id, params.token))
		.limit(1);
	if (!qr || qr.status !== 'active' || (qr.expiresAt && qr.expiresAt < new Date())) {
		return {
			expired: true,
			error: 'This link has expired or is invalid.'
		};
	}

	if (qr.reusable) {
		redirect(307, `/send/${qr.id}`);
	}

	if (!locals.session || !locals.appUser) {
		return {
			expired: false,
			needsAuth: true,
			qrId: qr.id,
			direction: qr.direction,
			amount: qr.amount,
			formattedAmount: formatAmount(qr.amount ?? 0),
			note: qr.description,
			initiatorName: qr.initiatorName,
			token: params.token
		};
	}

	// Prevent self-acceptance (locals.appUser is narrowed to non-null by the check above)
	if (locals.appUser.id === qr.initiatingUserId) {
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
		formattedAmount: formatAmount(qr.amount ?? 0),
		note: qr.description,
		initiatorName: qr.initiatorName,
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

		const [qr] = await db
			.select()
			.from(paymentRequests)
			.where(eq(paymentRequests.id, qrId))
			.limit(1);
		if (!qr || qr.status !== 'active' || (qr.expiresAt && qr.expiresAt < new Date())) {
			return fail(400, { error: 'This QR code has expired or already been used.' });
		}

		if (qr.reusable) {
			redirect(303, `/send/${qr.id}`);
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
		const txId = crypto.randomUUID();

		await db.insert(transactions).values({
			id: txId,
			fromUserId,
			toUserId,
			amount: qr.amount ?? 0,
			unitCode: config.unitCode,
			note: qr.description,
			paymentRequestId: qr.id,
			createdAt: new Date()
		});

		await db
			.update(paymentRequests)
			.set({ status: 'completed' })
			.where(eq(paymentRequests.id, qr.id));

		await upsertConnection(fromUserId, toUserId);

		// Notify both parties. Data prep uses individual fallbacks so a formatting
		// or look-up failure can never silently prevent the emit() calls.
		const acceptingUser = locals.appUser;

		// formatAmount never throws — it falls back to a locale-independent string
		// when Paraglide's AsyncLocalStorage context is unavailable.
		const formattedAmt = formatAmount(qr.amount ?? 0);
		const initiatorName = qr.initiatorName;

		const eventId = crypto.randomUUID();
		const completedForInitiator = {
			type: 'qr_completed' as const,
			id: eventId,
			qrId: qr.id,
			otherName: acceptingUser.displayName,
			formattedAmount: formattedAmt
		};
		const completedForAcceptor = {
			type: 'qr_completed' as const,
			id: crypto.randomUUID(),
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

		if (!qrId || qrId !== params.token) {
			return fail(400, { error: 'Invalid QR ID.' });
		}

		const [qr] = await db
			.select({
				initiatingUserId: paymentRequests.initiatingUserId,
				reusable: paymentRequests.reusable
			})
			.from(paymentRequests)
			.where(eq(paymentRequests.id, qrId))
			.limit(1);

		if (qr?.reusable) {
			redirect(303, `/send/${qrId}`);
		}

		await db
			.update(paymentRequests)
			.set({ status: 'declined' })
			.where(eq(paymentRequests.id, qrId));

		if (qr) {
			const declinedEvent = { type: 'qr_declined' as const, id: crypto.randomUUID(), qrId };
			emit(qr.initiatingUserId, declinedEvent);
			sendPushToUser(qr.initiatingUserId, declinedEvent).catch((err) => {
				console.error('Push notification failed for QR decline:', err);
			});
		}

		redirect(307, '/home');
	}
};
