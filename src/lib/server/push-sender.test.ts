// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

const { selectWhereFn, dbSelectMock, deleteWhereFn, dbDeleteMock, sendNotificationMock } =
	vi.hoisted(() => {
		const selectWhereFn = vi.fn();
		const selectFromFn = vi.fn().mockReturnValue({ where: selectWhereFn });
		const dbSelectMock = vi.fn().mockReturnValue({ from: selectFromFn });

		const deleteWhereFn = vi.fn().mockResolvedValue(undefined);
		const dbDeleteMock = vi.fn().mockReturnValue({ where: deleteWhereFn });

		const sendNotificationMock = vi.fn().mockResolvedValue({ statusCode: 201 });

		return { selectWhereFn, dbSelectMock, deleteWhereFn, dbDeleteMock, sendNotificationMock };
	});

vi.mock('$lib/server/db', () => ({
	db: { select: dbSelectMock, delete: dbDeleteMock }
}));

vi.mock('$lib/server/schema', () => ({
	pushSubscriptions: {
		userId: 'pushSubscriptions.userId',
		endpoint: 'pushSubscriptions.endpoint'
	}
}));

vi.mock('$lib/config', () => ({
	config: {
		vapidSubject: 'mailto:admin@example.com',
		vapidPublicKey: 'pub',
		vapidPrivateKey: 'priv',
		pushEndpointExtraHosts: [] as string[]
	}
}));

vi.mock('web-push', () => ({
	default: { sendNotification: sendNotificationMock }
}));

vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => `${String(a)}=${String(b)}`),
	and: vi.fn((...args: unknown[]) => args.join(' AND '))
}));

import { sendPushToUser } from './push-sender';
import type { BalanceChangedEvent } from '$lib/notifications';

const event: BalanceChangedEvent = {
	type: 'balance_changed',
	id: 'evt-1',
	newBalance: 500,
	formattedBalance: '€5.00'
};

function makeSub(overrides: Partial<Record<string, string>> = {}) {
	return {
		endpoint: 'https://fcm.googleapis.com/abc',
		p256dh: 'p256dh-value',
		auth: 'auth-value',
		...overrides
	};
}

describe('sendPushToUser()', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		selectWhereFn.mockResolvedValue([]);
		deleteWhereFn.mockResolvedValue(undefined);
		sendNotificationMock.mockResolvedValue({ statusCode: 201 });
		vi.spyOn(console, 'info').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	describe('given no subscriptions for the user', () => {
		it('does not call sendNotification', async () => {
			await sendPushToUser('user-1', event);
			expect(sendNotificationMock).not.toHaveBeenCalled();
		});
	});

	describe('given a valid subscription', () => {
		it('sends with VAPID details and a timeout', async () => {
			selectWhereFn.mockResolvedValue([makeSub()]);
			await sendPushToUser('user-1', event);
			expect(sendNotificationMock).toHaveBeenCalledWith(
				{
					endpoint: 'https://fcm.googleapis.com/abc',
					keys: { p256dh: 'p256dh-value', auth: 'auth-value' }
				},
				JSON.stringify(event),
				expect.objectContaining({
					timeout: expect.any(Number),
					vapidDetails: expect.objectContaining({ subject: 'mailto:admin@example.com' })
				})
			);
		});
	});

	describe('given a subscription whose endpoint is no longer on the allowlist', () => {
		it('deletes it without attempting to send', async () => {
			selectWhereFn.mockResolvedValue([makeSub({ endpoint: 'https://evil.example.com/abc' })]);
			await sendPushToUser('user-1', event);
			expect(sendNotificationMock).not.toHaveBeenCalled();
			expect(dbDeleteMock).toHaveBeenCalled();
		});
	});

	describe('given a send that fails with 410 Gone', () => {
		it('removes the stale subscription', async () => {
			selectWhereFn.mockResolvedValue([makeSub()]);
			sendNotificationMock.mockRejectedValue({ statusCode: 410 });
			await sendPushToUser('user-1', event);
			expect(dbDeleteMock).toHaveBeenCalled();
		});
	});

	describe('given a send that fails with 404 Not Found', () => {
		it('removes the stale subscription', async () => {
			selectWhereFn.mockResolvedValue([makeSub()]);
			sendNotificationMock.mockRejectedValue({ statusCode: 404 });
			await sendPushToUser('user-1', event);
			expect(dbDeleteMock).toHaveBeenCalled();
		});
	});

	describe('given a send that fails with another error', () => {
		it('does not delete the subscription and logs only the status code and host', async () => {
			const fullError = {
				statusCode: 500,
				headers: { 'x-sensitive': 'leaky-value' },
				body: 'full response body that should never be logged'
			};
			selectWhereFn.mockResolvedValue([makeSub()]);
			sendNotificationMock.mockRejectedValue(fullError);

			await sendPushToUser('user-1', event);

			expect(dbDeleteMock).not.toHaveBeenCalled();
			expect(console.error).toHaveBeenCalledTimes(1);
			const loggedArgs = (console.error as unknown as { mock: { calls: unknown[][] } }).mock
				.calls[0];
			expect(loggedArgs).toHaveLength(1); // no second arg carrying the raw error object
			expect(String(loggedArgs[0])).toContain('500');
			expect(String(loggedArgs[0])).toContain('fcm.googleapis.com');
			expect(String(loggedArgs[0])).not.toContain('leaky-value');
			expect(String(loggedArgs[0])).not.toContain('full response body');
		});
	});

	describe('given the database lookup throws', () => {
		it('never throws', async () => {
			selectWhereFn.mockRejectedValue(new Error('db down'));
			await expect(sendPushToUser('user-1', event)).resolves.toBeUndefined();
		});
	});
});
