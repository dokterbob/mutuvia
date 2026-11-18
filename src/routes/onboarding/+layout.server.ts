// SPDX-License-Identifier: AGPL-3.0-or-later

import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { consumeQrReturnTo } from '$lib/server/qr-return';

export const load: LayoutServerLoad = async ({ locals, cookies, url }) => {
	if (locals.session && locals.appUser) {
		// An existing user signing in from a QR link returns to it here (a new
		// user returns from the name step instead).
		const returnTo = consumeQrReturnTo(cookies);
		if (returnTo) redirect(307, returnTo);
		if (!url.searchParams.has('review')) {
			redirect(307, '/home');
		}
	}
	return {
		isAuthenticated: !!locals.session,
		hasAppUser: !!locals.appUser
	};
};
