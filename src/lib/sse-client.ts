// SPDX-License-Identifier: AGPL-3.0-or-later

import { SeenEventIds } from './notifications';
import type { NotificationEvent, NotificationHandlers } from './notifications';

type Unsubscribe = () => void;

/**
 * Manages a single SSE connection to /api/events.
 * Dispatches incoming events to registered handlers.
 * Also listens for SW → page push messages and routes them through the same path,
 * using SeenEventIds to prevent double-handling when both SSE and push deliver the same event.
 */
export class SseManager {
	private es: EventSource | null = null;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private readonly seenIds = new SeenEventIds();
	private readonly handlerSets = new Set<NotificationHandlers>();
	private swMessageHandler: ((e: MessageEvent) => void) | null = null;
	// Set when the server evicted this connection (connection-per-user cap —
	// see sse-registry.ts). While true, connect() will not auto-reconnect:
	// the server already told us it closed this stream on purpose, and
	// auto-retrying would just evict a different tab a few seconds later,
	// turning a one-off cap overflow into a reconnect storm. A later
	// explicit connect() call (e.g. a fresh page load/remount) clears it.
	private evicted = false;

	/** Register handlers. Returns an unsubscribe function to remove them on cleanup. */
	on(handlers: NotificationHandlers): Unsubscribe {
		this.handlerSets.add(handlers);
		return () => this.handlerSets.delete(handlers);
	}

	connect(): void {
		if (this.es) return;
		// An explicit connect() call is a fresh intent to reconnect (e.g. a page
		// reload or component remount) — clear any prior eviction.
		this.evicted = false;

		this.es = new EventSource('/api/events');

		this.es.onmessage = (e: MessageEvent) => {
			try {
				const event = JSON.parse(e.data) as NotificationEvent;
				this.dispatch(event);
			} catch {
				// malformed payload — ignore
			}
		};

		// Named SSE event from sse-registry.ts's connection cap: this specific
		// connection was evicted on purpose. Close without scheduling a
		// reconnect — see the `evicted` field comment above.
		this.es.addEventListener('evicted', () => {
			this.evicted = true;
			if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
			this.es?.close();
			this.es = null;
		});

		this.es.onerror = () => {
			if (this.evicted) return;
			this.es?.close();
			this.es = null;
			// Reconnect after a short delay; browser EventSource also retries automatically
			// but we reset state here to ensure clean reconnection.
			this.reconnectTimer = setTimeout(() => this.connect(), 3000);
		};

		// Route SW → page push messages through the same handler + dedup.
		if (typeof navigator !== 'undefined' && navigator.serviceWorker && !this.swMessageHandler) {
			this.swMessageHandler = (e: MessageEvent) => {
				if (e.data?.type === 'push-notification') {
					this.dispatch(e.data.payload as NotificationEvent);
				}
			};
			navigator.serviceWorker.addEventListener('message', this.swMessageHandler);
		}
	}

	disconnect(): void {
		if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
		this.reconnectTimer = null;
		this.es?.close();
		this.es = null;
		if (this.swMessageHandler && typeof navigator !== 'undefined' && navigator.serviceWorker) {
			navigator.serviceWorker.removeEventListener('message', this.swMessageHandler);
			this.swMessageHandler = null;
		}
	}

	private dispatch(event: NotificationEvent): void {
		if (this.seenIds.has(event.id)) return;
		this.seenIds.add(event.id);
		for (const handlers of this.handlerSets) {
			switch (event.type) {
				case 'qr_completed':
					handlers.onQrCompleted?.(event);
					break;
				case 'qr_declined':
					handlers.onQrDeclined?.(event);
					break;
				case 'balance_changed':
					handlers.onBalanceChanged?.(event);
					break;
				case 'reusable_payment':
					handlers.onReusablePayment?.(event);
					break;
			}
		}
	}
}

/** Singleton shared across the app. */
export const sseManager = new SseManager();
