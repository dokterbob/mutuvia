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
	try {
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
		let subscription = await registration.pushManager.getSubscription();
		if (subscription) {
			// Re-POST even though the browser already has a subscription: the
			// server endpoint is what records *who* currently owns it, and on a
			// shared device the previous user may still own this row otherwise.
			console.info('[push] Already subscribed — re-asserting ownership with the server');
		} else {
			console.info('[push] Subscribing to push notifications…');
			subscription = await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource
			});
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
	} catch (err) {
		console.warn('[push] subscribeToPush() failed:', err);
		return false;
	}
}

// Bounds how long sign-out waits on the *whole* best-effort cleanup below —
// not just the final fetch — before giving up: a slow/offline network, or a
// stalled navigator.serviceWorker.getRegistration() / getSubscription() /
// subscription.unsubscribe() call, must never block signing out.
const UNSUBSCRIBE_TIMEOUT_MS = 3000;

/**
 * Unsubscribes the browser's push subscription and tells the server to
 * forget it. Best-effort: never throws. The entire operation — including
 * navigator.serviceWorker.getRegistration() and pushManager.getSubscription(),
 * not just the server round trip — races against a single
 * UNSUBSCRIBE_TIMEOUT_MS deadline, so a stalled browser API can never hang
 * sign-out. subscription.unsubscribe() itself is fire-and-forget: once we
 * have the endpoint, telling the server (which is what actually stops future
 * pushes) takes priority over waiting on the browser-side call. Should be
 * called before signing out so the next person to use this device/browser
 * does not keep receiving the previous user's pushes.
 */
export async function unsubscribeFromPush(): Promise<void> {
	const abortController = new AbortController();

	let finishDeadline: () => void;
	const deadline = new Promise<void>((resolve) => {
		finishDeadline = resolve;
	});
	const timer = setTimeout(() => {
		abortController.abort();
		finishDeadline();
	}, UNSUBSCRIBE_TIMEOUT_MS);

	const work = (async () => {
		try {
			if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

			const registration = await navigator.serviceWorker.getRegistration();
			if (!registration) return;

			const subscription = await registration.pushManager.getSubscription();
			if (!subscription) return;

			const endpoint = subscription.endpoint;
			// Fire-and-forget: a stalled or slow browser-side unsubscribe must not
			// delay telling the server, which is what actually stops future
			// pushes to this endpoint.
			void subscription.unsubscribe().catch(() => {});

			await fetch('/api/push/unsubscribe', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ endpoint }),
				signal: abortController.signal
			}).catch(() => {
				// Best-effort — offline, the server errored, or aborted by the
				// shared deadline above. A stale row still gets cleaned up the next
				// time a push delivery to it 404s/410s (see push-sender.ts).
			});
		} catch (err) {
			console.warn('[push] unsubscribeFromPush() failed:', err);
		}
	})();

	try {
		await Promise.race([work, deadline]);
	} finally {
		clearTimeout(timer);
	}
}
