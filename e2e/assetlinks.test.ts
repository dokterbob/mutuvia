// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test';

// The E2E server runs without ANDROID_SHA256_FINGERPRINTS, so the route must 404.
// The positive case (200 + statement list) is covered by the unit tests.
test.describe('Digital Asset Links', () => {
	test('given no fingerprints are configured, when /.well-known/assetlinks.json is requested, then it responds 404', async ({
		request
	}) => {
		const res = await request.get('/.well-known/assetlinks.json');
		expect(res.status()).toBe(404);
	});
});
