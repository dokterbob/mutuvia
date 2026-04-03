// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, vi } from 'vitest';
import {
	handleNotificationEvent,
	SeenEventIds,
	type QrCompletedEvent,
	type QrDeclinedEvent,
	type BalanceChangedEvent,
	type NotificationHandlers
} from './notifications';

describe('handleNotificationEvent', () => {
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

	it('dispatches qr_completed to onQrCompleted handler', () => {
		const handlers: NotificationHandlers = { onQrCompleted: vi.fn() };
		const seen = new SeenEventIds();
		handleNotificationEvent(qrCompleted, handlers, seen);
		expect(handlers.onQrCompleted).toHaveBeenCalledOnce();
		expect(handlers.onQrCompleted).toHaveBeenCalledWith(qrCompleted);
	});

	it('dispatches qr_declined to onQrDeclined handler', () => {
		const handlers: NotificationHandlers = { onQrDeclined: vi.fn() };
		const seen = new SeenEventIds();
		handleNotificationEvent(qrDeclined, handlers, seen);
		expect(handlers.onQrDeclined).toHaveBeenCalledOnce();
		expect(handlers.onQrDeclined).toHaveBeenCalledWith(qrDeclined);
	});

	it('dispatches balance_changed to onBalanceChanged handler', () => {
		const handlers: NotificationHandlers = { onBalanceChanged: vi.fn() };
		const seen = new SeenEventIds();
		handleNotificationEvent(balanceChanged, handlers, seen);
		expect(handlers.onBalanceChanged).toHaveBeenCalledOnce();
		expect(handlers.onBalanceChanged).toHaveBeenCalledWith(balanceChanged);
	});

	it('returns true on the first call for a given event id', () => {
		const seen = new SeenEventIds();
		const result = handleNotificationEvent(qrCompleted, {}, seen);
		expect(result).toBe(true);
	});

	it('returns false on a duplicate event id', () => {
		const seen = new SeenEventIds();
		handleNotificationEvent(qrCompleted, {}, seen);
		const result = handleNotificationEvent(qrCompleted, {}, seen);
		expect(result).toBe(false);
	});

	it('does not call the handler for a duplicate event id', () => {
		const handlers: NotificationHandlers = { onQrCompleted: vi.fn() };
		const seen = new SeenEventIds();
		handleNotificationEvent(qrCompleted, handlers, seen);
		handleNotificationEvent(qrCompleted, handlers, seen);
		expect(handlers.onQrCompleted).toHaveBeenCalledOnce();
	});

	it('does not throw when no handler is registered for an event type', () => {
		const seen = new SeenEventIds();
		expect(() => handleNotificationEvent(qrCompleted, {}, seen)).not.toThrow();
		expect(() => handleNotificationEvent(qrDeclined, {}, seen)).not.toThrow();
		expect(() => handleNotificationEvent(balanceChanged, {}, seen)).not.toThrow();
	});

	it('treats events with different ids as distinct even if same type', () => {
		const handlers: NotificationHandlers = { onQrCompleted: vi.fn() };
		const seen = new SeenEventIds();
		const second: QrCompletedEvent = { ...qrCompleted, id: 'evt-1b' };
		handleNotificationEvent(qrCompleted, handlers, seen);
		handleNotificationEvent(second, handlers, seen);
		expect(handlers.onQrCompleted).toHaveBeenCalledTimes(2);
	});
});

describe('SeenEventIds', () => {
	it('returns false for an id that has not been added', () => {
		const seen = new SeenEventIds();
		expect(seen.has('x')).toBe(false);
	});

	it('returns true for an id after it has been added', () => {
		const seen = new SeenEventIds();
		seen.add('x');
		expect(seen.has('x')).toBe(true);
	});

	it('is idempotent — adding the same id twice does not alter state', () => {
		const seen = new SeenEventIds(2);
		seen.add('a');
		seen.add('a');
		// 'a' is still present and the set hasn't grown past 1 entry
		expect(seen.has('a')).toBe(true);
		// Adding a second unique id should not evict 'a'
		seen.add('b');
		expect(seen.has('a')).toBe(true);
		expect(seen.has('b')).toBe(true);
	});

	it('evicts the oldest entry once the cap is reached', () => {
		const seen = new SeenEventIds(2);
		seen.add('a');
		seen.add('b');
		// At capacity — adding 'c' should evict 'a'
		seen.add('c');
		expect(seen.has('a')).toBe(false);
		expect(seen.has('b')).toBe(true);
		expect(seen.has('c')).toBe(true);
	});

	it('evicts entries in FIFO order', () => {
		const seen = new SeenEventIds(2);
		seen.add('a');
		seen.add('b');
		seen.add('c'); // evicts 'a'
		seen.add('d'); // evicts 'b'
		expect(seen.has('a')).toBe(false);
		expect(seen.has('b')).toBe(false);
		expect(seen.has('c')).toBe(true);
		expect(seen.has('d')).toBe(true);
	});
});
