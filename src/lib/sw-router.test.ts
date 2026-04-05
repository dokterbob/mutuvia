// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { routeNotificationEvent, type SwContext, type WindowClient } from './sw-router';
import type { QrCompletedEvent, QrDeclinedEvent, BalanceChangedEvent } from './notifications';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(clients: WindowClient[]): SwContext {
	return {
		clients: {
			matchAll: vi.fn().mockResolvedValue(clients)
		},
		registration: {
			showNotification: vi.fn().mockResolvedValue(undefined)
		}
	};
}

const qrCompleted: QrCompletedEvent = {
	type: 'qr_completed',
	id: 'evt-1',
	qrId: 'qr-abc',
	otherName: 'Alice',
	formattedAmount: '€10.00'
};

const qrDeclined: QrDeclinedEvent = {
	type: 'qr_declined',
	id: 'evt-2',
	qrId: 'qr-abc'
};

const balanceChanged: BalanceChangedEvent = {
	type: 'balance_changed',
	id: 'evt-3',
	newBalance: 500,
	formattedBalance: '€5.00'
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('routeNotificationEvent — window focus routing', () => {
	describe('given a focused window', () => {
		let ctx: SwContext;
		let focusedClient: WindowClient;

		beforeEach(() => {
			focusedClient = { focused: true, postMessage: vi.fn() };
			ctx = makeCtx([focusedClient]);
		});

		it('calls postMessage and does NOT call showNotification', async () => {
			await routeNotificationEvent(ctx, qrCompleted);

			expect(focusedClient.postMessage).toHaveBeenCalledOnce();
			expect(focusedClient.postMessage).toHaveBeenCalledWith({
				type: 'push-notification',
				payload: qrCompleted
			});
			expect(ctx.registration.showNotification).not.toHaveBeenCalled();
		});
	});

	describe('given an unfocused window', () => {
		let ctx: SwContext;
		let unfocusedClient: WindowClient;

		beforeEach(() => {
			unfocusedClient = { focused: false, postMessage: vi.fn() };
			ctx = makeCtx([unfocusedClient]);
		});

		it('calls showNotification and does NOT call postMessage', async () => {
			await routeNotificationEvent(ctx, qrCompleted);

			expect(unfocusedClient.postMessage).not.toHaveBeenCalled();
			expect(ctx.registration.showNotification).toHaveBeenCalledOnce();
		});
	});

	describe('given no windows', () => {
		let ctx: SwContext;

		beforeEach(() => {
			ctx = makeCtx([]);
		});

		it('calls showNotification', async () => {
			await routeNotificationEvent(ctx, qrCompleted);

			expect(ctx.registration.showNotification).toHaveBeenCalledOnce();
		});
	});

	describe('given a mix of focused and unfocused clients', () => {
		let ctx: SwContext;
		let focused: WindowClient;
		let unfocused: WindowClient;

		beforeEach(() => {
			unfocused = { focused: false, postMessage: vi.fn() };
			focused = { focused: true, postMessage: vi.fn() };
			ctx = makeCtx([unfocused, focused]);
		});

		it('picks the focused client', async () => {
			await routeNotificationEvent(ctx, qrCompleted);

			expect(focused.postMessage).toHaveBeenCalledOnce();
			expect(unfocused.postMessage).not.toHaveBeenCalled();
			expect(ctx.registration.showNotification).not.toHaveBeenCalled();
		});
	});
});

describe('routeNotificationEvent — notification content', () => {
	let ctx: SwContext;

	beforeEach(() => {
		ctx = makeCtx([]);
	});

	it('qr_completed: title is "Transaction settled" and body includes otherName and formattedAmount', async () => {
		await routeNotificationEvent(ctx, qrCompleted);

		expect(ctx.registration.showNotification).toHaveBeenCalledWith(
			'Transaction settled',
			expect.objectContaining({
				body: expect.stringContaining('Alice'),
				tag: `qr-${qrCompleted.qrId}`
			})
		);
		const [, opts] = (ctx.registration.showNotification as ReturnType<typeof vi.fn>).mock
			.calls[0] as [string, NotificationOptions];
		expect(opts.body).toContain('€10.00');
	});

	it('qr_declined: title is "Transaction declined"', async () => {
		await routeNotificationEvent(ctx, qrDeclined);

		expect(ctx.registration.showNotification).toHaveBeenCalledWith(
			'Transaction declined',
			expect.objectContaining({ tag: `qr-${qrDeclined.qrId}` })
		);
	});

	it('balance_changed: title is "Balance updated" and body is the formattedBalance', async () => {
		await routeNotificationEvent(ctx, balanceChanged);

		expect(ctx.registration.showNotification).toHaveBeenCalledWith(
			'Balance updated',
			expect.objectContaining({ body: '€5.00', tag: 'balance' })
		);
	});
});
