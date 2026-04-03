// SPDX-License-Identifier: AGPL-3.0-or-later
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

// ── Install banner tests ──────────────────────────────────────────────────────

test.describe('Install banner', () => {
	test.describe('Chromium (beforeinstallprompt)', () => {
		test('shows banner after delay when beforeinstallprompt fires', async ({
			page,
			context,
			email
		}) => {
			await setupAuthenticatedUser(context, email('user'), 'Banner Tester');

			await page.addInitScript({ content: chromiumInstallScript() });
			await goto(page, '/home');

			// Trigger the install prompt event
			await page.evaluate(() =>
				(window as { __triggerInstallPrompt?: () => void }).__triggerInstallPrompt?.()
			);

			// Banner should appear after the 100ms delay + SW ready
			const banner = page.locator('[data-testid="install-banner"]');
			await expect(banner).toBeVisible({ timeout: 10_000 });

			// Install button should be present (not iOS)
			await expect(page.getByRole('button', { name: 'Install' })).toBeVisible();
		});

		test('clicking Install triggers prompt() and hides banner', async ({
			page,
			context,
			email
		}) => {
			await setupAuthenticatedUser(context, email('user'), 'Banner Tester');

			await page.addInitScript({ content: chromiumInstallScript() });
			await goto(page, '/home');

			await page.evaluate(() =>
				(window as { __triggerInstallPrompt?: () => void }).__triggerInstallPrompt?.()
			);

			const banner = page.locator('[data-testid="install-banner"]');
			await expect(banner).toBeVisible({ timeout: 10_000 });

			await page.getByRole('button', { name: 'Install' }).click();

			// After install is accepted the banner should hide
			await expect(banner).not.toBeVisible({ timeout: 5_000 });
		});

		test('dismissing hides banner and writes to localStorage', async ({ page, context, email }) => {
			await setupAuthenticatedUser(context, email('user'), 'Banner Tester');

			await page.addInitScript({ content: chromiumInstallScript() });
			await goto(page, '/home');

			await page.evaluate(() =>
				(window as { __triggerInstallPrompt?: () => void }).__triggerInstallPrompt?.()
			);

			const banner = page.locator('[data-testid="install-banner"]');
			await expect(banner).toBeVisible({ timeout: 10_000 });

			// Click the dismiss (×) button
			await page.getByRole('button', { name: /dismiss/i }).click();

			await expect(banner).not.toBeVisible({ timeout: 5_000 });

			// localStorage key should be written
			const stored = await page.evaluate(() => localStorage.getItem('mutuvia-install-dismissed'));
			expect(stored).not.toBeNull();
			expect(Number(stored)).toBeGreaterThan(0);
		});

		test('does not show banner when recently dismissed', async ({ page, context, email }) => {
			await setupAuthenticatedUser(context, email('user'), 'Banner Tester');

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

			// Wait long enough for the banner to have appeared if it were going to
			await page.waitForTimeout(600);

			const banner = page.locator('[data-testid="install-banner"]');
			await expect(banner).not.toBeVisible();
		});
	});

	test.describe('iOS Safari', () => {
		test('shows manual Add to Home Screen instructions', async ({ browser: pwBrowser, email }) => {
			const iosContext = await pwBrowser.newContext({
				userAgent:
					'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
			});
			const page = await iosContext.newPage();

			try {
				await setupAuthenticatedUser(iosContext, email('ios-user'), 'iOS Tester');

				await page.addInitScript({ content: IOS_SCRIPT });
				await goto(page, '/home');

				const banner = page.locator('[data-testid="install-banner"]');
				await expect(banner).toBeVisible({ timeout: 10_000 });

				// iOS hint text should be present
				await expect(page.getByText(/Tap the share button/)).toBeVisible();
			} finally {
				await iosContext.close();
			}
		});

		test('does not show Install button on iOS', async ({ browser: pwBrowser, email }) => {
			const iosContext = await pwBrowser.newContext({
				userAgent:
					'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
			});
			const page = await iosContext.newPage();

			try {
				await setupAuthenticatedUser(iosContext, email('ios-user'), 'iOS Tester');

				await page.addInitScript({ content: IOS_SCRIPT });
				await goto(page, '/home');

				const banner = page.locator('[data-testid="install-banner"]');
				await expect(banner).toBeVisible({ timeout: 10_000 });

				// No Install button on iOS — only the dismiss (×) button
				await expect(page.getByRole('button', { name: 'Install' })).not.toBeVisible();
			} finally {
				await iosContext.close();
			}
		});
	});

	test.describe('standalone mode', () => {
		test('does not show banner when running as installed PWA', async ({ page, context, email }) => {
			await setupAuthenticatedUser(context, email('user'), 'Banner Tester');

			await page.addInitScript({ content: standaloneScript() });
			await goto(page, '/home');

			// Trigger install prompt — should still be blocked by standalone mode
			await page.evaluate(() =>
				(window as { __triggerInstallPrompt?: () => void }).__triggerInstallPrompt?.()
			);

			await page.waitForTimeout(600);

			const banner = page.locator('[data-testid="install-banner"]');
			await expect(banner).not.toBeVisible();
		});
	});

	test.describe('unauthenticated visitor', () => {
		test('does not show banner on onboarding page', async ({ page }) => {
			// Onboarding uses a different layout that does not include InstallBanner
			await goto(page, '/onboarding');

			await page.waitForTimeout(600);

			const banner = page.locator('[data-testid="install-banner"]');
			await expect(banner).not.toBeVisible();
		});
	});

	// ── Cleanup ─────────────────────────────────────────────────────────────────

	test.afterEach(async ({ email }) => {
		// Clean up Chromium + standalone test users
		await deleteTestUser(email('user'));
		// Clean up iOS test users (created in their own contexts)
		await deleteTestUser(email('ios-user'));
	});
});
