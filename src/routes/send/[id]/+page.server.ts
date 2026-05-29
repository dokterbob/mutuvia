// SPDX-License-Identifier: AGPL-3.0-or-later

import { error, fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { paymentRequests } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { formatAmount, currencyFractionDigits } from '$lib/server/currency';
import { getBalance } from '$lib/server/balance';
import { settleReusable } from '$lib/server/payment-requests';
import { emit } from '$lib/server/sse-registry';
import { sendPushToUser } from '$lib/server/push-sender';
import { config } from '$lib/config';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ params, locals, cookies }) => {
	const [qr] = await db
		.select()
		.from(paymentRequests)
		.where(eq(paymentRequests.id, params.id))
		.limit(1);

	if (!qr) {
		error(404, 'Not found');
	}

	if (qr.status === 'paused') {
		return { paused: true, initiatorName: qr.initiatorName };
	}

	if (qr.status !== 'active') {
		return { expired: true, error: 'This QR is no longer active.' };
	}

	if (qr.expiresAt && qr.expiresAt < new Date()) {
		return { expired: true, error: 'This QR has expired.' };
	}

	if (!qr.reusable) error(404, 'Not found');

	if (!locals.session || !locals.appUser) {
		const cookieAmount = cookies.get('qr_amount');
		const prefilledAmount = cookieAmount ? parseInt(cookieAmount, 10) : null;
		return {
			needsAuth: true,
			qrId: qr.id,
			initiatorName: qr.initiatorName,
			description: qr.description,
			amount: qr.amount,
			formattedAmount: qr.amount ? formatAmount(qr.amount) : null,
			prefilledAmount,
			unitCode: config.unitCode
		};
	}

	if (locals.appUser.id === qr.initiatingUserId) {
		return { selfSend: true, initiatorName: qr.initiatorName };
	}

	const scannerBalance = await getBalance(locals.appUser.id);
	const cookieAmount = cookies.get('qr_amount');
	const prefilledAmount = cookieAmount ? parseInt(cookieAmount, 10) : null;
	return {
		qrId: qr.id,
		initiatorName: qr.initiatorName,
		description: qr.description,
		amount: qr.amount,
		formattedAmount: qr.amount ? formatAmount(qr.amount) : null,
		prefilledAmount,
		scannerBalance,
		formattedScannerBalance: formatAmount(scannerBalance),
		needsAuth: false,
		selfSend: false,
		paused: false,
		expired: false,
		unitCode: config.unitCode
	};
};

function setSendReturnCookies(
	cookies: import('@sveltejs/kit').Cookies,
	id: string,
	amount: number | null,
	skipIntros: boolean
) {
	const opts = { path: '/', httpOnly: true, sameSite: 'lax' as const, maxAge: config.qrTtlSeconds };
	cookies.set('qr_return_to', `/send/${id}`, opts);
	if (amount !== null) {
		cookies.set('qr_amount', String(amount), opts);
	} else {
		cookies.delete('qr_amount', { path: '/' });
	}
	if (skipIntros) cookies.set('qr_skip_intros', '1', opts);
}

export const actions: Actions = {
	startFastTrack: async ({ params, cookies, request }) => {
		const data = await request.formData();
		const amountStr = data.get('amount') as string | null;
		const amount = amountStr ? parseFloat(amountStr) : null;
		const dp = currencyFractionDigits();
		const amountInt = amount && amount > 0 ? Math.round(amount * Math.pow(10, dp)) : null;
		setSendReturnCookies(cookies, params.id, amountInt, true);
		redirect(307, '/onboarding/phone');
	},

	startFullOnboarding: async ({ params, cookies, request }) => {
		const data = await request.formData();
		const amountStr = data.get('amount') as string | null;
		const amount = amountStr ? parseFloat(amountStr) : null;
		const dp = currencyFractionDigits();
		const amountInt = amount && amount > 0 ? Math.round(amount * Math.pow(10, dp)) : null;
		setSendReturnCookies(cookies, params.id, amountInt, false);
		redirect(307, '/onboarding');
	},

	send: async ({ params, request, locals, cookies }) => {
		if (!locals.session || !locals.appUser) error(401, 'Not authenticated');

		const data = await request.formData();
		const amountStr = data.get('amount') as string;
		const dp = currencyFractionDigits();
		const floatAmount = parseFloat(amountStr);

		if (isNaN(floatAmount) || floatAmount <= 0) {
			return fail(400, { error: 'Enter a valid amount.' });
		}

		const submittedDecimals = amountStr.includes('.') ? amountStr.split('.')[1].length : 0;
		if (submittedDecimals > dp) {
			return fail(400, {
				error: `Amount cannot have more than ${dp} decimal place${dp === 1 ? '' : 's'}.`
			});
		}

		const amount = Math.round(floatAmount * Math.pow(10, dp));

		const result = await settleReusable(params.id, locals.appUser.id, amount);

		if (!result.ok) {
			return fail(result.status, { error: result.error });
		}

		const [qr] = await db
			.select()
			.from(paymentRequests)
			.where(eq(paymentRequests.id, params.id))
			.limit(1);

		if (qr) {
			const formattedAmt = formatAmount(amount);
			const event = {
				type: 'reusable_payment' as const,
				id: crypto.randomUUID(),
				paymentRequestId: qr.id,
				senderName: locals.appUser.displayName,
				formattedAmount: formattedAmt,
				description: qr.description
			};
			emit(qr.initiatingUserId, event);
			sendPushToUser(qr.initiatingUserId, event).catch((err) => {
				console.error('Push notification failed for reusable payment:', err);
			});
		}

		cookies.delete('qr_amount', { path: '/' });

		return {
			success: true,
			formattedAmount: formatAmount(amount),
			initiatorName: qr?.initiatorName ?? ''
		};
	}
};
