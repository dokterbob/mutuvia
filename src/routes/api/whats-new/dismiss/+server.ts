// SPDX-License-Identifier: AGPL-3.0-or-later

import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { appUsers } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { config } from '$lib/config';

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.appUser) {
		return new Response(null, { status: 401 });
	}

	await db
		.update(appUsers)
		.set({ lastSeenVersion: config.appVersion })
		.where(eq(appUsers.id, locals.appUser.id));

	return new Response(null, { status: 204 });
};
