import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import { setupAuthenticatedUser, SENDER_EMAIL } from './test-utils.js';
import QRCode from 'qrcode';
import { execSync } from 'child_process';
import { mkdtempSync, unlinkSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const SENDER_NAME = 'QR Sender';
const RECEIVER_NAME = 'QR Scanner';
const SCANNER_EMAIL = 'e2e-qr-scanner@test.example';

/**
 * Generate a .y4m fake webcam video file containing a QR code for the given URL.
 * Chromium's --use-file-for-fake-video-capture accepts .y4m format.
 */
async function generateQrVideo(url: string): Promise<string> {
	const dir = mkdtempSync(join(tmpdir(), 'qr-e2e-'));
	const pngPath = join(dir, 'qr.png');
	const y4mPath = join(dir, 'qr.y4m');

	// Generate a QR code PNG at a size Chromium's fake camera can read
	await QRCode.toFile(pngPath, url, {
		width: 640,
		margin: 4,
		color: { dark: '#000000', light: '#FFFFFF' }
	});

	// Convert to y4m: 5-second still image video at 10fps
	execSync(
		`ffmpeg -y -loop 1 -i "${pngPath}" -t 5 -pix_fmt yuv420p -vf "scale=640:640" -r 10 "${y4mPath}"`,
		{ stdio: 'pipe' }
	);

	unlinkSync(pngPath);
	return y4mPath;
}

test.describe.serial('QR scanner E2E', () => {
	let senderStorage: Awaited<ReturnType<BrowserContext['storageState']>>;
	let scannerStorage: Awaited<ReturnType<BrowserContext['storageState']>>;

	test.beforeAll(async ({ browser }, testInfo) => {
		const baseURL = testInfo.project.use.baseURL!;

		const senderCtx = await browser.newContext({ baseURL });
		await setupAuthenticatedUser(senderCtx, SENDER_EMAIL, SENDER_NAME);
		senderStorage = await senderCtx.storageState();
		await senderCtx.close();

		const scannerCtx = await browser.newContext({ baseURL });
		await setupAuthenticatedUser(scannerCtx, SCANNER_EMAIL, RECEIVER_NAME);
		scannerStorage = await scannerCtx.storageState();
		await scannerCtx.close();
	});

	test('scanner detects QR code and navigates to accept page', async ({ browser }, testInfo) => {
		const baseURL = testInfo.project.use.baseURL!;

		// ── Sender: create a send QR ─────────────────────────────────────────
		const senderCtx = await browser.newContext({ storageState: senderStorage, baseURL });
		const senderPage = await senderCtx.newPage();

		let acceptUrl: string;
		try {
			await senderPage.goto('/send');
			await senderPage.locator('body.hydrated').waitFor();

			// Consent step (first visit)
			const consentBtn = senderPage.getByRole('button', { name: "I understand, let's go" });
			if (await consentBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
				await consentBtn.click();
			}

			await senderPage.locator('input[name="amount"]').fill('10.00');
			await senderPage.getByRole('button', { name: 'Generate QR' }).click();

			const urlText = senderPage.getByText(/\/accept\//);
			await expect(urlText).toBeVisible({ timeout: 10_000 });
			acceptUrl = (await urlText.textContent())!.trim();
		} finally {
			await senderCtx.close();
		}

		// ── Generate fake webcam video from the accept URL ───────────────────
		const y4mPath = await generateQrVideo(acceptUrl);

		try {
			// ── Scanner: launch with fake camera ─────────────────────────────
			const persistentDir = mkdtempSync(join(tmpdir(), 'pw-qr-'));
			const context = await chromium.launchPersistentContext(persistentDir, {
				permissions: ['camera'],
				args: [
					'--disable-web-security',
					'--auto-accept-camera-and-microphone-capture',
					'--use-fake-device-for-media-stream',
					`--use-file-for-fake-video-capture=${y4mPath}`
				]
			});

			try {
				// Inject auth cookies for the scanner user
				await context.addCookies(
					(scannerStorage.cookies ?? []).map((c) => ({
						...c,
						sameSite: c.sameSite as 'Strict' | 'Lax' | 'None'
					}))
				);

				const page = await context.newPage();
				await page.goto(`${baseURL}/scan`);
				await page.locator('body.hydrated').waitFor();

				// The scanner should detect the QR and navigate to the accept page
				await expect(page).toHaveURL(/\/accept\//, { timeout: 30_000 });

				// Verify we're on the accept page with the sender's name
				await expect(page.getByRole('heading', { level: 1 })).toContainText(SENDER_NAME, {
					timeout: 10_000
				});
			} finally {
				await context.close();
				rmSync(persistentDir, { recursive: true, force: true });
			}
		} finally {
			// Clean up the y4m file
			try {
				const dir = y4mPath.replace(/\/[^/]+$/, '');
				rmSync(dir, { recursive: true, force: true });
			} catch {
				// best-effort cleanup
			}
		}
	});
});
