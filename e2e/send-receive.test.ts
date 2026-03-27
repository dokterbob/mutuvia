import { test, expect, type BrowserContext } from '@playwright/test';
import { goto, onboardUserViaEmail, SENDER_EMAIL, RECEIVER_EMAIL } from './test-utils';

const SENDER_NAME = 'Test Sender';
const RECEIVER_NAME = 'Test Receiver';

test.describe.serial('Send / Receive flow', () => {
	let senderStorage: Awaited<ReturnType<BrowserContext['storageState']>>;
	let receiverStorage: Awaited<ReturnType<BrowserContext['storageState']>>;

	// Users are created in beforeAll; cleanup happens via globalSetup (deletes
	// test.db) on the next Playwright run rather than via in-test API calls.
	test.beforeAll(async ({ browser }, testInfo) => {
		const baseURL = testInfo.project.use.baseURL!;

		const senderCtx = await browser.newContext({ baseURL });
		await onboardUserViaEmail(await senderCtx.newPage(), SENDER_EMAIL, SENDER_NAME);
		senderStorage = await senderCtx.storageState();
		await senderCtx.close();

		const receiverCtx = await browser.newContext({ baseURL });
		await onboardUserViaEmail(await receiverCtx.newPage(), RECEIVER_EMAIL, RECEIVER_NAME);
		receiverStorage = await receiverCtx.storageState();
		await receiverCtx.close();
	});

	test('send: initiator creates QR and receiver accepts', async ({ browser }, testInfo) => {
		const baseURL = testInfo.project.use.baseURL!;
		const senderCtx = await browser.newContext({ storageState: senderStorage, baseURL });
		const receiverCtx = await browser.newContext({ storageState: receiverStorage, baseURL });
		const senderPage = await senderCtx.newPage();
		const receiverPage = await receiverCtx.newPage();

		try {
			// ── Sender: consent + amount ──────────────────────────────────────────
			await goto(senderPage, '/send');

			// First visit → consent step
			await expect(
				senderPage.getByRole('button', { name: "I understand, let's go" })
			).toBeVisible();
			await senderPage.getByRole('button', { name: "I understand, let's go" }).click();

			// Amount step
			await expect(senderPage.getByRole('heading', { name: 'Send' })).toBeVisible();
			await senderPage.locator('input[name="amount"]').fill('12.50');
			await senderPage.getByRole('button', { name: 'Generate QR' }).click();

			// ── Sender: QR step — extract accept URL ─────────────────────────────
			const urlText = senderPage.getByText(/\/accept\//);
			await expect(urlText).toBeVisible({ timeout: 10_000 });
			const acceptUrl = (await urlText.textContent())!.trim();

			// ── Receiver: accept the send QR ──────────────────────────────────────
			await goto(receiverPage, acceptUrl);
			// Accept page heading contains both name and amount in one string
			await expect(receiverPage.getByRole('heading', { level: 1 })).toContainText(
				`${SENDER_NAME} wants to send you`
			);

			await receiverPage.getByRole('button', { name: 'Accept' }).click();
			await expect(receiverPage).toHaveURL(/\/home/, { timeout: 10_000 });

			// ── Sender: polling detects completion ────────────────────────────────
			await expect(senderPage.getByText(/Done\. You sent/)).toBeVisible({ timeout: 10_000 });
			await expect(senderPage.getByText(new RegExp(RECEIVER_NAME))).toBeVisible();
		} finally {
			await senderCtx.close();
			await receiverCtx.close();
		}
	});

	test('receive: initiator requests payment and payer accepts', async ({ browser }, testInfo) => {
		// Test Receiver initiates a receive QR; Test Sender pays.
		const baseURL = testInfo.project.use.baseURL!;
		const initiatorCtx = await browser.newContext({ storageState: receiverStorage, baseURL });
		const payerCtx = await browser.newContext({ storageState: senderStorage, baseURL });
		const initiatorPage = await initiatorCtx.newPage();
		const payerPage = await payerCtx.newPage();

		try {
			// ── Initiator: amount ─────────────────────────────────────────────────
			await goto(initiatorPage, '/receive');

			await expect(initiatorPage.getByRole('heading', { name: 'Receive' })).toBeVisible();
			await initiatorPage.locator('input[name="amount"]').fill('7.00');
			await initiatorPage.getByRole('button', { name: 'Generate QR' }).click();

			// ── Initiator: QR step — extract accept URL ───────────────────────────
			const urlText = initiatorPage.getByText(/\/accept\//);
			await expect(urlText).toBeVisible({ timeout: 10_000 });
			const acceptUrl = (await urlText.textContent())!.trim();

			// ── Payer: accept the receive QR ──────────────────────────────────────
			await goto(payerPage, acceptUrl);
			await expect(payerPage.getByRole('heading', { level: 1 })).toContainText(
				`${RECEIVER_NAME} is requesting`
			);

			await payerPage.getByRole('button', { name: 'Accept' }).click();
			await expect(payerPage).toHaveURL(/\/home/, { timeout: 10_000 });

			// ── Initiator: polling detects completion ─────────────────────────────
			await expect(initiatorPage.getByText(/Done\. You received/)).toBeVisible({
				timeout: 10_000
			});
			await expect(initiatorPage.getByText(new RegExp(SENDER_NAME))).toBeVisible();
		} finally {
			await initiatorCtx.close();
			await payerCtx.close();
		}
	});
});
