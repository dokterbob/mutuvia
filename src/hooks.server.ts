// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Sentry from '@sentry/sveltekit';
import { auth } from '$lib/server/auth';
import { db, sqlite } from '$lib/server/db';
import { appUsers } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { isRedirect, redirect, type Handle, type ServerInit } from '@sveltejs/kit';
import { config, validateConfig } from '$lib/config';
import { sequence } from '@sveltejs/kit/hooks';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { building } from '$app/environment';
import { getSessionUnlessSentryTunnel } from '$lib/server/sentry';
import { isStreamingEndpoint } from '$lib/server/sse-middleware';
import { extractAcceptUrl } from '$lib/share-url';
import { applyTrustedIpHeader } from '$lib/server/trusted-ip';
import { applySecurityHeaders } from '$lib/server/security-headers';

/**
 * Run Drizzle migrations once at server startup, before any request is served.
 * Using the init hook guarantees that the environment is fully set up and that
 * we are migrating the exact same database connection the rest of the app uses —
 * no env-var timing issues around DB_FILE_NAME / DATABASE_URL.
 */
export const init: ServerInit = async () => {
	// Runs once when the server actually starts — never during `vite build`
	// or prerendering — so it's safe to throw here on missing/weak secrets
	// without breaking CI or the Docker build stage.
	validateConfig();

	if (config.dbProvider === 'pg') {
		const { migrate } = await import('drizzle-orm/bun-sql/migrator');
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await migrate(db as any, { migrationsFolder: './drizzle/pg' });
	} else {
		const { migrate } = await import('drizzle-orm/bun-sqlite/migrator');
		sqlite!.exec('PRAGMA foreign_keys = OFF;');
		migrate(db, { migrationsFolder: './drizzle/sqlite' });
		sqlite!.exec('PRAGMA foreign_keys = ON;');
	}
};

// Handle the Web Share Target POST before resolve() so SvelteKit's CSRF
// check (which runs inside resolve) doesn't block it. The OS share
// mechanism POSTs from the PWA's own context and doesn't include an
// Origin header, so the standard CSRF check would reject it.
const shareHandle: Handle = async ({ event, resolve }) => {
	if (event.url.pathname === '/share' && event.request.method === 'POST') {
		const contentType = event.request.headers.get('content-type') ?? '';
		if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
			return new Response(null, { status: 303, headers: { location: '/' } });
		}
		try {
			const data = await event.request.formData();
			const params = new URLSearchParams();
			for (const key of ['title', 'text', 'url'] as const) {
				const val = data.get(key);
				if (val) params.set(key, val.toString());
			}
			const acceptPath = extractAcceptUrl(params);
			return new Response(null, { status: 303, headers: { location: acceptPath ?? '/' } });
		} catch {
			return new Response(null, { status: 303, headers: { location: '/' } });
		}
	}
	return resolve(event);
};

const i18nHandle: Handle = ({ event, resolve }) => {
	return paraglideMiddleware(event.request, ({ locale }) => {
		return resolve(event, {
			transformPageChunk: ({ html }) => html.replace('%lang%', locale)
		});
	});
};

export const authHandle: Handle = async ({ event, resolve }) => {
	// Must happen before ANY call that reaches Better Auth (including the
	// getSession below) — see trusted-ip.ts for why.
	applyTrustedIpHeader(event);

	const sessionLookup = await getSessionUnlessSentryTunnel(event.url.pathname, () =>
		auth.api.getSession({ headers: event.request.headers })
	);

	if (sessionLookup.skipped) {
		// Sentry feedback envelopes are tunneled through this endpoint and do not
		// require auth/session lookup.
		return resolve(event);
	}

	// Get session from Better Auth
	const { session } = sessionLookup;

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;

		// Look up app user
		const [appUser] = await db
			.select()
			.from(appUsers)
			.where(eq(appUsers.betterAuthUserId, session.user.id))
			.limit(1);

		event.locals.appUser = appUser || null;
	} else {
		event.locals.session = null;
		event.locals.user = null;
		event.locals.appUser = null;
	}

	// Guard (app) routes here — before load functions and actions run.
	// Layout guards are insufficient: page loads run in parallel with layouts,
	// and form actions bypass layout load functions entirely.
	if (event.route.id?.startsWith('/(app)')) {
		// Use 303 for POST/PUT/etc. so the browser follows up with GET;
		// 307 would forward the original method to the onboarding page.
		const status = event.request.method === 'GET' || event.request.method === 'HEAD' ? 307 : 303;
		if (!event.locals.session) redirect(status, '/onboarding');
		if (!event.locals.appUser) redirect(status, '/onboarding/intro1');
	}

	// svelteKitHandler replaces the manual auth.handler() + resolve() calls.
	// It sets up Better Auth's AsyncLocalStorage request state context, routes
	// /api/auth/* to the auth handler, and delegates all other requests to resolve().
	return svelteKitHandler({ event, resolve, auth, building });
};

