// SPDX-License-Identifier: AGPL-3.0-or-later

import { handleNotificationEvent, SeenEventIds } from './notifications';
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
	private lastEventId: string | null = null;
	private readonly seenIds = new SeenEventIds();
	private readonly handlerSets = new Set<NotificationHandlers>();
	private swMessageHandler: ((e: MessageEvent) => void) | null = null;

	/** Register handlers. Returns an unsubscribe function to remove them on cleanup. */
	on(handlers: NotificationHandlers): Unsubscribe {
		this.handlerSets.add(handlers);
		return () => this.handlerSets.delete(handlers);
	}

	connect(): void {
		if (this.es) return;

		const url = this.lastEventId
			? `/api/events?lastEventId=${encodeURIComponent(this.lastEventId)}`
			: '/api/events';

		this.es = new EventSource(url);

		this.es.onmessage = (e: MessageEvent) => {
			try {
				const event = JSON.parse(e.data) as NotificationEvent;
				if (e.lastEventId) this.lastEventId = e.lastEventId;
				this.dispatch(event);
			} catch {
				// malformed payload — ignore
			}
		};

		this.es.onerror = () => {
			this.es?.close();
			this.es = null;
			// Reconnect after a short delay; browser EventSource also retries automatically
			// but we reset state here to ensure clean reconnection.
			setTimeout(() => this.connect(), 3000);
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
		this.es?.close();
		this.es = null;
		if (this.swMessageHandler && typeof navigator !== 'undefined' && navigator.serviceWorker) {
			navigator.serviceWorker.removeEventListener('message', this.swMessageHandler);
			this.swMessageHandler = null;
		}
	}

	private dispatch(event: NotificationEvent): void {
		for (const handlers of this.handlerSets) {
			handleNotificationEvent(event, handlers, this.seenIds);
		}
	}
}

/** Singleton shared across the app. */
export const sseManager = new SseManager();
