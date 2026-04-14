// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect, goto, deleteTestUser, getAuthCookies } from './test-utils.js';
import { auth } from './auth.js';
import type { TestHelpers } from 'better-auth/plugins';

/**
 * Regression tests for the auth guard on (app)/ routes.
 *
 * A user with a valid Better Auth session but NO app_users record (pre-onboarding
 * state) must be redirected to /onboarding/intro1 rather than crashing with
 * "TypeError: null is not an object".
 */

async function createBetterAuthUserOnly(email: string, displayName: string): Promise<string> {
	const ctx = await auth.$context;
	const testUtils = (ctx as { test: TestHelpers }).test;
	const user = testUtils.createUser({ email, emailVerified: true, name: displayName });
	await testUtils.saveUser(user);
	// Intentionally do NOT insert into app_users — this is the pre-onboarding state.
	return user.id;
}

test.describe.serial('auth guard — session without appUser', () => {
	test.afterEach(async ({ email }) => {
		await deleteTestUser(email('user'));
	});

	test('redirects /home to /onboarding/intro1', async ({ page, context, email }) => {
		const userId = await createBetterAuthUserOnly(email('user'), 'No AppUser');
		const cookies = await getAuthCookies(userId);
		await context.addCookies(cookies);

		await goto(page, '/home');

		await page.waitForURL(/\/onboarding\/intro1/, { timeout: 10_000 });
		await expect(page).toHaveURL(/\/onboarding\/intro1/);
	});

	test('redirects /send to /onboarding/intro1', async ({ page, context, email }) => {
		const userId = await createBetterAuthUserOnly(email('user'), 'No AppUser');
		const cookies = await getAuthCookies(userId);
		await context.addCookies(cookies);

		await goto(page, '/send');

		await page.waitForURL(/\/onboarding\/intro1/, { timeout: 10_000 });
		await expect(page).toHaveURL(/\/onboarding\/intro1/);
	});
});
