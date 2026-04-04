// SPDX-License-Identifier: AGPL-3.0-or-later

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { pushSubscriptions } from '$lib/server/schema';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.appUser) {
		return new Response(null, { status: 401 });
	}

	const body = await request.json().catch(() => null);
	if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
		return json(
			{ error: 'Missing required fields: endpoint, keys.p256dh, keys.auth' },
			{ status: 400 }
		);
	}

	const userId = locals.appUser.id;
	const { endpoint, keys, userAgent } = body as {
		endpoint: string;
		keys: { p256dh: string; auth: string };
		userAgent?: string;
	};

	const id = randomUUID();
	await db
		.insert(pushSubscriptions)
		.values({
			id,
			userId,
			endpoint,
			p256dh: keys.p256dh,
			auth: keys.auth,
			userAgent: userAgent ?? null,
			createdAt: new Date()
		})
		.onConflictDoNothing();

	// Fetch the row (whether newly inserted or pre-existing from conflict).
	const [row] = await db
		.select({ id: pushSubscriptions.id })
		.from(pushSubscriptions)
		.where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
		.limit(1);

	const isNew = row!.id === id;
	console.info(`[push] subscription ${isNew ? 'stored' : 'already exists'} for user ${userId}`);
	return json({ id: row!.id }, { status: isNew ? 201 : 200 });
};
