// SPDX-License-Identifier: AGPL-3.0-or-later

import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
	if (locals.session && locals.appUser) {
		const returnTo = cookies.get('return_to');
		if (
			returnTo &&
			returnTo.startsWith('/') &&
			!returnTo.startsWith('//') &&
			!returnTo.startsWith('/onboarding')
		) {
			cookies.delete('return_to', { path: '/' });
			cookies.delete('skip_intros', { path: '/' });
			redirect(307, returnTo);
		}
		redirect(307, '/home');
	}
	return {
		isAuthenticated: !!locals.session,
		hasAppUser: !!locals.appUser
	};
};
