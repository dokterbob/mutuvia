// SPDX-License-Identifier: AGPL-3.0-or-later

import { redirect, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { appUsers, paymentRequests } from '$lib/server/schema';
import { eq, and } from 'drizzle-orm';
import { buildPaymentRequestUrl } from '$lib/server/qr';
import { config } from '$lib/config';
import { currencyFractionDigits } from '$lib/server/currency';
import { parseAmount } from '$lib/server/amount';
import { getPendingItemById } from '$lib/server/payment-requests';
import { getExpiryOptions, resolveExpiryPreset } from '$lib/server/qr-expiry';
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
		expiryOptions: getExpiryOptions(false),
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

		const amountStr = data.get('amount');
		const note = (data.get('note') as string)?.trim().slice(0, 120) || null;
		const dp = currencyFractionDigits();

		const amount = parseAmount(amountStr, dp);
		if (amount === null) {
			return fail(400, { error: 'Enter a valid amount.' });
		}

		// A send QR is always one-time, so "never" is never an option here —
		// see resolveExpiryPreset()/getExpiryOptions(false).
		const expiry = resolveExpiryPreset(data.get('expiryPreset'), false);
		if (!expiry.ok) {
			return fail(400, { error: expiry.error });
		}

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
			expiresAt: expiry.expiresAt,
			status: 'active'
		});

		return {
			qrUrl: buildPaymentRequestUrl(qrId),
			qrId,
			expiresAt: expiry.expiresAt?.toISOString() ?? '',
			shareDescription: shareText(amount, note)
		};
	},

	cancel: async ({ request, locals }) => {
		const data = await request.formData();
		const qrId = data.get('qrId') as string;
		if (qrId) {
			await db
				.update(paymentRequests)
				.set({ status: 'declined' })
				.where(
					and(
						eq(paymentRequests.id, qrId),
						eq(paymentRequests.initiatingUserId, locals.appUser!.id),
						eq(paymentRequests.reusable, false),
						eq(paymentRequests.status, 'active')
					)
				);
		}
		redirect(307, '/home');
	}
};
