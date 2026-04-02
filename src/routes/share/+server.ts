// SPDX-License-Identifier: AGPL-3.0-or-later

import { redirect } from '@sveltejs/kit';
import { extractAcceptUrl } from '$lib/share-url';
import type { RequestHandler } from './$types';

/**
 * Web Share Target handler.
 *
 * When the installed PWA receives shared content via the OS share sheet,
 * the browser POSTs here with multipart/form-data containing title/text/url.
 * We extract the /accept/{token} URL and redirect to it.
 *
 * POST is used instead of GET so the JWT token (which encodes the sender's
 * display name) is not exposed in server logs, analytics, or referrer headers.
 *
 * 303 See Other is the correct redirect after a POST to prevent re-submission
 * on page refresh.
 */
export const POST: RequestHandler = async ({ request }) => {
	const data = await request.formData();
	const params = new URLSearchParams();
	for (const key of ['title', 'text', 'url']) {
		const val = data.get(key);
		if (val) params.set(key, val.toString());
	}
	const acceptPath = extractAcceptUrl(params);
	redirect(303, acceptPath ?? '/');
};
