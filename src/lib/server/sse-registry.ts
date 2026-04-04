// SPDX-License-Identifier: AGPL-3.0-or-later

// In-memory SSE connection registry.
// Maps userId → set of active stream controllers for that user.
// NOTE: single-process only — does not work across multiple Bun instances.
// If horizontal scaling is needed, replace with Redis pub/sub.

// Each event has a stable server-assigned id (crypto.randomUUID()).
// The SSE stream format uses:
//   id: <uuid>\n
//   data: <JSON>\n\n
// Events are dispatched as unnamed messages (no event: field) so the client's
// onmessage handler fires. Type routing is done via event.type in the JSON payload.

import type { NotificationEvent } from '$lib/notifications';

type Controller = ReadableStreamDefaultController<Uint8Array>;

const registry = new Map<string, Set<Controller>>();

const encoder = new TextEncoder();

/**
 * Register a stream controller for the given user.
 * Called when a new SSE connection is established.
 */
export function register(userId: string, controller: Controller): void {
	let controllers = registry.get(userId);
	if (!controllers) {
		controllers = new Set();
		registry.set(userId, controllers);
	}
	controllers.add(controller);
}

/**
 * Unregister a stream controller for the given user.
 * Called when the SSE connection is closed or cancelled.
 */
export function unregister(userId: string, controller: Controller): void {
	const controllers = registry.get(userId);
	if (!controllers) return;
	controllers.delete(controller);
	if (controllers.size === 0) {
		registry.delete(userId);
	}
}

/**
 * Emit a NotificationEvent to all active SSE connections for the given user.
 * Errors on individual controllers (e.g. already-closed connections) are caught
 * and silently ignored so that one bad client cannot crash the fan-out loop.
 */
export function emit(userId: string, event: NotificationEvent): void {
	const controllers = registry.get(userId);
	const count = controllers?.size ?? 0;
	console.info(
		`[sse] emit ${event.type} → user ${userId} (${count} connection${count === 1 ? '' : 's'})`
	);
	if (!controllers || count === 0) return;

	const payload = `id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`;

	const encoded = encoder.encode(payload);

	for (const controller of controllers) {
		try {
			controller.enqueue(encoded);
		} catch {
			// The client disconnected between our registry check and the enqueue.
			// Ignore — the cancel() callback will clean up the controller.
		}
	}
}
