// SPDX-License-Identifier: AGPL-3.0-or-later

import { redirect, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { appUsers } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

function consumeQrReturnTo(cookies: Cookies): string | null {
	const returnTo = cookies.get('qr_return_to');
	if (
		returnTo &&
		returnTo.startsWith('/') &&
		!returnTo.startsWith('//') &&
		!returnTo.startsWith('/onboarding')
	) {
		cookies.delete('qr_return_to', { path: '/' });
		cookies.delete('qr_skip_intros', { path: '/' });
		return returnTo;
	}
	return null;
}

export const load: PageServerLoad = async ({ parent }) => {
	const { isAuthenticated } = await parent();
	if (!isAuthenticated) {
		redirect(307, '/onboarding/phone');
	}
};

export const actions: Actions = {
	createProfile: async ({ request, locals, cookies }) => {
		if (!locals.session || !locals.user) {
			return fail(401, { error: 'Session expired. Please sign in again.' });
		}

		const data = await request.formData();
		const displayName = (data.get('displayName') as string)?.trim();

		if (!displayName || displayName.length < 2 || displayName.length > 40) {
			return fail(400, { error: 'Display name must be 2–40 characters.' });
		}

		const [existing] = await db
			.select()
			.from(appUsers)
			.where(eq(appUsers.betterAuthUserId, locals.user.id))
			.limit(1);

		if (existing) {
			redirect(307, consumeQrReturnTo(cookies) ?? '/home');
		}

		await db.insert(appUsers).values({
			id: randomUUID(),
			betterAuthUserId: locals.user.id,
			displayName,
			createdAt: new Date()
		});

		redirect(307, consumeQrReturnTo(cookies) ?? '/home');
	}
};
