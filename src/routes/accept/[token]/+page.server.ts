// SPDX-License-Identifier: AGPL-3.0-or-later

import { redirect, fail, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { paymentRequests } from '$lib/server/schema';
import { eq, and } from 'drizzle-orm';
import { getBalance } from '$lib/server/balance';
import { settleOneTimeAccept } from '$lib/server/payment-requests';
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
	if (!qr) {
		return {
			expired: true,
			error: 'This link has expired or is invalid.'
		};
	}

	if (qr.reusable) {
		redirect(307, `/send/${qr.id}`);
	}

	if (qr.status !== 'active' || (qr.expiresAt && qr.expiresAt < new Date())) {
		return {
			expired: true,
			error: 'This link has expired or is invalid.'
		};
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

	// The initiator's total balance is shown on this page only, only while the
	// visitor is deciding whether to accept money FROM the initiator (direction
	// 'send' — the initiator is sending), and only until accepted. It must never
	// be computed (let alone returned) for 'receive' QRs, where the visitor would
	// be the one paying — nor anywhere else in the app.
	const initiatorBalance =
		qr.direction === 'send' ? formatAmount(await getBalance(qr.initiatingUserId)) : null;

	return {
		expired: false,
		needsAuth: false,
		qrId: qr.id,
		direction: qr.direction,
		amount: qr.amount,
		formattedAmount: formatAmount(qr.amount ?? 0),
		note: qr.description,
		initiatorName: qr.initiatorName,
		initiatorBalance,
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

	accept: async ({ request, locals, params }) => {
		if (!locals.session || !locals.appUser) {
			error(401, 'Not authenticated');
		}

		const data = await request.formData();
		const qrId = data.get('qrId') as string;

		if (!qrId || qrId !== params.token) {
			return fail(400, { error: 'Invalid QR ID.' });
		}

		const [qr] = await db
			.select()
			.from(paymentRequests)
			.where(eq(paymentRequests.id, qrId))
			.limit(1);
		if (!qr) {
			return fail(400, { error: 'This QR code has expired or already been used.' });
		}

		if (qr.reusable) {
			redirect(303, `/send/${qr.id}`);
		}

		if (qr.status !== 'active' || (qr.expiresAt && qr.expiresAt < new Date())) {
			return fail(400, { error: 'This QR code has expired or already been used.' });
		}

		if (locals.appUser.id === qr.initiatingUserId) {
			return fail(400, { error: 'You cannot accept your own QR code.' });
		}

		// Atomic settlement: claims the QR (status='active' AND reusable=false AND
		// not expired), inserts the ledger row, and upserts the connection — all in
		// one DB transaction. Returns ok:false without writing anything if the claim
		// lost a race (concurrent accept, or a decline/cancel that landed first).
		const result = await settleOneTimeAccept(qr.id, locals.appUser.id);

		if (!result.ok) {
			return fail(result.status, { error: result.error });
		}

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

	decline: async ({ request, locals, params }) => {
		// A one-time link is bearer cash: any logged-in app user holding it other
		// than the initiator may decline it. An unauthenticated visitor cannot —
		// they have no account to attribute the decline to, and no stake in the
		// request — so they must sign in first (the UI doesn't offer this action
		// to them at all; this guard also covers a direct POST).
		if (!locals.session || !locals.appUser) {
			error(401, 'Not authenticated');
		}

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

		// The initiator can't decline their own request — they cancel it instead
		// (see the receive page's `cancel` action). The UI never shows this form to
		// the initiator (their own one-time link loads as "expired"), so this only
		// guards against a direct POST.
		if (qr && qr.initiatingUserId === locals.appUser.id) {
			return fail(400, { error: 'You cannot decline your own QR code.' });
		}

		await db
			.update(paymentRequests)
			.set({ status: 'declined' })
			.where(
				and(
					eq(paymentRequests.id, qrId),
					eq(paymentRequests.status, 'active'),
					eq(paymentRequests.reusable, false)
				)
			);

		if (qr) {
			const [updated] = await db
				.select({ status: paymentRequests.status })
				.from(paymentRequests)
				.where(eq(paymentRequests.id, qrId))
				.limit(1);
			if (updated?.status === 'declined') {
				const declinedEvent = { type: 'qr_declined' as const, id: crypto.randomUUID(), qrId };
				emit(qr.initiatingUserId, declinedEvent);
				sendPushToUser(qr.initiatingUserId, declinedEvent).catch((err) => {
					console.error('Push notification failed for QR decline:', err);
				});
			}
		}

		redirect(307, '/home');
	}
};
