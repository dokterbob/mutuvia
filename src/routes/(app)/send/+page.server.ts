// SPDX-License-Identifier: AGPL-3.0-or-later

import { redirect, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { appUsers, paymentRequests } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { buildPaymentRequestUrl } from '$lib/server/qr';
import { config } from '$lib/config';
import { currencyFractionDigits } from '$lib/server/currency';
import { getPendingItemById } from '$lib/server/payment-requests';
import { shareText } from '$lib/server/share-text';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const appUser = locals.appUser!;
	const needsConsent = !appUser.sendConsentAt;

	const resumeQrId = url.searchParams.get('qrId');
	let resumeQr: {
		qrUrl: string;
		qrId: string;
		expiresAt: string;
		isExpired: boolean;
		shareDescription?: string;
	} | null = null;

	if (resumeQrId) {
		const item = await getPendingItemById(resumeQrId, appUser.id);
		if (item && item.direction === 'send' && item.status === 'active') {
			if (item.isExpired) {
				resumeQr = {
					qrUrl: '',
					qrId: item.id,
					expiresAt: item.expiresAt?.toISOString() ?? '',
					isExpired: true
				};
			} else {
				resumeQr = {
					qrUrl: buildPaymentRequestUrl(item.id),
					qrId: item.id,
					expiresAt: item.expiresAt?.toISOString() ?? '',
					isExpired: false,
					shareDescription: shareText(item.amount ?? 0, item.note)
				};
			}
		}
	}

	return {
		needsConsent,
		appName: config.appName,
		unitCode: config.unitCode,
		qrTtlSeconds: config.qrTtlSeconds,
		resumeQr
	};
};

export const actions: Actions = {
	consent: async ({ locals }) => {
		const userId = locals.appUser!.id;
		await db.update(appUsers).set({ sendConsentAt: new Date() }).where(eq(appUsers.id, userId));
		return { consented: true };
	},

	createQr: async ({ request, locals }) => {
		const userId = locals.appUser!.id;
		const displayName = locals.appUser!.displayName;
		const data = await request.formData();

		const amountStr = data.get('amount') as string;
		const note = (data.get('note') as string)?.trim().slice(0, 120) || null;
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
		const ttl = config.qrTtlSeconds;
		const now = new Date();
		const qrId = crypto.randomUUID();

		await db.insert(paymentRequests).values({
			id: qrId,
			initiatingUserId: userId,
			direction: 'send',
			amount,
			description: note,
			initiatorName: displayName,
			createdAt: now,
			updatedAt: now,
			expiresAt: new Date(now.getTime() + ttl * 1000),
			status: 'active'
		});

		return {
			qrUrl: buildPaymentRequestUrl(qrId),
			qrId,
			expiresAt: new Date(now.getTime() + ttl * 1000).toISOString(),
			shareDescription: shareText(amount, note)
		};
	},

	cancel: async ({ request }) => {
		const data = await request.formData();
		const qrId = data.get('qrId') as string;
		if (qrId) {
			await db
				.update(paymentRequests)
				.set({ status: 'declined' })
				.where(eq(paymentRequests.id, qrId));
		}
		redirect(307, '/home');
	}
};
