// SPDX-License-Identifier: AGPL-3.0-or-later

import type { LayoutServerLoad } from './$types';
import { config } from '$lib/config';

export const load: LayoutServerLoad = async ({ locals }) => {
	// Only ship what the client actually reads. Better Auth's Session object
	// (locals.session) carries `token`, `ipAddress`, `userAgent`, etc., and
	// `locals.user` carries the full Better Auth user record — neither is read
	// anywhere client-side (grepped for `data.session`/`data.user`/
	// `page.data.session`/`page.data.user`), so neither is sent. `appUser` is
	// already a narrow, app-specific projection (id/displayName/etc.) with no
	// auth internals, and is read by `(app)` pages — kept as-is.
	return {
		appUser: locals.appUser,
		appName: config.appName
	};
};
