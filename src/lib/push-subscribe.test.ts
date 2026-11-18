// SPDX-License-Identifier: AGPL-3.0-or-later
// Unit tests for the client-side push subscription utility.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Configurable VAPID key ref — lets individual tests toggle it empty.
// ---------------------------------------------------------------------------

const { vapidKeyRef } = vi.hoisted(() => ({
	vapidKeyRef: { value: 'BNxaGFSBTkP3WyGi6ZlDtGDd2ZJD9vRSNKpYKNuOjeo=' }
}));

vi.mock('$env/dynamic/public', () => ({
	env: {
		get PUBLIC_VAPID_KEY() {
			return vapidKeyRef.value;
		}
	}
}));

import { subscribeToPush, unsubscribeFromPush } from './push-subscribe';

// ---------------------------------------------------------------------------
// Shared mock objects
// ---------------------------------------------------------------------------

const mockSubscription = {
	toJSON: () => ({
		endpoint: 'https://fcm.googleapis.com/test-endpoint',
		keys: { p256dh: 'test-p256dh', auth: 'test-auth' }
	})
};

const mockPushManager = {
	getSubscription: vi.fn<() => Promise<typeof mockSubscription | null>>(),
	subscribe: vi.fn<() => Promise<typeof mockSubscription>>()
};

const mockRegistration = {
	pushManager: mockPushManager
};

const mockFetch = vi.fn<typeof fetch>();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('subscribeToPush()', () => {
	beforeEach(() => {
		vapidKeyRef.value = 'BNxaGFSBTkP3WyGi6ZlDtGDd2ZJD9vRSNKpYKNuOjeo=';

		vi.stubGlobal('navigator', {
			serviceWorker: { ready: Promise.resolve(mockRegistration) },
			userAgent: 'test-agent'
		});
		vi.stubGlobal('window', { PushManager: class PushManager {} });
		vi.stubGlobal('Notification', {
			requestPermission: vi.fn<() => Promise<NotificationPermission>>().mockResolvedValue('granted')
		});
		vi.stubGlobal('fetch', mockFetch);

		mockPushManager.getSubscription.mockResolvedValue(null);
		mockPushManager.subscribe.mockResolvedValue(mockSubscription);
		mockFetch.mockResolvedValue(new Response(null, { status: 200 }));

		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(console, 'info').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		vi.resetAllMocks();
	});

	it('returns false and warns when PUBLIC_VAPID_KEY is not set', async () => {
		vapidKeyRef.value = '';
		const result = await subscribeToPush();
		expect(result).toBe(false);
		expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('PUBLIC_VAPID_KEY'));
	});

	it('returns false when PushManager is not available in this browser', async () => {
		vi.stubGlobal('window', {}); // no PushManager
		const result = await subscribeToPush();
		expect(result).toBe(false);
	});

	it('returns false when notification permission is denied', async () => {
		vi.mocked(Notification.requestPermission).mockResolvedValue('denied');
		const result = await subscribeToPush();
		expect(result).toBe(false);
	});

	it('does not call pushManager.subscribe() again when already subscribed (idempotent)', async () => {
		mockPushManager.getSubscription.mockResolvedValue(mockSubscription);
		const result = await subscribeToPush();
		expect(result).toBe(true);
		expect(mockPushManager.subscribe).not.toHaveBeenCalled();
	});

	it('still POSTs to /api/push/subscribe when already subscribed — ownership must be reasserted', async () => {
		// A shared/handed-down device may already have a browser-level
		// subscription that the server still attributes to a previous user.
		// Re-POSTing re-asserts the current user as the owner.
		mockPushManager.getSubscription.mockResolvedValue(mockSubscription);
		const result = await subscribeToPush();
		expect(result).toBe(true);
		expect(mockFetch).toHaveBeenCalledWith(
			'/api/push/subscribe',
			expect.objectContaining({
				method: 'POST'
			})
		);
	});

	it('calls pushManager.subscribe() with userVisibleOnly: true and an applicationServerKey', async () => {
		await subscribeToPush();
		expect(mockPushManager.subscribe).toHaveBeenCalledWith(
			expect.objectContaining({
				userVisibleOnly: true,
				applicationServerKey: expect.any(Uint8Array)
			})
		);
	});

	it('POSTs subscription to /api/push/subscribe with endpoint, keys, and userAgent', async () => {
		await subscribeToPush();
		expect(mockFetch).toHaveBeenCalledWith(
			'/api/push/subscribe',
			expect.objectContaining({
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			})
		);
		const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
		expect(body.endpoint).toBe('https://fcm.googleapis.com/test-endpoint');
		expect(body.keys).toEqual({ p256dh: 'test-p256dh', auth: 'test-auth' });
		expect(body.userAgent).toBe('test-agent');
	});

	it('returns false and warns when the subscribe endpoint returns a non-OK status', async () => {
		mockFetch.mockResolvedValue(new Response(null, { status: 500 }));
		const result = await subscribeToPush();
		expect(result).toBe(false);
		expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('500'));
	});

	it('returns true on a full successful subscription flow', async () => {
		const result = await subscribeToPush();
		expect(result).toBe(true);
	});
});

