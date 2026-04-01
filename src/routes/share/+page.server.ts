// SPDX-License-Identifier: AGPL-3.0-or-later

import { redirect } from '@sveltejs/kit';
import { extractAcceptUrl } from '$lib/share-url';
import type { PageServerLoad } from './$types';

/**
 * Web Share Target handler.
 *
 * When the installed PWA receives shared content via the OS share sheet,
 * the browser navigates here with ?title=…&text=…&url=… query params.
 * We extract the /accept/{token} URL and redirect to it.
 */
export const load: PageServerLoad = ({ url }) => {
	const acceptPath = extractAcceptUrl(url.searchParams);
	redirect(307, acceptPath ?? '/');
};
