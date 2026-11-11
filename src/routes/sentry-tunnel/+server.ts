// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Tunnel Sentry envelopes through the app's own origin to bypass ad-blockers.
// Only forwards envelopes whose DSN host AND project id match the configured
// PUBLIC_SENTRY_DSN — see $lib/server/sentry-tunnel.ts's isAllowedEnvelopeDsn
// doc comment for why host alone isn't enough.
//
// This endpoint is necessarily unauthenticated (it must work for a crash on
// the sign-in page itself, before any session exists) — the DSN host+project
// match above is what stops it becoming an open proxy to an arbitrary
// upstream, the body-size cap below bounds the cost of an abusive POST, and
// the Origin check rejects cross-site callers while still accepting the
// Sentry SDK's own same-origin requests (which don't reliably send Origin,
// so its *absence* is not itself treated as suspicious). A dedicated
// per-IP rate limiter (matching Better Auth's own) was considered and
// deferred — the three checks above already bound the blast radius without
// needing new shared rate-limit infrastructure for an endpoint that, unlike
// OTP sends, can't itself spend money or send messages on the operator's
// behalf; forwarded envelopes still cost nothing beyond Sentry's own
// quota/ingestion limits for the configured project.

import { env as publicEnv } from '$env/dynamic/public';
import { config } from '$lib/config';
import { dsnProjectId, isAllowedEnvelopeDsn, readBodyWithLimit } from '$lib/server/sentry-tunnel';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, url }) => {
	const configuredDsnRaw = publicEnv.PUBLIC_SENTRY_DSN;

	if (!configuredDsnRaw) {
		return new Response('Not configured', { status: 404 });
	}

	// Same-origin only. The Sentry SDK's fetch transport doesn't reliably set
	// Origin for a same-origin POST, so an absent header is allowed through —
	// only a MISMATCHING Origin (i.e. an actual cross-site caller) is
	// rejected.
	const origin = request.headers.get('origin');
	if (origin && origin !== url.origin) {
		return new Response('Forbidden', { status: 403 });
	}

	const configuredDsn = new URL(configuredDsnRaw);

	const rawBody = await readBodyWithLimit(request, config.sentryTunnelMaxBodyBytes);
	if (rawBody === null) {
		return new Response('Payload too large', { status: 413 });
	}

	let envelopeDsn: URL;
	try {
		const firstNewline = rawBody.indexOf(10); // 10 = '\n'
		if (firstNewline === -1) {
			return new Response('Invalid envelope', { status: 400 });
		}
		const firstLine = new TextDecoder().decode(rawBody.subarray(0, firstNewline));
		const header = JSON.parse(firstLine);
		envelopeDsn = new URL(header.dsn);
	} catch {
		return new Response('Invalid envelope', { status: 400 });
	}

	if (!isAllowedEnvelopeDsn(envelopeDsn, configuredDsn)) {
		return new Response('Forbidden', { status: 403 });
	}

	const upstreamUrl = `https://${envelopeDsn.hostname}/api/${dsnProjectId(envelopeDsn)}/envelope/`;

	const upstream = await fetch(upstreamUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-sentry-envelope' },
		body: rawBody.buffer as ArrayBuffer
	});

	return new Response(null, { status: upstream.status });
};
