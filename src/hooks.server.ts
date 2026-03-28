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

const i18nHandle: Handle = ({ event, resolve }) => {
	return paraglideMiddleware(event.request, ({ locale }) => {
		return resolve(event, {
			transformPageChunk: ({ html }) => html.replace('%lang%', locale)
		});
	});
};

const authHandle: Handle = async ({ event, resolve }) => {
	// Better Auth API routes
	if (event.url.pathname.startsWith('/api/auth')) {
		return auth.handler(event.request);
	}

	// Get session from Better Auth
	const session = await auth.api.getSession({ headers: event.request.headers });

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

	return resolve(event);
};

export const handle = sequence(Sentry.sentryHandle(), i18nHandle, authHandle);
export const handleError = Sentry.handleErrorWithSentry();
