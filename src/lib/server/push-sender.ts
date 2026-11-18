// SPDX-License-Identifier: AGPL-3.0-or-later

// Sends a NotificationEvent to all push subscriptions for a given user.
// Best-effort: never throws. Silently removes stale subscriptions (410/404).

import webpush from 'web-push';
import { db } from '$lib/server/db';
import { pushSubscriptions } from '$lib/server/schema';
import { eq, and } from 'drizzle-orm';
import { config } from '$lib/config';
import { validatePushEndpoint } from '$lib/server/push-endpoint';
import type { NotificationEvent } from '$lib/notifications';

// Bounds how long we wait on a single subscriber's push service before giving
// up — without this, a slow/unresponsive endpoint could hold open sockets
// indefinitely (the underlying https.request has no default timeout).
const PUSH_SEND_TIMEOUT_MS = 10_000;

function getVapidDetails() {
	return {
		subject: config.vapidSubject,
		publicKey: config.vapidPublicKey,
		privateKey: config.vapidPrivateKey
	};
}

async function removeSubscription(userId: string, endpoint: string): Promise<void> {
	await db
		.delete(pushSubscriptions)
		.where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}

export async function sendPushToUser(userId: string, event: NotificationEvent): Promise<void> {
	try {
		const subs = await db
			.select()
			.from(pushSubscriptions)
			.where(eq(pushSubscriptions.userId, userId));

		if (subs.length === 0) {
			console.info(`[push] no subscriptions for user ${userId} — skipping`);
			return;
		}

		console.info(
			`[push] delivering ${event.type} to user ${userId} (${subs.length} subscription${subs.length === 1 ? '' : 's'})`
		);
		const vapid = getVapidDetails();
		const payload = JSON.stringify(event);
		const extraHosts = config.pushEndpointExtraHosts;

		await Promise.all(
			subs.map(async (sub) => {
				// Re-validate at send time: rows already in the database (from before
				// this allowlist existed, or written by an older server version) must
				// not bypass it. Invalid rows are deleted, not retried.
				const validation = validatePushEndpoint(sub.endpoint, extraHosts);
				if (!validation.ok) {
					console.info(
						`[push] removing subscription with disallowed endpoint for user ${userId}: ${validation.reason}`
					);
					await removeSubscription(userId, sub.endpoint);
					return;
				}

				try {
					await webpush.sendNotification(
						{ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
						payload,
						{ vapidDetails: vapid, timeout: PUSH_SEND_TIMEOUT_MS }
					);
				} catch (err: unknown) {
					const status = (err as { statusCode?: number }).statusCode;
					if (status === 410 || status === 404) {
						// Subscription expired or gone — clean it up.
						console.info(`[push] removing stale subscription for user ${userId} (HTTP ${status})`);
						await removeSubscription(userId, sub.endpoint);
					} else {
						// All other errors: log status + host only, never the full
						// WebPushError (its message/body can include response payloads
						// from the push service, which we don't want in logs).
						console.error(
							`[push] send failed for user ${userId} (HTTP ${status ?? 'unknown'}, host ${validation.url.hostname})`
						);
					}
				}
			})
		);
	} catch (err: unknown) {
		// Top-level guard: this function is best-effort and should never throw.
		console.error(`sendPushToUser failed for user ${userId}:`, err);
	}
}
