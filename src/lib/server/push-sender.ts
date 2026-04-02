// SPDX-License-Identifier: AGPL-3.0-or-later

// Sends a NotificationEvent to all push subscriptions for a given user.
// Best-effort: never throws. Silently removes stale subscriptions (410/404).

import webpush from 'web-push';
import { db } from '$lib/server/db';
import { pushSubscriptions } from '$lib/server/schema';
import { eq, and } from 'drizzle-orm';
import { config } from '$lib/config';
import type { NotificationEvent } from '$lib/notifications';

function getVapidDetails() {
	return {
		subject: config.vapidSubject,
		publicKey: config.vapidPublicKey,
		privateKey: config.vapidPrivateKey
	};
}

export async function sendPushToUser(userId: string, event: NotificationEvent): Promise<void> {
	const subs = await db
		.select()
		.from(pushSubscriptions)
		.where(eq(pushSubscriptions.userId, userId));

	if (subs.length === 0) return;

	const vapid = getVapidDetails();
	const payload = JSON.stringify(event);

	await Promise.all(
		subs.map(async (sub) => {
			try {
				await webpush.sendNotification(
					{ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
					payload,
					{ vapidDetails: vapid }
				);
			} catch (err: unknown) {
				const status = (err as { statusCode?: number }).statusCode;
				if (status === 410 || status === 404) {
					// Subscription expired or gone — clean it up.
					await db
						.delete(pushSubscriptions)
						.where(
							and(
								eq(pushSubscriptions.userId, userId),
								eq(pushSubscriptions.endpoint, sub.endpoint)
							)
						);
				}
				// All other errors: log and continue so one bad sub doesn't block the rest.

				console.error(`Push send failed for user ${userId}:`, err);
			}
		})
	);
}
