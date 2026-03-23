// SPDX-License-Identifier: AGPL-3.0-or-later

import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { appUsers } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
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
