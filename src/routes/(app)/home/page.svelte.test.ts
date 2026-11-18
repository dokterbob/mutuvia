// SPDX-License-Identifier: AGPL-3.0-or-later
// Tests for SSE-driven invalidateAll() reactivity on the home page.
// The home page registers handlers via sseManager.on() that call invalidateAll()
// when qr_completed or qr_declined events fire, keeping balance and transactions current.

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import type { NotificationHandlers } from '$lib/notifications';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const cleanupSpy = vi.fn();
const onSpy = vi.fn<(handlers: NotificationHandlers) => () => void>().mockReturnValue(cleanupSpy);

vi.mock('$lib/sse-client', () => ({
	sseManager: { on: (...args: unknown[]) => onSpy(...(args as [NotificationHandlers])) }
}));

vi.mock('$app/navigation', () => ({
	goto: vi.fn(),
	invalidateAll: vi.fn()
}));

vi.mock('$app/forms', () => ({
	enhance: vi.fn().mockReturnValue({ destroy: vi.fn() })
}));

vi.mock('$app/environment', () => ({ browser: false }));

vi.mock('$lib/paraglide/runtime.js', () => ({ getLocale: () => 'en' }));

vi.mock('$lib/paraglide/messages.js', () => ({
	home_greeting_morning: ({ name }: { name: string }) => `Good morning, ${name}`,
	home_greeting_afternoon: ({ name }: { name: string }) => `Good afternoon, ${name}`,
	home_greeting_evening: ({ name }: { name: string }) => `Good evening, ${name}`,
	home_greeting_night: ({ name }: { name: string }) => `Good night, ${name}`,
	home_balance_label: () => 'Balance',
	home_balance_positive: () => 'You are owed',
	home_balance_negative: () => 'You owe',
	home_balance_zero: () => 'All settled',
	home_balance_first_use: () => 'Start by sending or receiving',
	home_send: () => 'Send',
	home_scan: () => 'Scan',
	home_receive: () => 'Receive',
	home_recent: () => 'Recent',
	home_see_all: () => 'See all',
	home_empty_state: () => 'No transactions yet',
	home_pending: () => 'Pending',
	home_pending_send: ({ amount }: { amount: string }) => `Send ${amount}`,
	home_pending_receive: ({ amount }: { amount: string }) => `Receive ${amount}`,
	home_pending_expired: () => 'Expired',
	home_open_amount: () => 'any amount',
	home_reusable_payment_count_singular: ({ count }: { count: string }) =>
		`Received ${count} payment`,
	home_reusable_payment_count_plural: ({ count }: { count: string }) =>
		`Received ${count} payments`,
	home_reusable_badge: () => 'Reusable',
	home_paused_badge: () => 'Paused',
	home_resume_action: () => 'Resume',
	pending_cancel_aria: () => 'Cancel',
	qr_expires: ({ time }: { time: string }) => `Expires ${time}`,
	time_just_now: () => 'just now',
	time_minutes_ago: ({ count }: { count: string }) => `${count}m ago`,
	time_hours_ago: ({ count }: { count: string }) => `${count}h ago`,
	time_days_ago: ({ count }: { count: string }) => `${count}d ago`
}));

vi.mock('$lib/format-time', () => ({
	formatTimeRemaining: (seconds: number) => `in ${Math.round(seconds / 86400)} days`,
	remainingSeconds: (_expiresAt: Date | string) => 86400
}));

// Svelte 5 no-op components: inline functions so hoisted vi.mock() factories can use them.
vi.mock('$lib/components/ui/card', () => ({ Card: () => {} }));
vi.mock('$lib/components/ui/nav-menu', () => ({ NavMenu: () => {} }));
vi.mock('@lucide/svelte/icons/arrow-up', () => ({ default: () => {} }));
vi.mock('@lucide/svelte/icons/arrow-down', () => ({ default: () => {} }));
vi.mock('@lucide/svelte/icons/scan-line', () => ({ default: () => {} }));
vi.mock('@lucide/svelte/icons/x', () => ({ default: () => {} }));

import HomePage from './+page.svelte';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockData = {
	appUser: { displayName: 'Test User' },
	formattedBalance: '€0.00',
	balance: 0,
	recentTransactions: [],
	pendingItems: []
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('home page – SSE-driven invalidateAll()', () => {
	beforeEach(() => {
		onSpy.mockClear();
		cleanupSpy.mockClear();
	});

	it('registers SSE handlers on mount', () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		render(HomePage, { props: { data: mockData as any } });

		expect(onSpy).toHaveBeenCalledOnce();
		const handlers = onSpy.mock.calls[0][0];
		expect(typeof handlers.onQrCompleted).toBe('function');
		expect(typeof handlers.onQrDeclined).toBe('function');
	});

	it('calls invalidateAll when qr_completed fires', async () => {
		const { invalidateAll } = await import('$app/navigation');
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		render(HomePage, { props: { data: mockData as any } });

		const handlers = onSpy.mock.calls[0][0];
		handlers.onQrCompleted!({
			type: 'qr_completed',
			id: 'evt-1',
			qrId: 'qr-1',
			otherName: 'Alice',
			formattedAmount: '€10.00'
		});

		expect(invalidateAll).toHaveBeenCalled();
	});

	it('calls invalidateAll when qr_declined fires', async () => {
		const { invalidateAll } = await import('$app/navigation');
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		render(HomePage, { props: { data: mockData as any } });

		const handlers = onSpy.mock.calls[0][0];
		handlers.onQrDeclined!({ type: 'qr_declined', id: 'evt-2', qrId: 'qr-1' });

		expect(invalidateAll).toHaveBeenCalled();
	});

	it('cleans up SSE handler on unmount', () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		render(HomePage, { props: { data: mockData as any } });
		expect(cleanupSpy).not.toHaveBeenCalled();
		cleanup();
		expect(cleanupSpy).toHaveBeenCalled();
	});
});

// Review fix (PR #137 follow-up): a reusable QR can now have a real,
// non-null `expiresAt` (previously always null). The active (non-paused,
// non-expired) reusable branch rendered no expiry at all, unlike the
// one-time branch's `qr_expires` countdown right next to it — fixed to show
// the same countdown, and nothing when `expiresAt` is null ("never").
describe('home page – pending reusable QR expiry display', () => {
	function makeReusableItem(overrides: Record<string, unknown> = {}) {
		return {
			id: 'rpr-1',
			direction: 'receive',
			formattedAmount: null,
			note: null,
			reusable: true,
			status: 'active',
			isPaused: false,
			isExpired: false,
			paymentCount: 2,
			totalReceived: 0,
			createdAt: new Date(),
			expiresAt: null,
			...overrides
		};
	}

	it('Given an active reusable QR with a non-null expiresAt → shows the qr_expires countdown', () => {
		const data = {
			...mockData,
			pendingItems: [makeReusableItem({ expiresAt: new Date(Date.now() + 86_400_000) })]
		};

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const { getByText } = render(HomePage, { props: { data: data as any } });

		expect(getByText(/Expires in 1 days/)).toBeTruthy();
	});

	it('Given an active reusable QR with expiresAt: null ("never") → shows no expiry text', () => {
		const data = {
			...mockData,
			pendingItems: [makeReusableItem({ expiresAt: null })]
		};

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const { queryByText } = render(HomePage, { props: { data: data as any } });

		expect(queryByText(/Expires/)).toBeNull();
	});
});
