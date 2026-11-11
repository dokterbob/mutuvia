// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * E2E tests asserting that the app's Content-Security-Policy (svelte.config.js
 * `kit.csp`, nonce-based `mode: 'auto'`) is never violated while using the app
 * for real. Unit tests can't see this — a CSP violation is reported by the
 * browser at runtime (as a `securitypolicyviolation` DOM event and a console
 * error), not as a thrown exception, so nothing short of a real browser
 * catches it.
 *
 * Each test attaches two collectors BEFORE any navigation:
 *   - a `console` listener for messages that look like a CSP violation
 *     (Chrome logs "Refused to ..." / "Content Security Policy" errors)
 *   - a `securitypolicyviolation` DOM listener, injected via `addInitScript`
 *     so it's wired up before the page's own scripts run
 *
 * then asserts both are empty after exercising the page/flow.
 */

import { chromium, type Page } from '@playwright/test';
import {
	test,
	expect,
	goto,
	getAuthCookies,
	createPendingQr,
	createReusablePaymentRequest,
	deleteTestUser,
	clearOTPs,
	onboardUserViaEmail
} from './test-utils.js';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

declare global {
	interface Window {
		__cspViolations: string[];
	}
}

type CspListeners = {
	/** Console messages matching a CSP violation, collected live. */
	consoleViolations: string[];
	/** Reads the `securitypolicyviolation` events collected in the page. */
	getDomViolations: () => Promise<string[]>;
};

/**
 * Wire up CSP-violation collection on `page`. Must be called BEFORE any
 * navigation: the console listener has to be attached first to catch early
 * violations, and `addInitScript` only affects navigations that happen after
 * it's registered.
 */
async function attachCspListeners(page: Page): Promise<CspListeners> {
	const consoleViolations: string[] = [];
	page.on('console', (msg) => {
		if (msg.type() === 'error' && /content security policy|refused to/i.test(msg.text())) {
			consoleViolations.push(msg.text());
		}
	});

	await page.addInitScript(() => {
		window.__cspViolations = [];
		document.addEventListener('securitypolicyviolation', (e) => {
			window.__cspViolations.push(`${e.violatedDirective}: ${e.blockedURI}`);
		});
	});

	return {
		consoleViolations,
		getDomViolations: () => page.evaluate(() => window.__cspViolations ?? [])
	};
}

/**
 * Asserts no CSP violations were observed, with the exact violation text in
 * the failure message so a break is debuggable at a glance.
 */
async function expectNoCspViolations(page: Page, listeners: CspListeners): Promise<void> {
	const domViolations = await listeners.getDomViolations();
	const all = [...listeners.consoleViolations, ...domViolations];
	expect(all, `CSP violation(s) detected:\n${all.join('\n')}`).toEqual([]);
}

