// SPDX-License-Identifier: AGPL-3.0-or-later

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { pushSubscriptions } from '$lib/server/schema';
import { and, eq } from 'drizzle-orm';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.appUser) {
		return new Response(null, { status: 401 });
	}

	const body = await request.json().catch(() => null);
	if (!body?.endpoint) {
		return json({ error: 'Missing required field: endpoint' }, { status: 400 });
	}

	await db
		.delete(pushSubscriptions)
		.where(
			and(
				eq(pushSubscriptions.userId, locals.appUser.id),
				eq(pushSubscriptions.endpoint, body.endpoint as string)
			)
		);

	return json({});
};
