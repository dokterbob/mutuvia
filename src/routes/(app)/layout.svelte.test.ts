// SPDX-License-Identifier: AGPL-3.0-or-later
// Tests for the SSE → toast notification handlers in the (app) layout.
// We test that the handlers registered via sseManager.on() call the right
// toast functions, without needing to render the full Svelte component.

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import type { NotificationHandlers } from '$lib/notifications';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const unsubSpy = vi.fn();
const onSpy = vi.fn<(handlers: NotificationHandlers) => () => void>().mockReturnValue(unsubSpy);
const connectSpy = vi.fn();
const disconnectSpy = vi.fn();

vi.mock('$lib/sse-client', () => ({
	sseManager: {
		connect: (...args: unknown[]) => connectSpy(...args),
		disconnect: (...args: unknown[]) => disconnectSpy(...args),
		on: (...args: unknown[]) => onSpy(...(args as [NotificationHandlers]))
	}
}));

const toastSuccessSpy = vi.fn();
const toastErrorSpy = vi.fn();

vi.mock('svelte-sonner', () => ({
	toast: {
		success: (...args: unknown[]) => toastSuccessSpy(...args),
		error: (...args: unknown[]) => toastErrorSpy(...args)
	}
}));

vi.mock('$lib/paraglide/messages.js', () => ({
	toast_transaction_accepted: ({ name, amount }: { name: string; amount: string }) =>
		`${name} — ${amount}`,
	toast_transaction_declined: () => 'Your request was declined'
}));

vi.mock('$lib/paraglide/runtime.js', () => ({ getLocale: () => 'en' }));

vi.mock('$lib/components/install-banner.svelte', () => ({ default: () => {} }));

vi.mock('$app/environment', () => ({ browser: true }));

import AppLayout from './+layout.svelte';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('(app) layout – SSE → toast handlers', () => {
	beforeEach(() => {
		onSpy.mockClear().mockReturnValue(unsubSpy);
		unsubSpy.mockClear();
		connectSpy.mockClear();
		disconnectSpy.mockClear();
		toastSuccessSpy.mockClear();
		toastErrorSpy.mockClear();
	});

	function renderLayout() {
		const children = createRawSnippet(() => ({
			render: () => '<div></div>',
			setup: () => {}
		}));
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return render(AppLayout, { props: { children } as any });
	}

	it('connects SSE manager on mount', () => {
		renderLayout();
		expect(connectSpy).toHaveBeenCalledOnce();
	});

	it('registers notification handlers on mount', () => {
		renderLayout();
		expect(onSpy).toHaveBeenCalledOnce();
		const handlers = onSpy.mock.calls[0][0];
		expect(typeof handlers.onQrCompleted).toBe('function');
		expect(typeof handlers.onQrDeclined).toBe('function');
	});

	it('shows success toast on qr_completed event', () => {
		renderLayout();
		const handlers = onSpy.mock.calls[0][0];
		handlers.onQrCompleted!({
			type: 'qr_completed',
			id: 'evt-1',
			qrId: 'qr-1',
			otherName: 'Alice',
			formattedAmount: '€10.00'
		});
		expect(toastSuccessSpy).toHaveBeenCalledWith('Alice — €10.00');
	});

	it('shows error toast on qr_declined event', () => {
		renderLayout();
		const handlers = onSpy.mock.calls[0][0];
		handlers.onQrDeclined!({ type: 'qr_declined', id: 'evt-2', qrId: 'qr-1' });
		expect(toastErrorSpy).toHaveBeenCalledWith('Your request was declined');
	});

	it('disconnects SSE and unsubscribes handlers on unmount', () => {
		renderLayout();
		expect(unsubSpy).not.toHaveBeenCalled();
		expect(disconnectSpy).not.toHaveBeenCalled();
		cleanup();
		expect(unsubSpy).toHaveBeenCalledOnce();
		expect(disconnectSpy).toHaveBeenCalledOnce();
	});
});
