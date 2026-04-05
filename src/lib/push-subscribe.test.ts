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

import { subscribeToPush } from './push-subscribe';

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

	it('returns true without re-subscribing when already subscribed (idempotent)', async () => {
		mockPushManager.getSubscription.mockResolvedValue(mockSubscription);
		const result = await subscribeToPush();
		expect(result).toBe(true);
		expect(mockPushManager.subscribe).not.toHaveBeenCalled();
		expect(mockFetch).not.toHaveBeenCalled();
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
