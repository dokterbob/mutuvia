// SPDX-License-Identifier: AGPL-3.0-or-later

import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { appUsers } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	// Fully onboarded users go home
	if (locals.session && locals.appUser) {
		redirect(307, '/home');
	}

	// Authenticated but no app_users record → skip to intro
	const step = url.searchParams.get('step');
	if (locals.session && !locals.appUser && !step) {
		redirect(307, '/onboarding?step=intro1');
	}

	return {
		isAuthenticated: !!locals.session,
		hasAppUser: !!locals.appUser,
		step: step || 'welcome'
	};
};

export const actions: Actions = {
	createProfile: async ({ request, locals }) => {
		if (!locals.session || !locals.user) {
			redirect(307, '/onboarding');
		}

		const data = await request.formData();
		const displayName = (data.get('displayName') as string)?.trim();

		if (!displayName || displayName.length < 2 || displayName.length > 40) {
			return { error: 'Display name must be 2–40 characters.' };
		}

		// Check if app user already exists
		const existing = await db
			.select()
			.from(appUsers)
			.where(eq(appUsers.betterAuthUserId, locals.user.id))
			.get();

		if (existing) {
			redirect(307, '/home');
		}

		db.insert(appUsers)
			.values({
				id: randomUUID(),
				betterAuthUserId: locals.user.id,
				displayName,
				createdAt: new Date()
			})
			.run();

		redirect(307, '/home');
	}
};
