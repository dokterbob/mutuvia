// SPDX-License-Identifier: AGPL-3.0-or-later

import { redirect, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { appUsers, pendingQr } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { signQrToken, buildQrUrl } from '$lib/server/qr';
import { randomUUID } from 'crypto';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const appUser = locals.appUser!;
	const needsConsent = !appUser.sendConsentAt;

	return {
		needsConsent,
		unitSymbol: process.env.PUBLIC_UNIT_SYMBOL || '€',
		decimalPlaces: parseInt(process.env.UNIT_DECIMAL_PLACES || '2', 10),
		qrTtlSeconds: parseInt(process.env.QR_TTL_SECONDS || '600', 10)
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
		const decimalPlaces = parseInt(process.env.UNIT_DECIMAL_PLACES || '2', 10);

		const floatAmount = parseFloat(amountStr);
		if (isNaN(floatAmount) || floatAmount <= 0) {
			return fail(400, { error: 'Enter a valid amount.' });
		}

		const amount = Math.round(floatAmount * Math.pow(10, decimalPlaces));
		const ttl = parseInt(process.env.QR_TTL_SECONDS || '600', 10);
		const now = new Date();
		const qrId = randomUUID();

		await db.insert(pendingQr).values({
			id: qrId,
			initiatingUserId: userId,
			direction: 'send',
			amount,
			note,
			createdAt: now,
			expiresAt: new Date(now.getTime() + ttl * 1000),
			status: 'pending'
		});

		const token = await signQrToken({ jti: qrId, amt: amount, dir: 'send', dn: displayName }, ttl);

		return {
			qrUrl: buildQrUrl(token),
			qrId,
			expiresAt: new Date(now.getTime() + ttl * 1000).toISOString()
		};
	},

	cancel: async ({ request }) => {
		const data = await request.formData();
		const qrId = data.get('qrId') as string;
		if (qrId) {
			await db.update(pendingQr).set({ status: 'declined' }).where(eq(pendingQr.id, qrId));
		}
		redirect(307, '/home');
	}
};