test.describe('CSP — no violations on main pages', () => {
	// ── 1. Home page ────────────────────────────────────────────────────────────

	test.describe('Home page', () => {
		test('authenticated /home produces no CSP violations', async ({ withAuth }) => {
			const { context } = await withAuth({ displayName: 'CSP Home User' });
			const page = await context.newPage();
			const listeners = await attachCspListeners(page);

			await goto(page, '/home');
			await expect(page.getByText('Your balance', { exact: true })).toBeVisible();

			await expectNoCspViolations(page, listeners);
		});
	});

	// ── 2. Send flow + QR scanner ───────────────────────────────────────────────

	test.describe('Send page', () => {
		test('consent, amount entry, and QR generation produce no CSP violations', async ({
			withAuth
		}) => {
			const { context } = await withAuth({ displayName: 'CSP Send User' });
			const page = await context.newPage();
			const listeners = await attachCspListeners(page);

			await goto(page, '/send');

			// First visit → consent step (same pattern as e2e/qr-scanner.test.ts)
			const consentBtn = page.getByRole('button', { name: "I understand, let's go" });
			if (await consentBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
				await consentBtn.click();
			}

			await expect(page.getByRole('heading', { name: 'Send' })).toBeVisible();
			await page.locator('input[name="amount"]').fill('5.00');
			await page.getByRole('button', { name: 'Generate QR' }).click();

			await expect(page.getByText(/\/accept\//)).toBeVisible({ timeout: 10_000 });

			await expectNoCspViolations(page, listeners);
		});
	});

	test.describe('QR scanner (scan page)', () => {
		test('mounting the scanner and loading the WASM barcode detector produces no CSP violations', async ({
			testUser
		}, testInfo) => {
			// Reuses the fake-camera launch pattern from e2e/qr-scanner.test.ts, minus
			// the generated QR video — we only need the camera stream (or its
			// failure) and the WASM module load to happen without tripping CSP, not
			// an actual successful scan.
			const { userId } = await testUser({ displayName: 'CSP Scanner User' });
			const cookies = await getAuthCookies(userId);
			const baseURL = testInfo.project.use.baseURL!;

			const persistentDir = mkdtempSync(join(tmpdir(), 'pw-csp-scan-'));
			const context = await chromium.launchPersistentContext(persistentDir, {
				permissions: ['camera'],
				args: [
					'--disable-web-security',
					'--auto-accept-camera-and-microphone-capture',
					'--use-fake-device-for-media-stream'
				]
			});

			try {
				await context.addCookies(
					cookies.map((c) => ({ ...c, sameSite: c.sameSite as 'Strict' | 'Lax' | 'None' }))
				);

				const page = await context.newPage();
				const listeners = await attachCspListeners(page);

				await page.goto(`${baseURL}/scan`);
				await page.locator('body.hydrated').waitFor();

				// Wait for either the fake camera to start streaming (video has frame
				// data) or the component to surface a camera error — either outcome
				// means the component fully mounted and the WASM detector was
				// constructed/exercised. Camera access can be unreliable in headless
				// environments, so this is a best-effort wait, not a hard requirement.
				await page
					.waitForFunction(
						() => {
							const video = document.querySelector('video');
							if (video && video.readyState >= 2) return true;
							return /camera|scanner/i.test(document.body.innerText);
						},
						null,
						{ timeout: 20_000 }
					)
					.catch(() => {
						// Fall through — we still assert on whatever CSP activity occurred.
					});

				await expectNoCspViolations(page, listeners);
			} finally {
				await context.close();
				rmSync(persistentDir, { recursive: true, force: true });
			}
		});
	});

	// ── 3. Receive page ─────────────────────────────────────────────────────────

	test.describe('Receive page', () => {
		test('amount entry and QR code display produce no CSP violations', async ({ withAuth }) => {
			const { context } = await withAuth({ displayName: 'CSP Receive User' });
			const page = await context.newPage();
			const listeners = await attachCspListeners(page);

			await goto(page, '/receive');
			await expect(page.getByRole('heading', { name: 'Receive' })).toBeVisible();
			await page.locator('input[name="amount"]').fill('3.00');
			await page.getByRole('button', { name: 'Generate QR' }).click();

			// The QR is rendered as a data: URL <img> — img-src allows 'self' data: blob:.
			await expect(page.locator('img[alt="QR Code"]')).toBeVisible({ timeout: 10_000 });

			await expectNoCspViolations(page, listeners);
		});
	});

	// ── 4. Accept page — logged out and logged in ──────────────────────────────

	test.describe('Accept page', () => {
		test('logged out: the sign-in CTA view produces no CSP violations', async ({
			testUser,
			browser
		}, testInfo) => {
			const initiator = await testUser({ displayName: 'CSP Accept Initiator Out' });
			const { token } = await createPendingQr(initiator.appUserId, 'CSP Accept Initiator Out');

			const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL! });
			const page = await context.newPage();

			try {
				const listeners = await attachCspListeners(page);
				await goto(page, `/accept/${token}`);
				await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

				await expectNoCspViolations(page, listeners);
			} finally {
				await context.close();
			}
		});

		test('logged in: the accept/decline view produces no CSP violations', async ({
			testUser,
			withAuth
		}) => {
			const initiator = await testUser({ displayName: 'CSP Accept Initiator In' });
			const { token } = await createPendingQr(initiator.appUserId, 'CSP Accept Initiator In');

			const { context } = await withAuth({ displayName: 'CSP Accept User' });
			const page = await context.newPage();
			const listeners = await attachCspListeners(page);

			await goto(page, `/accept/${token}`);
			await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

			await expectNoCspViolations(page, listeners);
		});
	});

	// ── 5. Send/[id] page (reusable QR landing) ────────────────────────────────

	test.describe('Send/[id] page (reusable QR)', () => {
		test('landing on the reusable payment confirm view produces no CSP violations', async ({
			testUser,
			withAuth
		}) => {
			const initiator = await testUser({ displayName: 'CSP Reusable Initiator' });
			const { id } = await createReusablePaymentRequest(
				initiator.appUserId,
				'CSP Reusable Initiator',
				{ amount: 1000 }
			);

			const { context } = await withAuth({ displayName: 'CSP Reusable Payer' });
			const page = await context.newPage();
			const listeners = await attachCspListeners(page);

			await goto(page, `/send/${id}`);
			await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

			await expectNoCspViolations(page, listeners);
		});
	});

	// ── 6. History page ─────────────────────────────────────────────────────────

	test.describe('History page', () => {
		test('authenticated /history produces no CSP violations', async ({ withAuth }) => {
			const { context } = await withAuth({ displayName: 'CSP History User' });
			const page = await context.newPage();
			const listeners = await attachCspListeners(page);

			await goto(page, '/history');
			await expect(page.getByRole('heading', { name: 'Transaction history' })).toBeVisible();

			await expectNoCspViolations(page, listeners);
		});
	});

	// ── 7. Contacts page (list + detail) ───────────────────────────────────────

	test.describe('Contacts page', () => {
		test('the contacts list produces no CSP violations', async ({ withAuth }) => {
			const { context } = await withAuth({ displayName: 'CSP Contacts User' });
			const page = await context.newPage();
			const listeners = await attachCspListeners(page);

			await goto(page, '/contacts');
			await expect(page.getByRole('heading', { name: 'Contacts' })).toBeVisible();

			await expectNoCspViolations(page, listeners);
		});
	});

	// ── 8. Settings page ────────────────────────────────────────────────────────

	test.describe('Settings page', () => {
		test('authenticated /settings produces no CSP violations', async ({ withAuth }) => {
			const { context } = await withAuth({ displayName: 'CSP Settings User' });
			const page = await context.newPage();
			const listeners = await attachCspListeners(page);

			await goto(page, '/settings');
			await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

			await expectNoCspViolations(page, listeners);
		});
	});

	// ── 9. Onboarding flow ──────────────────────────────────────────────────────

	test.describe('Onboarding flow', () => {
		test.afterEach(async ({ email }) => {
			await deleteTestUser(email('onboarding'));
			clearOTPs(email('onboarding'));
		});

		test('completing onboarding via email produces no CSP violations', async ({ page, email }) => {
			// Listeners are attached before onboardUserViaEmail's own first
			// navigation, so every onboarding screen is covered.
			const listeners = await attachCspListeners(page);

			await onboardUserViaEmail(page, email('onboarding'), 'CSP Onboarding User');

			await expectNoCspViolations(page, listeners);
		});
	});

	// ── 10. Language switcher (bits-ui portal dropdown) ────────────────────────

	test.describe('Language switcher', () => {
		test('opening the dropdown and switching language produces no CSP violations', async ({
			page
		}) => {
			const listeners = await attachCspListeners(page);

			await goto(page, '/onboarding/consent');
			await page.getByRole('button', { name: 'Change language' }).click();
			// Wait for the portal-rendered menu to mount before interacting with items.
			await expect(page.getByRole('menu')).toBeVisible();
			await page.getByRole('menuitemradio', { name: 'Português' }).click();
			await expect(page.getByRole('button', { name: 'Compreendo, continuar' })).toBeVisible();

			await expectNoCspViolations(page, listeners);
		});
	});

	// ── 11. A bits-ui dialog (cancel-QR confirmation on the receive page) ──────

	test.describe('Cancel confirmation dialog (receive page)', () => {
		test('opening the cancel confirmation dialog produces no CSP violations', async ({
			withAuth
		}) => {
			const { context } = await withAuth({ displayName: 'CSP Dialog User' });
			const page = await context.newPage();
			const listeners = await attachCspListeners(page);

			await goto(page, '/receive');
			await page.locator('input[name="amount"]').fill('2.00');
			await page.getByRole('button', { name: 'Generate QR' }).click();

			await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible({ timeout: 10_000 });
			await page.getByRole('button', { name: 'Cancel' }).click();
			await expect(page.getByRole('dialog')).toBeVisible();

			await expectNoCspViolations(page, listeners);
		});
	});

	// ── 12. Service worker registration ────────────────────────────────────────

	test.describe('Service worker registration', () => {
		test('registering the service worker on /home produces no CSP violations', async ({
			withAuth
		}) => {
			const { context } = await withAuth({ displayName: 'CSP SW User' });
			const page = await context.newPage();
			const listeners = await attachCspListeners(page);

			await goto(page, '/home');

			// registerSW({ immediate: false }) (src/hooks.client.ts) defers
			// registration until after the load event — poll rather than assume
			// it's registered by the time the page is hydrated.
			await expect
				.poll(
					async () =>
						page.evaluate(async () => {
							const reg = await navigator.serviceWorker.getRegistration();
							return reg != null;
						}),
					{ timeout: 30_000 }
				)
				.toBe(true);

			await expectNoCspViolations(page, listeners);
		});
	});
});
