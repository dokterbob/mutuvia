// SPDX-License-Identifier: AGPL-3.0-or-later

import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Authenticated but no profile yet → skip welcome, go to intro
	if (locals.session && !locals.appUser) {
		redirect(307, '/onboarding/intro1');
	}
};
