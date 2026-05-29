// SPDX-License-Identifier: AGPL-3.0-or-later

import { redirect, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { paymentRequests } from '$lib/server/schema';
import { eq, and } from 'drizzle-orm';
import { buildPaymentRequestUrl, buildReusableUrl } from '$lib/server/qr';
import { config } from '$lib/config';
import { currencyFractionDigits } from '$lib/server/currency';
import {
	getPendingItemById,
	pausePaymentRequest,
	resumePaymentRequest,
	archivePaymentRequest
} from '$lib/server/payment-requests';
import { shareText } from '$lib/server/share-text';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const appUser = locals.appUser!;

	const resumeQrId = url.searchParams.get('qrId');
	let resumeQr: {
		qrUrl: string;
		qrId: string;
		expiresAt: string | null;
		isExpired: boolean;
		isReusable: boolean;
		paymentCount?: number;
		shareDescription?: string;
	} | null = null;

	if (resumeQrId) {
		const item = await getPendingItemById(resumeQrId, appUser.id);
		if (item && item.direction === 'receive' && item.status === 'active') {
			if (item.reusable) {
				resumeQr = {
					qrUrl: buildReusableUrl(item.id),
					qrId: item.id,
					expiresAt: null,
					isExpired: false,
					isReusable: true,
					paymentCount: item.paymentCount ?? 0,
					shareDescription:
						item.amount === null ? item.note || undefined : shareText(item.amount, item.note)
				};
			} else if (item.isExpired) {
				resumeQr = {
					qrUrl: '',
					qrId: item.id,
					expiresAt: item.expiresAt?.toISOString() ?? '',
					isExpired: true,
					isReusable: false
				};
			} else {
				resumeQr = {
					qrUrl: buildPaymentRequestUrl(item.id),
					qrId: item.id,
					expiresAt: item.expiresAt?.toISOString() ?? '',
					isExpired: false,
					isReusable: false,
					shareDescription: shareText(item.amount ?? 0, item.note)
				};
			}
		}
	}

	return {
		appName: config.appName,
		unitCode: config.unitCode,
		qrTtlSeconds: config.qrTtlSeconds,
		resumeQr
	};
};

export const actions: Actions = {
	createQr: async ({ request, locals }) => {
		const userId = locals.appUser!.id;
		const displayName = locals.appUser!.displayName;
		const data = await request.formData();

		const amountStr = data.get('amount') as string;
		const note = (data.get('note') as string)?.trim().slice(0, 120) || null;
		const reusable = data.get('reusable') === 'on';
		const dp = currencyFractionDigits();

		let amount: number | null = null;

		if (amountStr && amountStr.trim() !== '') {
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
			amount = Math.round(floatAmount * Math.pow(10, dp));
		} else if (!reusable) {
			return fail(400, { error: 'Enter a valid amount.' });
		}

		const now = new Date();
		const qrId = crypto.randomUUID();

		if (reusable) {
			await db.insert(paymentRequests).values({
				id: qrId,
				initiatingUserId: userId,
				direction: 'receive',
				amount,
				description: note,
				initiatorName: displayName,
				reusable: true,
				createdAt: now,
				updatedAt: now,
				expiresAt: null,
				status: 'active'
			});

			const shareDesc = amount === null ? note || null : shareText(amount, note);

			return {
				qrUrl: buildReusableUrl(qrId),
				qrId,
				expiresAt: null,
				isReusable: true,
				paymentCount: 0,
				shareDescription: shareDesc
			};
		} else {
			const ttl = config.qrTtlSeconds;
			await db.insert(paymentRequests).values({
				id: qrId,
				initiatingUserId: userId,
				direction: 'receive',
				amount,
				description: note,
				initiatorName: displayName,
				reusable: false,
				createdAt: now,
				updatedAt: now,
				expiresAt: new Date(now.getTime() + ttl * 1000),
				status: 'active'
			});

			return {
				qrUrl: buildPaymentRequestUrl(qrId),
				qrId,
				expiresAt: new Date(now.getTime() + ttl * 1000).toISOString(),
				isReusable: false,
				shareDescription: shareText(amount ?? 0, note)
			};
		}
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
	},

	pause: async ({ request, locals }) => {
		const data = await request.formData();
		const qrId = data.get('qrId') as string;
		if (qrId) await pausePaymentRequest(qrId, locals.appUser!.id);
		redirect(307, '/home');
	},

	resume: async ({ request, locals }) => {
		const data = await request.formData();
		const qrId = data.get('qrId') as string;
		if (qrId) await resumePaymentRequest(qrId, locals.appUser!.id);
		redirect(303, `/receive?qrId=${qrId}`);
	},

	archive: async ({ request, locals }) => {
		const data = await request.formData();
		const qrId = data.get('qrId') as string;
		if (qrId) await archivePaymentRequest(qrId, locals.appUser!.id);
		redirect(307, '/home');
	}
};
