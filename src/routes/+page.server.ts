// SPDX-License-Identifier: AGPL-3.0-or-later

import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.session) {
		redirect(307, '/onboarding');
	}
	if (!locals.appUser) {
		redirect(307, '/onboarding/intro1');
	}
	redirect(307, '/home');
};