describe('unsubscribeFromPush()', () => {
	const mockUnsubscribingSubscription = {
		endpoint: 'https://fcm.googleapis.com/test-endpoint',
		unsubscribe: vi.fn<() => Promise<boolean>>()
	};

	const mockGetRegistration = vi.fn();
	const mockUnsubPushManager = {
		getSubscription: vi.fn()
	};

	beforeEach(() => {
		vi.stubGlobal('navigator', {
			serviceWorker: { getRegistration: mockGetRegistration },
			userAgent: 'test-agent'
		});
		vi.stubGlobal('window', { PushManager: class PushManager {} });
		vi.stubGlobal('fetch', mockFetch);

		mockGetRegistration.mockResolvedValue({ pushManager: mockUnsubPushManager });
		mockUnsubPushManager.getSubscription.mockResolvedValue(mockUnsubscribingSubscription);
		mockUnsubscribingSubscription.unsubscribe.mockResolvedValue(true);
		mockFetch.mockResolvedValue(new Response(null, { status: 200 }));

		vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		vi.resetAllMocks();
	});

	it('unsubscribes the browser subscription and tells the server', async () => {
		await unsubscribeFromPush();
		expect(mockUnsubscribingSubscription.unsubscribe).toHaveBeenCalled();
		expect(mockFetch).toHaveBeenCalledWith(
			'/api/push/unsubscribe',
			expect.objectContaining({ method: 'POST' })
		);
		const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
		expect(body.endpoint).toBe('https://fcm.googleapis.com/test-endpoint');
	});

	it('does nothing when there is no service worker registration', async () => {
		mockGetRegistration.mockResolvedValue(null);
		await expect(unsubscribeFromPush()).resolves.toBeUndefined();
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it('does nothing when there is no active subscription', async () => {
		mockUnsubPushManager.getSubscription.mockResolvedValue(null);
		await expect(unsubscribeFromPush()).resolves.toBeUndefined();
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it('does not throw and still unsubscribes locally when the server request fails', async () => {
		mockFetch.mockRejectedValue(new Error('network down'));
		await expect(unsubscribeFromPush()).resolves.toBeUndefined();
		expect(mockUnsubscribingSubscription.unsubscribe).toHaveBeenCalled();
	});

	it('never throws, even if PushManager is unavailable', async () => {
		vi.stubGlobal('window', {}); // no PushManager
		await expect(unsubscribeFromPush()).resolves.toBeUndefined();
	});

	describe('when a browser API stalls instead of rejecting', () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it('resolves within UNSUBSCRIBE_TIMEOUT_MS when getRegistration() never resolves', async () => {
			mockGetRegistration.mockReturnValue(new Promise(() => {})); // never settles

			const promise = unsubscribeFromPush();
			let settled = false;
			void promise.then(() => {
				settled = true;
			});

			// Not yet — the deadline hasn't elapsed.
			await vi.advanceTimersByTimeAsync(2999);
			expect(settled).toBe(false);

			// The shared deadline elapses — the function must give up and resolve.
			await vi.advanceTimersByTimeAsync(1);
			await expect(promise).resolves.toBeUndefined();
			expect(mockFetch).not.toHaveBeenCalled(); // never got far enough to have an endpoint
		});

		it('does not unsubscribe anything when getRegistration() resolves only after the deadline', async () => {
			let resolveRegistration!: (r: unknown) => void;
			mockGetRegistration.mockReturnValue(
				new Promise((resolve) => {
					resolveRegistration = resolve;
				})
			);

			const promise = unsubscribeFromPush();
			await vi.advanceTimersByTimeAsync(3000);
			await expect(promise).resolves.toBeUndefined();

			// Sign-out is done; a later user may own the subscription by now.
			resolveRegistration({ pushManager: mockUnsubPushManager });
			await vi.advanceTimersByTimeAsync(0);

			expect(mockUnsubPushManager.getSubscription).not.toHaveBeenCalled();
			expect(mockUnsubscribingSubscription.unsubscribe).not.toHaveBeenCalled();
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it('does not unsubscribe anything when getSubscription() resolves only after the deadline', async () => {
			let resolveSubscription!: (s: unknown) => void;
			mockUnsubPushManager.getSubscription.mockReturnValue(
				new Promise((resolve) => {
					resolveSubscription = resolve;
				})
			);

			const promise = unsubscribeFromPush();
			await vi.advanceTimersByTimeAsync(3000);
			await expect(promise).resolves.toBeUndefined();

			resolveSubscription(mockUnsubscribingSubscription);
			await vi.advanceTimersByTimeAsync(0);

			expect(mockUnsubscribingSubscription.unsubscribe).not.toHaveBeenCalled();
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it('does not wait for subscription.unsubscribe() when it never resolves — still notifies the server', async () => {
			mockUnsubscribingSubscription.unsubscribe.mockReturnValue(new Promise(() => {})); // never settles

			const promise = unsubscribeFromPush();

			// Resolves promptly, well before the 3s deadline — unsubscribe() is
			// fire-and-forget, not blocking the server round trip.
			await vi.advanceTimersByTimeAsync(0);
			await expect(promise).resolves.toBeUndefined();

			expect(mockFetch).toHaveBeenCalledWith(
				'/api/push/unsubscribe',
				expect.objectContaining({ method: 'POST' })
			);
		});
	});
});
