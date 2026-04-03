// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Sentry from '@sentry/sveltekit';
import { auth } from '$lib/server/auth';
import { db, sqlite } from '$lib/server/db';
import { appUsers } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import type { Handle, ServerInit } from '@sveltejs/kit';
import { config } from '$lib/config';
import { sequence } from '@sveltejs/kit/hooks';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { building } from '$app/environment';
import { getSessionUnlessSentryTunnel } from '$lib/server/sentry';
import { extractAcceptUrl } from '$lib/share-url';

/**
 * Run Drizzle migrations once at server startup, before any request is served.
 * Using the init hook guarantees that the environment is fully set up and that
 * we are migrating the exact same database connection the rest of the app uses —
 * no env-var timing issues around DB_FILE_NAME / DATABASE_URL.
 */
export const init: ServerInit = async () => {
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
		const data = await event.request.formData();
		const params = new URLSearchParams();
		for (const key of ['title', 'text', 'url'] as const) {
			const val = data.get(key);
			if (val) params.set(key, val.toString());
		}
		const acceptPath = extractAcceptUrl(params);
		return new Response(null, { status: 303, headers: { location: acceptPath ?? '/' } });
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

	// svelteKitHandler replaces the manual auth.handler() + resolve() calls.
	// It sets up Better Auth's AsyncLocalStorage request state context, routes
	// /api/auth/* to the auth handler, and delegates all other requests to resolve().
	return svelteKitHandler({ event, resolve, auth, building });
};

export const handle = sequence(Sentry.sentryHandle(), i18nHandle, shareHandle, authHandle);
export const handleError = Sentry.handleErrorWithSentry();
