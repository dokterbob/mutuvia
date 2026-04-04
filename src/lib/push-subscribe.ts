// SPDX-License-Identifier: AGPL-3.0-or-later

import { env } from '$env/dynamic/public';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
	const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
	const raw = atob(base64);
	const bytes = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i++) {
		bytes[i] = raw.charCodeAt(i);
	}
	return bytes;
}

/**
 * Requests notification permission and registers a Web Push subscription.
 * Idempotent: returns true immediately if already subscribed.
 * Best-effort: never throws — always returns a boolean.
 *
 * Should be called when the user creates a QR code so they receive a push
 * notification when it is scanned (even if the app is backgrounded).
 */
export async function subscribeToPush(): Promise<boolean> {
	const vapidKey = env.PUBLIC_VAPID_KEY;
	if (!vapidKey) {
		console.warn('[push] PUBLIC_VAPID_KEY not set — push notifications disabled');
		return false;
	}

	if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
		console.info('[push] PushManager not available in this browser');
		return false;
	}

	const permission = await Notification.requestPermission();
	if (permission !== 'granted') {
		console.info(`[push] Notification permission: ${permission}`);
		return false;
	}

	const registration = await navigator.serviceWorker.ready;
	const existing = await registration.pushManager.getSubscription();
	if (existing) {
		console.info('[push] Already subscribed');
		return true;
	}

	console.info('[push] Subscribing to push notifications…');
	let subscription: PushSubscription;
	try {
		subscription = await registration.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource
		});
	} catch (err) {
		console.warn('[push] pushManager.subscribe() failed:', err);
		return false;
	}

	const json = subscription.toJSON();
	const res = await fetch('/api/push/subscribe', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			endpoint: json.endpoint,
			keys: json.keys,
			userAgent: navigator.userAgent
		})
	});

	if (!res.ok) {
		console.warn(`[push] Subscribe endpoint returned ${res.status}`);
		return false;
	}

	console.info('[push] Successfully subscribed');
	return true;
}
