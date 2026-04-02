// SPDX-License-Identifier: AGPL-3.0-or-later

// Routing logic for push notification delivery.
// Extracted from service-worker.ts so it can be unit-tested with mocked SW globals.

import type { NotificationEvent } from './notifications';

export type WindowClient = {
	focused: boolean;
	postMessage(data: unknown): void;
};

export type SwContext = {
	clients: {
		matchAll(options: { type: 'window'; includeUncontrolled: boolean }): Promise<WindowClient[]>;
	};
	registration: {
		showNotification(title: string, options?: NotificationOptions): Promise<void>;
	};
};

function buildNotificationOptions(event: NotificationEvent): {
	title: string;
	options: NotificationOptions;
} {
	switch (event.type) {
		case 'qr_completed':
			return {
				title: 'Transaction settled',
				options: {
					body: `${event.otherName} · ${event.formattedAmount}`,
					icon: '/icon-192x192.png',
					tag: `qr-${event.qrId}`,
					data: event
				}
			};
		case 'qr_declined':
			return {
				title: 'Transaction declined',
				options: {
					body: 'Your payment request was declined.',
					icon: '/icon-192x192.png',
					tag: `qr-${event.qrId}`,
					data: event
				}
			};
		case 'balance_changed':
			return {
				title: 'Balance updated',
				options: {
					body: event.formattedBalance,
					icon: '/icon-192x192.png',
					tag: 'balance',
					data: event
				}
			};
	}
}

export async function routeNotificationEvent(
	ctx: SwContext,
	event: NotificationEvent
): Promise<void> {
	const clients = await ctx.clients.matchAll({ type: 'window', includeUncontrolled: false });
	const focused = clients.find((c) => c.focused);

	if (focused) {
		focused.postMessage({ type: 'push-notification', payload: event });
		return;
	}

	const { title, options } = buildNotificationOptions(event);
	await ctx.registration.showNotification(title, options);
}
