// SPDX-License-Identifier: AGPL-3.0-or-later

import { error, json } from '@sveltejs/kit';
import { config } from '$lib/config';
import type { RequestHandler } from './$types';

/**
 * Digital Asset Links statement list for the Android app.
 *
 * Android verifies this file (https://<host>/.well-known/assetlinks.json) to confirm
 * that the site owner authorises the app to handle its URLs. Verification is what lets
 * the Trusted Web Activity run full-screen without a browser URL bar, and what makes
 * `android:autoVerify` intent filters open links directly in the app.
 *
 * The fingerprints must be those of the certificate the APK is *signed* with, not of
 * the site. Debug and release builds are signed with different keys, so a deployment
 * serving a debug build needs the debug key's fingerprint (or both, comma-separated).
 *
 * Returns 404 when ANDROID_SHA256_FINGERPRINTS is not configured.
 */
export const GET: RequestHandler = () => {
	const fingerprints = config.androidSha256Fingerprints;
	if (fingerprints.length === 0) error(404, 'Digital Asset Links not configured');

	return json(
		[
			{
				relation: ['delegate_permission/common.handle_all_urls'],
				target: {
					namespace: 'android_app',
					package_name: config.androidPackageName,
					sha256_cert_fingerprints: fingerprints
				}
			}
		],
		{ headers: { 'Cache-Control': 'public, max-age=3600' } }
	);
};
