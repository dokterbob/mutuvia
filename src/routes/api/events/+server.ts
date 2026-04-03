// SPDX-License-Identifier: AGPL-3.0-or-later

import type { RequestHandler } from './$types';
import { register, unregister } from '$lib/server/sse-registry';

const KEEPALIVE_INTERVAL_MS = 20_000;
const encoder = new TextEncoder();

export const GET: RequestHandler = ({ locals }) => {
	if (!locals.appUser) {
		return new Response(null, { status: 401 });
	}

	const userId = locals.appUser.id;
	let keepaliveTimer: ReturnType<typeof setInterval>;
	let ctrl: ReadableStreamDefaultController<Uint8Array>;

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			ctrl = controller;
			register(userId, ctrl);

			const ping = () => {
				try {
					ctrl.enqueue(encoder.encode(': ping\n\n'));
				} catch {
					// client disconnected between ticks
				}
			};

			ping();
			keepaliveTimer = setInterval(ping, KEEPALIVE_INTERVAL_MS);
		},
		cancel() {
			clearInterval(keepaliveTimer);
			unregister(userId, ctrl);
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
