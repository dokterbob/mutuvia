// SPDX-License-Identifier: AGPL-3.0-or-later

import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (locals.session && locals.appUser) {
		redirect(307, '/home');
	}
	return {
		isAuthenticated: !!locals.session,
		hasAppUser: !!locals.appUser
	};
};
