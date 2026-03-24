// SPDX-License-Identifier: AGPL-3.0-or-later

import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { appUsers } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	return {
		appUser: locals.appUser!,
		communityDocUrl: process.env.PUBLIC_COMMUNITY_DOC_URL || '',
		appName: process.env.PUBLIC_APP_NAME || 'Mutuvia'
	};
};

export const actions: Actions = {
	updateName: async ({ request, locals }) => {
		const data = await request.formData();
		const displayName = (data.get('displayName') as string)?.trim();

		if (!displayName || displayName.length < 2 || displayName.length > 40) {
			return fail(400, { error: 'Display name must be 2–40 characters.' });
		}

		db.update(appUsers).set({ displayName }).where(eq(appUsers.id, locals.appUser!.id)).run();

		return { saved: true };
	}
};
