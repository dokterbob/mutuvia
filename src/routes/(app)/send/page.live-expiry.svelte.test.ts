// SPDX-License-Identifier: AGPL-3.0-or-later
// Live countdown on the Send QR step: the shared `now` clock is read through a
// $derived here (unlike Home, which reads it in the template), so pin that it
// ticks and flips to the expired state without a reload. Runs the real
// $lib/format-time (not mocked).

import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import SendPage from './+page.svelte';

vi.mock('$app/forms', () => ({
	enhance: vi.fn().mockReturnValue({ destroy: vi.fn() })
}));
vi.mock('$lib/push-subscribe', () => ({ subscribeToPush: vi.fn().mockResolvedValue(false) }));
vi.mock('$lib/sse-client', () => ({ sseManager: { on: vi.fn().mockReturnValue(vi.fn()) } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/environment', () => ({ browser: false }));
vi.mock('qrcode', () => ({
	default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,test') }
}));
vi.mock('$lib/paraglide/runtime', () => ({
	getLocale: () => 'en'
}));
vi.mock('$lib/paraglide/messages.js', () => ({
	home_send: () => 'Send',
	send_amount_label: () => 'Amount',
	send_note_placeholder: () => 'Add a note',
	send_cta: () => 'Generate QR',
	consent_back: () => 'Back',
	qr_copy_link: () => 'Copy link',
	qr_share: () => 'Share',
	qr_expires: ({ time }: { time: string }) => `Expires ${time}`,
	qr_close: () => 'Close',
	send_qr_caption: () => 'Scan to accept',
	send_qr_expired: () => 'Expired',
	send_cancel: () => 'Cancel',
	send_back_home: () => 'Back home',
	send_declined: () => 'Declined',
	send_done: () => 'Done',
	qr_expiry_label: () => 'Expires',
	qr_expiry_1h: () => '1 hour',
	qr_expiry_1d: () => '1 day',
	qr_expiry_3d: () => '3 days',
	qr_expiry_1w: () => '1 week',
	qr_expiry_30d: () => '30 days',
	qr_expiry_never: () => 'Never',
	advanced_options: () => 'Advanced options'
}));

const T0 = new Date('2026-06-01T12:00:00Z').getTime();

async function advance(ms: number) {
	await vi.advanceTimersByTimeAsync(ms);
	await tick();
}

describe('send page – live QR countdown', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(T0);
	});
	afterEach(() => {
		cleanup();
		vi.useRealTimers();
	});

	test('given a resumed QR expiring in 90 s, when time passes, then the countdown ticks and flips to expired', async () => {
		const data = {
			unitCode: 'EUR',
			appName: 'Mutuvia',
			needsConsent: false,
			expiryOptions: [{ key: '3d', seconds: 259_200, isDefault: true }],
			resumeQr: {
				qrUrl: 'http://localhost/accept/t',
				qrId: 'qr-1',
				expiresAt: new Date(T0 + 90_000).toISOString(),
				isExpired: false
			}
		};
		const { findByText, getByText } = render(SendPage, {
			props: { data: data as never, form: null }
		});

		expect(await findByText('Expires in 1 minute')).toBeTruthy();
		await advance(31_000);
		expect(getByText('Expires in 59 seconds')).toBeTruthy();
		await advance(59_000);
		expect(getByText('Expired')).toBeTruthy();
	});
});
