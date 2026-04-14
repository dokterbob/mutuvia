// SPDX-License-Identifier: AGPL-3.0-or-later

import type { LayoutServerLoad } from './$types';
import { config } from '$lib/config';

export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		session: locals.session,
		user: locals.user,
		appUser: locals.appUser,
		appName: config.appName
	};
};
