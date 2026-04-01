// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Tunnel Sentry envelopes through the app's own origin to bypass ad-blockers.
// Only forwards to the host matching the configured PUBLIC_SENTRY_DSN.

import { env as publicEnv } from '$env/dynamic/public';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const configuredDsn = publicEnv.PUBLIC_SENTRY_DSN;

	if (!configuredDsn) {
		return new Response('Not configured', { status: 404 });
	}

	const allowedHost = new URL(configuredDsn).hostname;
	const rawBody = await request.arrayBuffer();

	let envelopeDsn: URL;
	try {
		const bytes = new Uint8Array(rawBody);
		const firstNewline = bytes.indexOf(10); // 10 = '\n'
		const firstLine = new TextDecoder().decode(
			firstNewline === -1 ? bytes : bytes.subarray(0, firstNewline)
		);
		const header = JSON.parse(firstLine);
		envelopeDsn = new URL(header.dsn);
	} catch {
		return new Response('Invalid envelope', { status: 400 });
	}

	// Security: only forward to the configured Sentry host
	if (envelopeDsn.hostname !== allowedHost) {
		return new Response('Forbidden', { status: 403 });
	}

	const projectId = envelopeDsn.pathname.slice(1); // remove leading /
	const upstreamUrl = `https://${envelopeDsn.hostname}/api/${projectId}/envelope/`;

	const upstream = await fetch(upstreamUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-sentry-envelope' },
		body: rawBody
	});

	return new Response(null, { status: upstream.status });
};
