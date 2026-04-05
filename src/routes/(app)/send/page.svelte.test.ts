// SPDX-License-Identifier: AGPL-3.0-or-later
// Regression test for issue #56: share/copy text shows wrong amount after QR generation.
// Root cause: use:enhance default behavior resets the form on success, clearing bound amount/note state.
// Fix: pass { reset: false } to update() in the enhance callback.

import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/svelte';
import SendPage from './+page.svelte';

vi.mock('$app/forms', () => ({
	enhance: vi.fn().mockReturnValue({ destroy: vi.fn() })
}));
vi.mock('$lib/push-subscribe', () => ({ subscribeToPush: vi.fn().mockResolvedValue(false) }));
vi.mock('$lib/sse-client', () => ({ sseManager: { on: vi.fn().mockReturnValue(vi.fn()) } }));
vi.mock('$lib/format-time', () => ({
	formatTimeRemaining: () => 'in 10 minutes',
	remainingSeconds: () => 600
}));
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
	send_done: () => 'Done'
}));

const mockData = {
	unitCode: 'EUR',
	appName: 'Mutuvia',
	needsConsent: false,
	qrTtlSeconds: 600,
	resumeQr: null
};

describe('send page – issue #56: share text amount', () => {
	let enhanceMock: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		const formsModule = await import('$app/forms');
		enhanceMock = vi.mocked(formsModule.enhance);
		enhanceMock.mockClear();
		enhanceMock.mockReturnValue({ destroy: vi.fn() });
	});

	test('amount is preserved after createQr form submission (regression: issue #56)', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const { getByRole } = render(SendPage, { props: { data: mockData as any, form: null } });

		// Fill in the amount
		const amountInput = getByRole('spinbutton'); // type="number"
		await fireEvent.input(amountInput, { target: { value: '100' } });
		expect(amountInput).toHaveValue(100); // sanity check

		// The enhance action should have been registered for the createQr form
		expect(enhanceMock).toHaveBeenCalled();
		const [formElement, submitCallback] = enhanceMock.mock.calls[0] as [
			HTMLFormElement,
			((...args: unknown[]) => unknown) | undefined
		];

		// Simulate SvelteKit's use:enhance lifecycle on a successful action.
		// By default (no `{ reset: false }`), SvelteKit calls form.reset() after update().
		// The fix supplies a callback that passes `{ reset: false }` to prevent this.
		const updateMock = vi.fn().mockImplementation(async (opts?: { reset?: boolean }) => {
			if (opts?.reset !== false) {
				// Default SvelteKit behavior: reset the form, clearing bound inputs
				formElement.reset();
			}
		});

		if (submitCallback) {
			// Component provides a custom enhance callback — invoke the full chain
			const innerHandler = submitCallback({
				action: new URL('http://localhost/?/createQr'),
				formData: new FormData(),
				formElement,
				controller: new AbortController(),
				submitter: null,
				cancel: vi.fn()
			});
			if (innerHandler && typeof innerHandler === 'function') {
				await (innerHandler as (opts: unknown) => Promise<void>)({
					update: updateMock,
					formData: new FormData(),
					formElement,
					action: new URL('http://localhost/?/createQr'),
					result: { type: 'success', status: 200, data: {} },
					applyAction: vi.fn()
				});
			}
		} else {
			// No custom callback: default use:enhance resets the form on success
			formElement.reset();
		}

		// After form submission, the amount should still reflect what the user entered.
		// Without the fix, the form reset clears the bound `amount` state → 0.
		expect(amountInput).toHaveValue(100);
	});
});

describe('send page – spinner / loading state', () => {
	let enhanceMock: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		const formsModule = await import('$app/forms');
		enhanceMock = vi.mocked(formsModule.enhance);
		enhanceMock.mockClear();
		enhanceMock.mockReturnValue({ destroy: vi.fn() });
	});

	test('createQr submit button is disabled with spinner while form is submitting', async () => {
		// mockData has needsConsent: false, so the amount step renders directly.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const { container } = render(SendPage, { props: { data: mockData as any, form: null } });

		// Fill in an amount so the submit button isn't disabled by the empty-amount guard.
		const amountInput = container.querySelector('input[type="number"]') as HTMLInputElement;
		await fireEvent.input(amountInput, { target: { value: '42' } });

		// enhance is called for the createQr form.
		expect(enhanceMock).toHaveBeenCalled();
		const [formElement, submitCallback] = enhanceMock.mock.calls[0] as [
			HTMLFormElement,
			((...args: unknown[]) => unknown) | undefined
		];

		// Invoke the outer enhance callback (simulates SvelteKit calling it on submit).
		// This should set createQrLoading = true, disabling the button and showing the spinner.
		let innerHandler: ((opts: unknown) => Promise<void>) | undefined;
		if (submitCallback) {
			const result = submitCallback({
				action: new URL('http://localhost/?/createQr'),
				formData: new FormData(),
				formElement,
				controller: new AbortController(),
				submitter: null,
				cancel: vi.fn()
			});
			if (result && typeof result === 'function') {
				innerHandler = result as (opts: unknown) => Promise<void>;
			}
		}

		// At this point (outer callback fired, inner async handler not yet run),
		// loading should be true: button disabled and spinner visible.
		const submitBtn = container.querySelector('button[type="submit"]');
		expect(submitBtn).toBeDisabled();
		expect(container.querySelector('.animate-spin')).not.toBeNull();

		// Complete the submission by running the inner handler.
		const updateMock = vi.fn().mockResolvedValue(undefined);
		if (innerHandler) {
			await innerHandler({
				update: updateMock,
				formData: new FormData(),
				formElement,
				action: new URL('http://localhost/?/createQr'),
				result: { type: 'success', status: 200, data: {} },
				applyAction: vi.fn()
			});
		}

		// After the inner handler resolves, loading should be false: spinner gone.
		await waitFor(() => {
			expect(container.querySelector('.animate-spin')).toBeNull();
		});
	});
});

describe('send page – resume from pending list (#86)', () => {
	afterEach(() => cleanup());

	test('jumps to QR step when resumeQr is provided', async () => {
		const data = {
			...mockData,
			resumeQr: {
				qrUrl: 'http://localhost/accept/test-token',
				qrId: 'qr-resume-1',
				expiresAt: new Date(Date.now() + 600_000).toISOString(),
				isExpired: false
			}
		};
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const { getByText } = render(SendPage, { props: { data: data as any, form: null } });
		await waitFor(() => {
			expect(getByText('Scan to accept')).toBeTruthy();
		});
	});

	test('shows expired state when resumeQr.isExpired is true', async () => {
		const data = {
			...mockData,
			resumeQr: {
				qrUrl: '',
				qrId: 'qr-expired-1',
				expiresAt: new Date(Date.now() - 1000).toISOString(),
				isExpired: true
			}
		};
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const { getByText } = render(SendPage, { props: { data: data as any, form: null } });
		await waitFor(() => {
			expect(getByText('Expired')).toBeTruthy();
		});
	});
});
