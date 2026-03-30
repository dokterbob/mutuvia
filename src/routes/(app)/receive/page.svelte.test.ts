// SPDX-License-Identifier: AGPL-3.0-or-later
// Regression test for issue #56: share/copy text shows wrong amount after QR generation.
// Root cause: use:enhance default behavior resets the form on success, clearing bound amount/note state.
// Fix: pass { reset: false } to update() in the enhance callback.

import { vi, describe, test, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import ReceivePage from './+page.svelte';

vi.mock('$app/forms', () => ({
	enhance: vi.fn().mockReturnValue({ destroy: vi.fn() })
}));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/environment', () => ({ browser: false }));
vi.mock('qrcode', () => ({
	default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,test') }
}));
vi.mock('$lib/paraglide/messages.js', () => ({
	home_receive: () => 'Receive',
	receive_helper: () => 'Ask someone to scan this code.',
	send_amount_label: () => 'Amount',
	receive_note_placeholder: () => 'Add a note',
	receive_cta: () => 'Generate QR',
	consent_back: () => 'Back',
	qr_share_text: ({ amount, appName }: { amount: string; appName: string }) =>
		`${amount} of credit through ${appName}.`,
	qr_share_text_with_note: ({
		amount,
		note,
		appName
	}: {
		amount: string;
		note: string;
		appName: string;
	}) => `${amount} for "${note}" through ${appName}.`,
	qr_copy_link: () => 'Copy link',
	qr_share: () => 'Share',
	receive_qr_caption: () => 'Scan to pay',
	send_qr_expired: () => 'Expired',
	send_cancel: () => 'Cancel',
	receive_back_home: () => 'Back home',
	receive_declined: () => 'Declined',
	receive_done: () => 'Done'
}));

const mockData = {
	unitSymbol: '€',
	decimalPlaces: 2,
	appName: 'Mutuvia',
	qrTtlSeconds: 600
};

describe('receive page – issue #56: share text amount', () => {
	let enhanceMock: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		const formsModule = await import('$app/forms');
		enhanceMock = vi.mocked(formsModule.enhance);
		enhanceMock.mockClear();
		enhanceMock.mockReturnValue({ destroy: vi.fn() });
	});

	test('amount is preserved after createQr form submission (regression: issue #56)', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const { getByRole } = render(ReceivePage, { props: { data: mockData as any, form: null } });

		// Fill in the amount
		const amountInput = getByRole('spinbutton'); // type="number"
		await fireEvent.input(amountInput, { target: { value: '50' } });
		expect(amountInput).toHaveValue(50); // sanity check

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
		expect(amountInput).toHaveValue(50);
	});
});
