// SPDX-License-Identifier: AGPL-3.0-or-later

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { pushSubscriptions } from '$lib/server/schema';
import { and, desc, eq, notInArray } from 'drizzle-orm';
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
	// A single INSERT ... ON CONFLICT ... RETURNING is one atomic statement,
	// so it both performs the upsert and tells us (via the returned id,
	// unchanged by the UPDATE branch) whether this was a fresh insert or an
	// existing/transferred row — no separate SELECT needed.
	const [row] = await db
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
		})
		.returning({ id: pushSubscriptions.id });

	const isNew = row!.id === id;

	// Cap subscriptions per user — a single DELETE whose subquery picks the
	// MAX_SUBSCRIPTIONS_PER_USER most recent rows is one atomic statement
	// (no separate SELECT-then-DELETE race), and is a no-op when the user is
	// still at or under the cap.
	await db
		.delete(pushSubscriptions)
		.where(
			and(
				eq(pushSubscriptions.userId, userId),
				notInArray(
					pushSubscriptions.id,
					db
						.select({ id: pushSubscriptions.id })
						.from(pushSubscriptions)
						.where(eq(pushSubscriptions.userId, userId))
						.orderBy(desc(pushSubscriptions.createdAt))
						.limit(MAX_SUBSCRIPTIONS_PER_USER)
				)
			)
		);

	console.info(`[push] subscription ${isNew ? 'stored' : 'already exists'} for user ${userId}`);
	return json({ id: row!.id }, { status: isNew ? 201 : 200 });
};

// Not wrapped together in a single cross-provider transaction: the upsert
// and the cap trim above are each one atomic statement on their own (no
// internal read-then-write race), but a request could in principle still
// observe >MAX_SUBSCRIPTIONS_PER_USER rows for an instant between them, or
// the trim could run against a user who has since subscribed again
// concurrently. Doing the whole thing as one transaction would need
// provider-specific implementation files and a dispatcher — the pattern
// settlement.sqlite.ts/settlement.pg.ts use for the ledger, where
// `db.transaction()` is synchronous on the SQLite driver and must never be
// handed an async callback (see the comment at the top of
// settlement.sqlite.ts). That's worth it for ledger correctness; it isn't
// here — the cap is a soft bound ("about 10", not a security property), and
// the window for the race is a single HTTP request's worth of time.
