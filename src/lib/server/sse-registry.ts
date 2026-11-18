// SPDX-License-Identifier: AGPL-3.0-or-later

// In-memory SSE connection registry.
// Maps userId → ordered list of active connections for that user, and
// sessionId → the same connections, so a signed-out session's streams can be
// closed without touching that user's other devices/sessions.
// NOTE: single-process only — does not work across multiple Bun instances.
// If horizontal scaling is needed, replace with Redis pub/sub.

// Each event has a stable server-assigned id (crypto.randomUUID()).
// The SSE stream format uses:
//   id: <uuid>\n
//   data: <JSON>\n\n
// Events are dispatched as unnamed messages (no event: field) so the client's
// onmessage handler fires. Type routing is done via event.type in the JSON payload.
//
// A cap-evicted connection instead gets a *named* `evicted` SSE event (see
// EVICTED_FRAME below) before being closed. src/lib/sse-client.ts treats that
// as terminal and does not auto-reconnect, so evicting the oldest of several
// tabs sharing one account cannot turn into a reconnect storm that just
// evicts a different tab every few seconds.
//
// Teardown ownership: calling `controller.close()` from here does NOT run
// the owning ReadableStream's `cancel()` callback — that only fires when the
// *consumer* cancels the stream, never when the producer closes it. A route
// (src/routes/api/events/+server.ts) that only relied on its own `cancel()`
// to clear its `keepaliveTimer` would leak that interval forever once this
// registry closed the connection from the outside (eviction, closeSession) —
// the timer would keep firing and querying the database every tick for a
// stream nobody is reading anymore. To avoid that, `register()` accepts an
// optional `dispose` callback — the caller's own extra teardown (clear its
// keepalive timer, mark itself closed). The registry always removes the
// entry and closes the controller itself FIRST, then calls `dispose` purely
// as a courtesy notification; it never depends on what `dispose` does, so a
// caller that forgets to unregister in its own teardown (or a test double
// that's a no-op) can't leave a stale entry behind or spin the eviction loop
// forever.

import type { NotificationEvent } from '$lib/notifications';

type Controller = ReadableStreamDefaultController<Uint8Array>;

type Entry = {
	userId: string;
	sessionId: string;
	controller: Controller;
	dispose: () => void;
};

// Cap connections per user — evicting the oldest keeps a compromised/leaked
// account (or just a lot of open tabs) from accumulating unbounded streams.
export const MAX_CONNECTIONS_PER_USER = 5;

// userId -> entries, oldest first.
const byUser = new Map<string, Entry[]>();
// sessionId -> entries for that session (normally 1, but a session cookie
// can be open in several tabs at once).
const bySession = new Map<string, Set<Entry>>();

const encoder = new TextEncoder();

const EVICTED_FRAME = encoder.encode('event: evicted\ndata: {}\n\n');

function removeEntry(entry: Entry): void {
	const userEntries = byUser.get(entry.userId);
	if (userEntries) {
		const idx = userEntries.indexOf(entry);
		if (idx !== -1) userEntries.splice(idx, 1);
		if (userEntries.length === 0) byUser.delete(entry.userId);
	}
	const sessionEntries = bySession.get(entry.sessionId);
	if (sessionEntries) {
		sessionEntries.delete(entry);
		if (sessionEntries.size === 0) bySession.delete(entry.sessionId);
	}
}

/**
 * The registry's own half of closing a connection: always removes it from
 * both maps and closes its controller, regardless of what (if anything) the
 * caller's `dispose` does. Only after that does it call `dispose`, so the
 * caller gets a chance to clear its own keepalive timer etc. — but the
 * registry's own bookkeeping never depends on that callback running, or
 * running correctly.
 */
function closeEntry(entry: Entry, evicted: boolean): void {
	removeEntry(entry);
	if (evicted) {
		try {
			entry.controller.enqueue(EVICTED_FRAME);
		} catch {
			// already gone
		}
	}
	try {
		entry.controller.close();
	} catch {
		// already closed/errored
	}
	entry.dispose();
}

/**
 * Register a stream controller for the given user + session.
 * Called when a new SSE connection is established. If the user is already
 * at the connection cap, the oldest connection is sent a terminal `evicted`
 * event and closed first.
 *
 * `dispose` is the caller's own extra teardown (e.g. clear its keepalive
 * timer, mark itself closed) — called once the registry has already
 * removed the entry and closed the controller, so it's safe for `dispose`
 * to also unregister/close redundantly (both are idempotent).
 */
export function register(
	userId: string,
	sessionId: string,
	controller: Controller,
	dispose: () => void = () => {}
): void {
	let userEntries = byUser.get(userId);
	if (!userEntries) {
		userEntries = [];
		byUser.set(userId, userEntries);
	}

	while (userEntries.length >= MAX_CONNECTIONS_PER_USER) {
		closeEntry(userEntries[0], true);
	}

	const entry: Entry = { userId, sessionId, controller, dispose };
	userEntries.push(entry);

	let sessionEntries = bySession.get(sessionId);
	if (!sessionEntries) {
		sessionEntries = new Set();
		bySession.set(sessionId, sessionEntries);
	}
	sessionEntries.add(entry);
}

/**
 * Unregister a stream controller for the given user + session — removes it
 * from the registry's maps only, without closing anything or calling
 * `dispose`. Called by a route's own teardown when it is the one ending the
 * connection (client disconnect, self-detected invalid session) — calling
 * this directly (rather than going through `closeEntry`) is fine there
 * because the route itself already closes its own controller.
 */
export function unregister(userId: string, sessionId: string, controller: Controller): void {
	const userEntries = byUser.get(userId);
	const entry = userEntries?.find((e) => e.controller === controller && e.sessionId === sessionId);
	if (entry) removeEntry(entry);
}

/**
 * Closes every connection registered for the given session (no `evicted`
 * signal — the caller, e.g. a Better Auth sign-out hook, already knows this
 * session is gone). A browser sharing that session cookie across tabs will
 * have all of them closed; other sessions/devices for the same user are
 * untouched.
 */
export function closeSession(sessionId: string): void {
	const entries = bySession.get(sessionId);
	if (!entries) return;
	for (const entry of Array.from(entries)) {
		closeEntry(entry, false);
	}
}

/**
 * Emit a NotificationEvent to all active SSE connections for the given user.
 * Errors on individual controllers (e.g. already-closed connections) are caught
 * and silently ignored so that one bad client cannot crash the fan-out loop.
 */
export function emit(userId: string, event: NotificationEvent): void {
	const entries = byUser.get(userId);
	const count = entries?.length ?? 0;
	if (!entries || count === 0) return;
	console.info(
		`[sse] emit ${event.type} → user ${userId} (${count} connection${count === 1 ? '' : 's'})`
	);

	const payload = `id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`;
	const encoded = encoder.encode(payload);

	for (const entry of entries) {
		try {
			entry.controller.enqueue(encoded);
		} catch {
			// The client disconnected between our registry check and the enqueue.
			// Ignore — the cancel() callback will clean up the controller.
		}
	}
}
