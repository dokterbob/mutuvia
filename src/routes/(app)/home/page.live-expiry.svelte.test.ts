// SPDX-License-Identifier: AGPL-3.0-or-later
// Live countdown on the Home pending list (user-testing feedback on #141):
// rows tick off the shared `now` clock and flip to "Expired" once the
// countdown reaches 0, without a reload. Unlike page.svelte.test.ts, this
// file does NOT mock $lib/format-time — it runs the real formatter.

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';

vi.mock('$lib/sse-client', () => ({ sseManager: { on: vi.fn().mockReturnValue(vi.fn()) } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidateAll: vi.fn() }));
vi.mock('$app/forms', () => ({ enhance: vi.fn().mockReturnValue({ destroy: vi.fn() }) }));
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
vi.mock('$lib/components/ui/card', () => ({ Card: () => {} }));
vi.mock('$lib/components/ui/nav-menu', () => ({ NavMenu: () => {} }));
vi.mock('@lucide/svelte/icons/arrow-up', () => ({ default: () => {} }));
vi.mock('@lucide/svelte/icons/arrow-down', () => ({ default: () => {} }));
vi.mock('@lucide/svelte/icons/scan-line', () => ({ default: () => {} }));
vi.mock('@lucide/svelte/icons/chevron-right', () => ({ default: () => {} }));

import HomePage from './+page.svelte';

const T0 = new Date('2026-06-01T12:00:00Z').getTime();

function makeData(item: Record<string, unknown>) {
	return {
		appUser: { displayName: 'Test User' },
		formattedBalance: '€0.00',
		balance: 0,
		recentTransactions: [],
		pendingItems: [
			{
				id: 'pr-1',
				direction: 'send',
				formattedAmount: '€5.00',
				note: null,
				reusable: false,
				status: 'pending',
				isPaused: false,
				isExpired: false,
				paymentCount: 0,
				totalReceived: 0,
				createdAt: new Date(T0),
				expiresAt: null,
				...item
			}
		]
	};
}

async function advance(ms: number) {
	await vi.advanceTimersByTimeAsync(ms);
	await tick();
}

describe('home page – live pending-QR countdown', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(T0);
	});
	afterEach(() => {
		cleanup();
		vi.useRealTimers();
	});

	describe('given a one-time QR expiring in 90 s', () => {
		it('when time passes, then the countdown ticks and the row flips to "Expired" without a reload', async () => {
			const data = makeData({ expiresAt: new Date(T0 + 90_000) });
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const { getByText, queryByText } = render(HomePage, { props: { data: data as any } });

			expect(getByText('Expires in 1 minute')).toBeTruthy();

			await advance(31_000);
			expect(getByText('Expires in 59 seconds')).toBeTruthy();

			await advance(58_000);
			expect(getByText('Expires in 1 second')).toBeTruthy();
			expect(queryByText('Expired')).toBeNull();

			await advance(1_000);
			expect(getByText('Expired')).toBeTruthy();
			expect(queryByText(/Expires in/)).toBeNull();
		});
	});

	describe('given a reusable QR with an expiry', () => {
		it('when its expiry passes, then the row flips to "Expired"', async () => {
			const data = makeData({
				reusable: true,
				status: 'active',
				direction: 'receive',
				expiresAt: new Date(T0 + 5_000)
			});
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const { getByText, queryByText } = render(HomePage, { props: { data: data as any } });

			expect(getByText('Expires in 5 seconds')).toBeTruthy();
			await advance(5_000);
			expect(getByText('Expired')).toBeTruthy();
			expect(queryByText('Reusable')).toBeNull();
		});
	});

	describe('given a QR that never expires', () => {
		it('when time passes, then no countdown is shown and it never flips to "Expired"', async () => {
			const data = makeData({ reusable: true, status: 'active', expiresAt: null });
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const { queryByText } = render(HomePage, { props: { data: data as any } });

			await advance(10_000);
			expect(queryByText(/Expires/)).toBeNull();
		});
	});
});
