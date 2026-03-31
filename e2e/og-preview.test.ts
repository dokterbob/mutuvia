// SPDX-License-Identifier: AGPL-3.0-or-later

import * as jose from 'jose';
import {
	test,
	expect,
	goto,
	setupAuthenticatedUser,
	createPendingQr,
	getAppUserId
} from './test-utils.js';
import { sqlite } from './auth.js';
import { E2E_QR_JWT_SECRET, E2E_BASE_URL } from './config.js';

const INITIATOR_NAME = 'OG Initiator';

/**
 * Insert a pending QR row with direction='receive' and sign a JWT for it.
 * Mirrors createPendingQr from test-utils but allows configuring direction and amount.
 */
async function createReceiveQr(
	initiatingAppUserId: string,
	initiatorName: string,
	amountCents: number
): Promise<{ token: string; qrId: string }> {
	const qrId = crypto.randomUUID();
	const now = Math.floor(Date.now() / 1000);

	sqlite
		.prepare(
			`INSERT INTO pending_qr (id, initiating_user_id, direction, amount, status, created_at, expires_at)
			 VALUES (?, ?, 'receive', ?, 'pending', ?, ?)`
		)
		.run(qrId, initiatingAppUserId, amountCents, now, now + 600);

	const secret = new TextEncoder().encode(E2E_QR_JWT_SECRET);
	const token = await new jose.SignJWT({ amt: amountCents, dir: 'receive', dn: initiatorName })
		.setProtectedHeader({ alg: 'HS256' })
		.setJti(qrId)
		.setIssuer(E2E_BASE_URL)
		.setIssuedAt()
		.setExpirationTime('600s')
		.sign(secret);

	return { token, qrId };
}

test.describe('OG meta tags on /accept/[token]', () => {
	let initiatorAppUserId: string;

	test.beforeAll(async ({ browser, email }, testInfo) => {
		const baseURL = testInfo.project.use.baseURL!;
		const ctx = await browser.newContext({ baseURL });
		const initiatorBaUserId = await setupAuthenticatedUser(ctx, email('initiator'), INITIATOR_NAME);
		initiatorAppUserId = getAppUserId(initiatorBaUserId);
		await ctx.close();
	});

	test('send direction: OG tags contain payment amount and correct metadata', async ({
		secondContext
	}) => {
		const { token } = await createPendingQr(initiatorAppUserId, INITIATOR_NAME);
		const page = await secondContext.newPage();

		await goto(page, `/accept/${token}`);

		// Page title
		await expect(page).toHaveTitle(/Payment of/);
		await expect(page).toHaveTitle(/5\.00/);

		// og:title
		const ogTitle = page.locator('meta[property="og:title"]');
		await expect(ogTitle).toHaveAttribute('content', /Payment of/);
		await expect(ogTitle).toHaveAttribute('content', /5\.00/);

		// og:description
		const ogDescription = page.locator('meta[property="og:description"]');
		await expect(ogDescription).toHaveAttribute('content', 'Mutual credit for your community');

		// og:site_name
		const ogSiteName = page.locator('meta[property="og:site_name"]');
		await expect(ogSiteName).toHaveAttribute('content', 'Mutuvia');

		// og:type
		const ogType = page.locator('meta[property="og:type"]');
		await expect(ogType).toHaveAttribute('content', 'website');

		// og:url
		const ogUrl = page.locator('meta[property="og:url"]');
		await expect(ogUrl).toHaveAttribute('content', /\/accept\//);

		// twitter:card
		const twitterCard = page.locator('meta[name="twitter:card"]');
		await expect(twitterCard).toHaveAttribute('content', 'summary');

		// twitter:title
		const twitterTitle = page.locator('meta[name="twitter:title"]');
		await expect(twitterTitle).toHaveAttribute('content', /Payment of/);

		// twitter:description
		const twitterDescription = page.locator('meta[name="twitter:description"]');
		await expect(twitterDescription).toHaveAttribute('content', 'Mutual credit for your community');

		// Privacy: initiator's display name must NOT appear in og:title or og:description
		const ogTitleContent = await ogTitle.getAttribute('content');
		const ogDescriptionContent = await ogDescription.getAttribute('content');
		expect(ogTitleContent).not.toContain(INITIATOR_NAME);
		expect(ogDescriptionContent).not.toContain(INITIATOR_NAME);
	});

	test('receive direction: OG tags contain request amount', async ({ secondContext }) => {
		const { token } = await createReceiveQr(initiatorAppUserId, INITIATOR_NAME, 750);
		const page = await secondContext.newPage();

		await goto(page, `/accept/${token}`);

		// og:title should reflect "Request for" phrasing
		const ogTitle = page.locator('meta[property="og:title"]');
		await expect(ogTitle).toHaveAttribute('content', /Request for/);
		await expect(ogTitle).toHaveAttribute('content', /7\.50/);

		// og:description unchanged
		const ogDescription = page.locator('meta[property="og:description"]');
		await expect(ogDescription).toHaveAttribute('content', 'Mutual credit for your community');
	});

	test('expired / invalid token: OG tags show "Link expired"', async ({ secondContext }) => {
		const page = await secondContext.newPage();

		await goto(page, '/accept/invalid-token-that-will-fail-verification');

		// og:title must be exactly "Link expired"
		const ogTitle = page.locator('meta[property="og:title"]');
		await expect(ogTitle).toHaveAttribute('content', 'Link expired');

		// og:description still present
		const ogDescription = page.locator('meta[property="og:description"]');
		await expect(ogDescription).toHaveAttribute('content', 'Mutual credit for your community');
	});
});
// Initiator user is intentionally not cleaned up — global setup deletes test.db on the next run.
