// SPDX-License-Identifier: AGPL-3.0-or-later

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { pushSubscriptions } from '$lib/server/schema';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { config } from '$lib/config';
import {
	validatePushEndpoint,
	validatePushKeys,
	capUserAgent,
	MAX_SUBSCRIPTIONS_PER_USER
} from '$lib/server/push-endpoint';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.appUser) {
		return new Response(null, { status: 401 });
	}

	const body = await request.json().catch(() => null);
	if (body === null || typeof body !== 'object') {
		return json({ error: 'Request body must be JSON' }, { status: 400 });
	}

	const endpointResult = validatePushEndpoint(
		(body as { endpoint?: unknown }).endpoint,
		config.pushEndpointExtraHosts
	);
	if (!endpointResult.ok) {
		return json({ error: endpointResult.reason }, { status: 400 });
	}

	const keysResult = validatePushKeys((body as { keys?: unknown }).keys);
	if (!keysResult.ok) {
		return json({ error: keysResult.reason }, { status: 400 });
	}

	const userId = locals.appUser.id;
	// Normalized form of the validated URL — not the raw input string.
	const endpoint = endpointResult.url.toString();
	const userAgent = capUserAgent((body as { userAgent?: unknown }).userAgent);

	const id = randomUUID();

	// `endpoint` is globally unique (see schema). If this endpoint was
	// previously registered to a different user — e.g. a shared or
	// handed-down device — ownership moves to the subscribing user instead
	// of leaving two owners receiving notifications for the same browser.
	await db
		.insert(pushSubscriptions)
		.values({
			id,
			userId,
			endpoint,
			p256dh: keysResult.p256dh,
			auth: keysResult.auth,
			userAgent,
			createdAt: new Date()
		})
		.onConflictDoUpdate({
			target: pushSubscriptions.endpoint,
			set: {
				userId,
				p256dh: keysResult.p256dh,
				auth: keysResult.auth,
				userAgent,
				createdAt: new Date()
			}
		});

	// Fetch the row (whether newly inserted, pre-existing, or just transferred).
	const [row] = await db
		.select({ id: pushSubscriptions.id })
		.from(pushSubscriptions)
		.where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
		.limit(1);

	const isNew = row!.id === id;

	// Cap subscriptions per user — drop the oldest beyond the cap.
	const userRows = await db
		.select({ id: pushSubscriptions.id })
		.from(pushSubscriptions)
		.where(eq(pushSubscriptions.userId, userId))
		.orderBy(desc(pushSubscriptions.createdAt));
	if (userRows.length > MAX_SUBSCRIPTIONS_PER_USER) {
		const excessIds = userRows.slice(MAX_SUBSCRIPTIONS_PER_USER).map((r) => r.id);
		await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, excessIds));
	}

	console.info(`[push] subscription ${isNew ? 'stored' : 'already exists'} for user ${userId}`);
	return json({ id: row!.id }, { status: isNew ? 201 : 200 });
};
