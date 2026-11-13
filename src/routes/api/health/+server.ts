import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { user } from '$lib/server/schema';
import type { RequestHandler } from './$types';

// This is a public, unauthenticated endpoint (polled by the Docker healthcheck
// and the container's own HEALTHCHECK). It must never leak the raw DB error
// message or which provider/schema is in play — log those server-side instead,
// and keep the response to a bare ok/error status. The 200/503 split is load-
// bearing: docker-compose.yml and the Dockerfile's HEALTHCHECK both rely on it.
export const GET: RequestHandler = async () => {
	try {
		await db.select().from(user).limit(1);
		return json({ status: 'ok' });
	} catch (err) {
		console.error('[api/health] DB check failed:', err);
		return json({ status: 'error' }, { status: 503 });
	}
};
