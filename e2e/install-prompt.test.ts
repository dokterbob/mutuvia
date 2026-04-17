// SPDX-License-Identifier: AGPL-3.0-or-later
import type { BrowserContext } from '@playwright/test';
import { test, expect, deleteTestUser, setupAuthenticatedUser, goto } from './test-utils.js';

// ── Shared init script builders ───────────────────────────────────────────────

/** Mock navigator.serviceWorker.ready to resolve immediately. */
const SW_READY_MOCK = `
	if ('serviceWorker' in navigator) {
		const fakeReg = { active: { state: 'activated' } };
		Object.defineProperty(navigator.serviceWorker, 'ready', {
			get: () => Promise.resolve(fakeReg),
			configurable: true
		});
	}
`;

/** Inject into a Chromium context to enable beforeinstallprompt simulation. */
function chromiumInstallScript(): string {
	return `
		window.__installBannerDelay = 100;
		${SW_READY_MOCK}
		let installListener = null;
		const originalAdd = window.addEventListener.bind(window);
		window.addEventListener = function(type, listener, ...args) {
			if (type === 'beforeinstallprompt') installListener = listener;
			return originalAdd(type, listener, ...args);
		};
		window.__triggerInstallPrompt = function() {
			if (!installListener) return;
			const event = new Event('beforeinstallprompt');
			event.preventDefault = () => {};
			event.prompt = () => Promise.resolve({ outcome: 'accepted' });
			installListener(event);
		};
	`;
}

/** Inject to simulate standalone (already-installed PWA) mode. */
function standaloneScript(): string {
	return `
		window.__installBannerDelay = 100;
		${SW_READY_MOCK}
		const origMatchMedia = window.matchMedia.bind(window);
		window.matchMedia = function(query) {
			if (query === '(display-mode: standalone)') {
				return { matches: true, addEventListener: () => {}, removeEventListener: () => {} };
			}
			return origMatchMedia(query);
		};
		let installListener = null;
		const originalAdd = window.addEventListener.bind(window);
		window.addEventListener = function(type, listener, ...args) {
			if (type === 'beforeinstallprompt') installListener = listener;
			return originalAdd(type, listener, ...args);
		};
		window.__triggerInstallPrompt = function() {
			if (!installListener) return;
			const event = new Event('beforeinstallprompt');
			event.preventDefault = () => {};
			event.prompt = () => Promise.resolve({ outcome: 'accepted' });
			installListener(event);
		};
	`;
}

/** iOS init script: simulate iOS device detection + immediate SW ready. */
const IOS_SCRIPT = `
	window.__installBannerDelay = 100;
	${SW_READY_MOCK}
	// Simulate iOS: GestureEvent + ontouchstart present
	window.GestureEvent = function() {};
	window.ontouchstart = null;
`;

const IOS_USER_AGENT =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

// ── Install banner tests ──────────────────────────────────────────────────────

