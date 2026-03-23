// SPDX-License-Identifier: AGPL-3.0-or-later

import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.session) {
		redirect(307, '/onboarding');
	}
	if (!locals.appUser) {
		redirect(307, '/onboarding?step=intro1');
	}

	return {
		appUser: locals.appUser
	};
};
