// SPDX-License-Identifier: AGPL-3.0-or-later

/** Returns true when the app is running as an installed PWA (standalone mode). */
export function isStandaloneMode(): boolean {
	if (typeof window === 'undefined') return false;
	return (
		window.matchMedia('(display-mode: standalone)').matches ||
		!!(navigator as { standalone?: boolean }).standalone
	);
}

/** Returns true when running on iOS Safari (including iPadOS via feature detection). */
export function isIOSDevice(): boolean {
	if (typeof window === 'undefined') return false;
	return 'GestureEvent' in window && 'ontouchstart' in window;
}

/**
 * Returns the stored dismissal timestamp (ms since epoch), or null if not set.
 * Returns null on storage errors (privacy mode, sandboxed iframes).
 */
export function getDismissalTimestamp(key: string): number | null {
	try {
		const raw = localStorage.getItem(key);
		if (raw === null) return null;
		const parsed = Number(raw);
		return isNaN(parsed) ? null : parsed;
	} catch {
		return null;
	}
}

/**
 * Returns true if the dismissal was stored within the last `days` days.
 */
export function isDismissedRecently(key: string, days: number): boolean {
	const timestamp = getDismissalTimestamp(key);
	if (timestamp === null) return false;
	return timestamp > Date.now() - days * 86_400_000;
}

/** Stores the current timestamp as the dismissal time. Silently ignores storage errors. */
export function saveDismissal(key: string): void {
	try {
		localStorage.setItem(key, String(Date.now()));
	} catch {
		// Quota exceeded or storage blocked — in-memory dismissed state still works
	}
}

const DISMISS_KEY = 'mutuvia-install-dismissed';
const DISMISS_DAYS = 30;

export class UseInstallPrompt {
	#deferredPrompt = $state<BeforeInstallPromptEvent | null>(null);
	#dismissed = $state(false);
	#installed = $state(false);
	#ready = $state(false);
	#swReady = $state(false);

	constructor({ delay = 5000 }: { delay?: number } = {}) {
		// Check dismissal on construction (before $effect, so it's synchronous)
		if (isDismissedRecently(DISMISS_KEY, DISMISS_DAYS)) {
			this.#dismissed = true;
		}

		$effect(() => {
			const handleBeforeInstallPrompt = (e: BeforeInstallPromptEvent) => {
				e.preventDefault();
				this.#deferredPrompt = e;
			};

			const handleAppInstalled = () => {
				this.#installed = true;
				this.#deferredPrompt = null;
			};

			window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
			window.addEventListener('appinstalled', handleAppInstalled);

			const timer = setTimeout(() => {
				this.#ready = true;
			}, delay);

			// Wait for SW to be ready, with a 10s timeout fallback so the banner
			// can still appear if the SW registration hangs or is misconfigured.
			if ('serviceWorker' in navigator) {
				const swPromise = navigator.serviceWorker.ready.then(() => true);
				const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 10_000));
				Promise.race([swPromise, timeout])
					.then(() => {
						this.#swReady = true;
					})
					.catch(() => {
						this.#swReady = true;
					});
			} else {
				// No SW support — allow banner anyway
				this.#swReady = true;
			}

			return () => {
				window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
				window.removeEventListener('appinstalled', handleAppInstalled);
				clearTimeout(timer);
			};
		});
	}

	get isStandalone(): boolean {
		return isStandaloneMode();
	}

	get isIOS(): boolean {
		return isIOSDevice();
	}

	get showBanner(): boolean {
		return (
			this.#ready &&
			this.#swReady &&
			!this.isStandalone &&
			!this.#installed &&
			!this.#dismissed &&
			(this.#deferredPrompt !== null || this.isIOS)
		);
	}

	async install(): Promise<void> {
		if (!this.#deferredPrompt) return;
		const result = await this.#deferredPrompt.prompt();
		if (result.outcome === 'accepted') {
			this.#installed = true;
		}
		this.#deferredPrompt = null;
	}

	dismiss(): void {
		this.#dismissed = true;
		saveDismissal(DISMISS_KEY);
	}
}