const mainSequence = sequence(Sentry.sentryHandle(), i18nHandle, shareHandle, authHandle);

/**
 * Applies the security-headers.ts header set to whatever Response `handle`
 * below is about to return, using the request/session info already on
 * `event` by that point (authHandle runs first in every path that reaches
 * here, so `event.locals.user`/`event.url` are populated).
 *
 * Why this is the one place that covers every response path — see the PR
 * description for the full byte-by-byte trace through
 * @sveltejs/kit/src/runtime/server/respond.js and
 * svelte-adapter-bun/dist/files/handler.js; summary:
 *
 * - Static assets (`/_app/immutable/*`, everything under `static/`,
 *   prerendered fallbacks) are served by the adapter's own sirv-based static
 *   handler BEFORE the request ever reaches SvelteKit's SSR server — they
 *   never call this `handle` hook at all, by design (that's also why their
 *   own Cache-Control, notably the adapter's own
 *   `public,max-age=31536000,immutable` on `/_app/immutable/*`, is never
 *   touched by the logic below).
 * - Everything that DOES reach the SSR server funnels through exactly one
 *   call to this file's exported `handle` (`options.hooks.handle` in
 *   respond.js) — pages, form actions, data requests, our own `+server.ts`
 *   endpoints, the SSE stream, and Better Auth's `/api/auth/*` routes
 *   (svelteKitHandler either calls Better Auth's own handler or falls back
 *   to `resolve()`; either way its return value flows back up through
 *   authHandle -> mainSequence -> here).
 * - A thrown `Redirect` from deep inside a `load`/action/endpoint (not from
 *   our own hooks) is caught by respond.js's OWN internal `resolve()` and
 *   converted to a Response *before* control returns to us — so it's a
 *   normal Response by the time we see it, headers included.
 * - The one case that is NOT caught there is our own authHandle calling the
 *   `redirect()` helper directly (for the `/(app)` route guard) — that
 *   throws past `resolve()` entirely. The try/catch below catches exactly
 *   that `Redirect` and builds the equivalent Response ourselves so it still
 *   gets headers, matching what `src/hooks.server.test.ts`'s existing
 *   `authHandle` tests already assert the redirect looks like.
 * - NOT covered, and accepted: a handful of pre-`handle` framework-internal
 *   paths in respond.js itself, all checked at the very top of
 *   `internal_respond()` BEFORE `options.hooks.handle(...)` is ever called —
 *   SvelteKit's own built-in CSRF origin check (a cross-site, non-JSON form
 *   POST/PUT/PATCH/DELETE gets a plain-text 403 straight from respond.js,
 *   with none of the headers below — this app also relies on that check,
 *   see README's "Security headers" -> "Known gaps"), a malformed-URI 400, a
 *   `reroute` hook error, the `/${app_dir}/env.js`/`/${app_dir}/*` 404s, and
 *   the canonical trailing-slash 308 redirect. None of these carry cookies
 *   or page content; the final response once a trailing-slash redirect
 *   lands on its canonical path IS covered. An uncaught non-Redirect throw
 *   from one of OUR OWN hook functions (not currently possible — none of
 *   them can throw besides the one redirect() case above) would also escape
 *   unheadered; this is a latent gap, not an active one.
 */
function finalizeResponse(event: Parameters<Handle>[0]['event'], response: Response): Response {
	applySecurityHeaders(response, {
		pathname: event.url.pathname,
		isHttps: event.url.protocol === 'https:',
		appUrlIsHttps: config.appUrl.startsWith('https://'),
		authenticated: !!event.locals.user,
		hstsMaxAgeSeconds: config.hstsMaxAgeSeconds,
		hstsIncludeSubdomains: config.hstsIncludeSubdomains
	});
	return response;
}

// SSE streaming responses must bypass Sentry.sentryHandle(), which buffers response
// bodies for performance tracing and breaks chunked SSE delivery. Auth is still needed
// to identify the user, so we route directly to authHandle for streaming endpoints.
export const handle: Handle = async ({ event, resolve }) => {
	// Reject protocol-relative-looking paths (`//evil.com`) before routing.
	// Workaround for GHSA-pfhg-q3qv-9q6r until we can move to SvelteKit 3.
	if (event.url.pathname.startsWith('//')) {
		return finalizeResponse(event, new Response('Not Found', { status: 404 }));
	}

	try {
		const response = isStreamingEndpoint(event.url.pathname)
			? await authHandle({ event, resolve })
			: await mainSequence({ event, resolve });
		return finalizeResponse(event, response);
	} catch (e) {
		// authHandle's `/(app)` route guard throws SvelteKit's `redirect()`
		// directly, before ever calling `resolve()` — see finalizeResponse's
		// doc comment above for why that's the one case this try/catch must
		// handle itself rather than relying on respond.js's own conversion.
		if (isRedirect(e)) {
			return finalizeResponse(
				event,
				new Response(null, { status: e.status, headers: { location: e.location } })
			);
		}
		throw e;
	}
};

export const handleError = Sentry.handleErrorWithSentry();