test.describe('Install banner', () => {
	// ── Chromium (beforeinstallprompt) ────────────────────────────────────────
	// Use .serial so beforeAll runs once — prevents parallel workers from racing
	// on creating/deleting the same test user (e2e-install-prompt-user@test.example).
	test.describe.serial('Chromium (beforeinstallprompt)', () => {
		let storage: Awaited<ReturnType<BrowserContext['storageState']>>;

		test.beforeAll(async ({ browser, email }, testInfo) => {
			const ctx = await browser.newContext({ baseURL: testInfo.project.use.baseURL! });
			await setupAuthenticatedUser(ctx, email('user'), 'Banner Tester');
			storage = await ctx.storageState();
			await ctx.close();
		});

		test.afterAll(async ({ email }) => {
			await deleteTestUser(email('user'));
		});

		test('shows banner after delay when beforeinstallprompt fires', async ({
			browser
		}, testInfo) => {
			const ctx = await browser.newContext({
				storageState: storage,
				baseURL: testInfo.project.use.baseURL!
			});
			const page = await ctx.newPage();
			try {
				await page.addInitScript({ content: chromiumInstallScript() });
				await goto(page, '/home');

				await page.evaluate(() =>
					(window as { __triggerInstallPrompt?: () => void }).__triggerInstallPrompt?.()
				);

				const banner = page.locator('[data-testid="install-banner"]');
				await expect(banner).toBeVisible({ timeout: 10_000 });
				await expect(page.getByRole('button', { name: 'Install' })).toBeVisible();
			} finally {
				await ctx.close();
			}
		});

		test('clicking Install triggers prompt() and hides banner', async ({
			browser
		}, testInfo) => {
			const ctx = await browser.newContext({
				storageState: storage,
				baseURL: testInfo.project.use.baseURL!
			});
			const page = await ctx.newPage();
			try {
				await page.addInitScript({ content: chromiumInstallScript() });
				await goto(page, '/home');

				await page.evaluate(() =>
					(window as { __triggerInstallPrompt?: () => void }).__triggerInstallPrompt?.()
				);

				const banner = page.locator('[data-testid="install-banner"]');
				await expect(banner).toBeVisible({ timeout: 10_000 });

				await page.getByRole('button', { name: 'Install' }).click();
				await expect(banner).not.toBeVisible({ timeout: 5_000 });
			} finally {
				await ctx.close();
			}
		});

		test('dismissing hides banner and writes to localStorage', async ({
			browser
		}, testInfo) => {
			const ctx = await browser.newContext({
				storageState: storage,
				baseURL: testInfo.project.use.baseURL!
			});
			const page = await ctx.newPage();
			try {
				await page.addInitScript({ content: chromiumInstallScript() });
				await goto(page, '/home');

				await page.evaluate(() =>
					(window as { __triggerInstallPrompt?: () => void }).__triggerInstallPrompt?.()
				);

				const banner = page.locator('[data-testid="install-banner"]');
				await expect(banner).toBeVisible({ timeout: 10_000 });

				await banner.getByRole('button', { name: /dismiss/i }).click();
				await expect(banner).not.toBeVisible({ timeout: 5_000 });

				const stored = await page.evaluate(() =>
					localStorage.getItem('mutuvia-install-dismissed')
				);
				expect(stored).not.toBeNull();
				expect(Number(stored)).toBeGreaterThan(0);
			} finally {
				await ctx.close();
			}
		});

		test("closing with 'Not now' hides banner and writes to localStorage", async ({
			browser
		}, testInfo) => {
			const ctx = await browser.newContext({
				storageState: storage,
				baseURL: testInfo.project.use.baseURL!
			});
			const page = await ctx.newPage();
			try {
				await page.addInitScript({ content: chromiumInstallScript() });
				await goto(page, '/home');

				await page.evaluate(() =>
					(window as { __triggerInstallPrompt?: () => void }).__triggerInstallPrompt?.()
				);

				const banner = page.locator('[data-testid="install-banner"]');
				await expect(banner).toBeVisible({ timeout: 10_000 });

				await page.getByRole('button', { name: 'Not now' }).click();
				await expect(banner).not.toBeVisible({ timeout: 5_000 });

				const stored = await page.evaluate(() =>
					localStorage.getItem('mutuvia-install-dismissed')
				);
				expect(stored).not.toBeNull();
				expect(Number(stored)).toBeGreaterThan(0);
			} finally {
				await ctx.close();
			}
		});

		test('pressing Escape hides banner and writes to localStorage', async ({
			browser
		}, testInfo) => {
			const ctx = await browser.newContext({
				storageState: storage,
				baseURL: testInfo.project.use.baseURL!
			});
			const page = await ctx.newPage();
			try {
				await page.addInitScript({ content: chromiumInstallScript() });
				await goto(page, '/home');

				await page.evaluate(() =>
					(window as { __triggerInstallPrompt?: () => void }).__triggerInstallPrompt?.()
				);

				const banner = page.locator('[data-testid="install-banner"]');
				await expect(banner).toBeVisible({ timeout: 10_000 });

				await page.keyboard.press('Escape');
				await expect(banner).not.toBeVisible({ timeout: 5_000 });

				const stored = await page.evaluate(() =>
					localStorage.getItem('mutuvia-install-dismissed')
				);
				expect(stored).not.toBeNull();
				expect(Number(stored)).toBeGreaterThan(0);
			} finally {
				await ctx.close();
			}
		});

		test('does not show banner when recently dismissed', async ({ browser }, testInfo) => {
			const ctx = await browser.newContext({
				storageState: storage,
				baseURL: testInfo.project.use.baseURL!
			});
			const page = await ctx.newPage();
			try {
				await page.addInitScript({
					content: `
						${chromiumInstallScript()}
						localStorage.setItem('mutuvia-install-dismissed', String(Date.now() - 3_600_000));
					`
				});
				await goto(page, '/home');

				await page.evaluate(() =>
					(window as { __triggerInstallPrompt?: () => void }).__triggerInstallPrompt?.()
				);

				await page.waitForTimeout(600);

				const banner = page.locator('[data-testid="install-banner"]');
				await expect(banner).not.toBeVisible();
			} finally {
				await ctx.close();
			}
		});
	});

	// ── iOS Safari ────────────────────────────────────────────────────────────
	// Use .serial for the same reason: beforeAll must not race across workers.
	// Each test creates its own iOS context (custom userAgent + auth cookies from
	// storage) so the mutable iosContext/iosPage pattern is no longer needed.
	test.describe.serial('iOS Safari', () => {
		let iosStorage: Awaited<ReturnType<BrowserContext['storageState']>>;

		test.beforeAll(async ({ browser, email }, testInfo) => {
			const ctx = await browser.newContext({ baseURL: testInfo.project.use.baseURL! });
			await setupAuthenticatedUser(ctx, email('ios-user'), 'iOS Tester');
			iosStorage = await ctx.storageState();
			await ctx.close();
		});

		test.afterAll(async ({ email }) => {
			await deleteTestUser(email('ios-user'));
		});

		test('shows manual Add to Home Screen instructions', async ({ browser }, testInfo) => {
			const ctx = await browser.newContext({
				storageState: iosStorage,
				baseURL: testInfo.project.use.baseURL!,
				userAgent: IOS_USER_AGENT
			});
			const page = await ctx.newPage();
			try {
				await page.addInitScript({ content: IOS_SCRIPT });
				await goto(page, '/home');
				await expect(page.locator('[data-testid="install-banner"]')).toBeVisible({
					timeout: 10_000
				});
				await expect(page.getByText(/Tap the share button/)).toBeVisible();
			} finally {
				await ctx.close();
			}
		});

		test('does not show Install button on iOS', async ({ browser }, testInfo) => {
			const ctx = await browser.newContext({
				storageState: iosStorage,
				baseURL: testInfo.project.use.baseURL!,
				userAgent: IOS_USER_AGENT
			});
			const page = await ctx.newPage();
			try {
				await page.addInitScript({ content: IOS_SCRIPT });
				await goto(page, '/home');
				await expect(page.locator('[data-testid="install-banner"]')).toBeVisible({
					timeout: 10_000
				});
				await expect(page.getByRole('button', { name: 'Install' })).not.toBeVisible();
			} finally {
				await ctx.close();
			}
		});
	});

	// ── Standalone mode ───────────────────────────────────────────────────────
	test.describe('standalone mode', () => {
		test.afterEach(async ({ email }) => {
			await deleteTestUser(email('standalone-user'));
		});

		test('does not show banner when running as installed PWA', async ({ page, context, email }) => {
			await setupAuthenticatedUser(context, email('standalone-user'), 'Banner Tester');

			await page.addInitScript({ content: standaloneScript() });
			await goto(page, '/home');

			await page.evaluate(() =>
				(window as { __triggerInstallPrompt?: () => void }).__triggerInstallPrompt?.()
			);

			await page.waitForTimeout(600);

			const banner = page.locator('[data-testid="install-banner"]');
			await expect(banner).not.toBeVisible();
		});
	});

	// ── Unauthenticated visitor ───────────────────────────────────────────────
	test.describe('unauthenticated visitor', () => {
		test('does not show banner on onboarding page', async ({ page }) => {
			await goto(page, '/onboarding');

			await page.waitForTimeout(600);

			const banner = page.locator('[data-testid="install-banner"]');
			await expect(banner).not.toBeVisible();
		});
	});
});
