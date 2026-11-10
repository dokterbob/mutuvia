// SPDX-License-Identifier: AGPL-3.0-or-later

import type { RequestHandler } from './$types';
import { register, unregister } from '$lib/server/sse-registry';
import { db } from '$lib/server/db';
import { session as sessionTable } from '$lib/server/schema';
import { eq } from 'drizzle-orm';

const KEEPALIVE_INTERVAL_MS = 20_000;
const encoder = new TextEncoder();

/**
 * Re-checks that the session backing this connection still exists and has
 * not expired. Sign-out itself closes connections immediately via the
 * Better Auth databaseHooks.session.delete hook in src/lib/server/auth.ts
 * (same process, synchronous with the sign-out request) — this is the
 * fallback for cases that hook doesn't cover, chiefly natural session
 * expiry (the row is not deleted when the TTL lapses, only treated as
 * invalid by Better Auth). Bound: at most one KEEPALIVE_INTERVAL_MS tick
 * (20s) after expiry. Cost: one indexed PK lookup per open connection per
 * tick — cheap at this app's scale, and only a single row is ever read.
 */
async function isSessionStillValid(sessionId: string): Promise<boolean> {
	const [row] = await db
		.select({ expiresAt: sessionTable.expiresAt })
		.from(sessionTable)
		.where(eq(sessionTable.id, sessionId))
		.limit(1);
	return !!row && row.expiresAt.getTime() > Date.now();
}

export const GET: RequestHandler = ({ locals }) => {
	if (!locals.appUser || !locals.session) {
		return new Response(null, { status: 401 });
	}

	const userId = locals.appUser.id;
	const sessionId = locals.session.id;
	let keepaliveTimer: ReturnType<typeof setInterval>;
	let ctrl: ReadableStreamDefaultController<Uint8Array>;
	let closed = false;

	const closeConnection = () => {
		if (closed) return;
		closed = true;
		clearInterval(keepaliveTimer);
		unregister(userId, sessionId, ctrl);
		try {
			ctrl.close();
		} catch {
			// already closed
		}
	};

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			ctrl = controller;
			register(userId, sessionId, ctrl);

			const sendPing = () => {
				try {
					ctrl.enqueue(encoder.encode(': ping\n\n'));
				} catch {
					// client disconnected between ticks
				}
			};

			// The initial ping needs no re-validation: authHandle just validated
			// this exact session for this exact request.
			sendPing();

			keepaliveTimer = setInterval(() => {
				void isSessionStillValid(sessionId).then((valid) => {
					if (closed) return;
					if (!valid) {
						closeConnection();
						return;
					}
					sendPing();
				});
			}, KEEPALIVE_INTERVAL_MS);
		},
		cancel() {
			closeConnection();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'X-Accel-Buffering': 'no',
			Connection: 'keep-alive'
		}
	});
};
