// SPDX-License-Identifier: AGPL-3.0-or-later

import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { user, session, account, verification, appUsers } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ url }) => {
	if (env.E2E !== 'true') error(404);

	const email = url.searchParams.get('email');
	if (!email) error(400, 'email required');

	const target = db.select().from(user).where(eq(user.email, email)).get();
	if (!target) return json({ deleted: false });

	// Delete dependent records before the user row (FK enforcement)
	db.delete(appUsers).where(eq(appUsers.betterAuthUserId, target.id)).run();
	db.delete(session).where(eq(session.userId, target.id)).run();
	db.delete(account).where(eq(account.userId, target.id)).run();
	db.delete(verification).where(eq(verification.identifier, email)).run();
	db.delete(user).where(eq(user.id, target.id)).run();

	return json({ deleted: true });
};
