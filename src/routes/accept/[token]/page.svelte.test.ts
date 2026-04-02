// SPDX-License-Identifier: AGPL-3.0-or-later
// Tests for loading spinner and loading-state wiring on the accept page.

import { vi, describe, test, expect, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import AcceptPage from './+page.svelte';

vi.mock('$app/forms', () => ({
	enhance: vi.fn().mockReturnValue({ destroy: vi.fn() })
}));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/state', () => ({
	page: { url: { href: 'http://localhost/accept/test-token' } }
}));
vi.mock('$env/dynamic/public', () => ({
	env: { PUBLIC_APP_NAME: 'Mutuvia' }
}));
vi.mock('$lib/paraglide/messages.js', () => ({
	og_expired_title: () => 'Expired',
	og_send_title: ({ amount }: { amount: string }) => `Send ${amount}`,
	og_receive_title: ({ amount }: { amount: string }) => `Receive ${amount}`,
	og_description: () => 'Mutuvia transaction',
	accept_send_prompt: ({ name, amount }: { name: string; amount: string }) =>
		`${name} wants to send ${amount}`,
	accept_receive_prompt: ({ name, amount }: { name: string; amount: string }) =>
		`${name} wants to receive ${amount}`,
	accept_sign_in_required: () => 'Sign in to continue',
	accept_fast_cta: () => 'Quick sign in',
	accept_full_onboarding_cta: () => 'Create account',
	accept_decline: () => 'Decline',
	accept_balance_label: ({ name, balance }: { name: string; balance: string }) =>
		`${name} balance: ${balance}`,
	accept_send_balance_impact: ({ name, amount }: { name: string; amount: string }) =>
		`${name} will send ${amount}`,
	accept_receive_balance_impact: ({ name, amount }: { name: string; amount: string }) =>
		`${name} will receive ${amount}`,
	accept_first_time_notice: () => 'First time connecting',
	accept_cta: () => 'Accept',
	accept_expired: () => 'QR expired'
}));

const mockAuthData = {
	expired: false,
	needsAuth: false,
	direction: 'send' as const,
	initiatorName: 'Alice',
	formattedAmount: '€10.00',
	initiatorBalance: '€50.00',
	qrId: 'test-qr-id',
	note: null
};

const mockUnauthData = {
	expired: false,
	needsAuth: true,
	direction: 'send' as const,
	initiatorName: 'Alice',
	formattedAmount: '€10.00',
	qrId: 'test-qr-id',
	note: null
};

// ---------------------------------------------------------------------------
// Authenticated view
// ---------------------------------------------------------------------------

describe('accept page – authenticated view: spinner / loading state', () => {
	let enhanceMock: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		const formsModule = await import('$app/forms');
		enhanceMock = vi.mocked(formsModule.enhance);
		enhanceMock.mockClear();
		enhanceMock.mockReturnValue({ destroy: vi.fn() });
	});

	test('accept button shows spinner during submission', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const { container } = render(AcceptPage, { props: { data: mockAuthData as any, form: null } });

		// Find the enhance call whose form element has action="?/accept"
		const acceptCall = enhanceMock.mock.calls.find(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			([formEl]: any[]) => (formEl as HTMLFormElement).getAttribute('action') === '?/accept'
		) as [HTMLFormElement, ((...args: unknown[]) => unknown) | undefined] | undefined;

		expect(acceptCall).toBeDefined();
		const [, submitCallback] = acceptCall!;

		// Invoke the outer callback (simulate submission starting — no inner handler
		// returned here, which matches a redirect-only success path).
		if (submitCallback) {
			submitCallback({
				action: new URL('http://localhost/?/accept'),
				formData: new FormData(),
				formElement: acceptCall![0],
				controller: new AbortController(),
				submitter: null,
				cancel: vi.fn()
			});
		}

		// After the outer callback fires the accept button must be disabled and show spinner.
		const acceptButton = container.querySelector('form[action="?/accept"] button[type="submit"]');
		expect(acceptButton).not.toBeNull();
		await waitFor(() => {
			expect(acceptButton).toBeDisabled();
			expect(container.querySelector('.animate-spin')).not.toBeNull();
		});
	});

	test('accept button resets loading state on failure (expired QR)', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const { container } = render(AcceptPage, { props: { data: mockAuthData as any, form: null } });

		const acceptCall = enhanceMock.mock.calls.find(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			([formEl]: any[]) => (formEl as HTMLFormElement).getAttribute('action') === '?/accept'
		) as [HTMLFormElement, ((...args: unknown[]) => unknown) | undefined] | undefined;

		expect(acceptCall).toBeDefined();
		const [, submitCallback] = acceptCall!;

		let innerHandler: unknown;
		if (submitCallback) {
			innerHandler = submitCallback({
				action: new URL('http://localhost/?/accept'),
				formData: new FormData(),
				formElement: acceptCall![0],
				controller: new AbortController(),
				submitter: null,
				cancel: vi.fn()
			});
		}

		// Invoke inner handler with a failure result (QR expired).
		if (innerHandler && typeof innerHandler === 'function') {
			await (innerHandler as (opts: unknown) => Promise<void>)({
				update: vi.fn().mockResolvedValue(undefined),
				formData: new FormData(),
				formElement: acceptCall![0],
				action: new URL('http://localhost/?/accept'),
				result: { type: 'failure', status: 400, data: { error: 'QR expired' } },
				applyAction: vi.fn().mockResolvedValue(undefined)
			});
		}

		// After failure, loading state must be reset.
		const acceptButton = container.querySelector('form[action="?/accept"] button[type="submit"]');
		expect(acceptButton).not.toBeNull();
		await waitFor(() => {
			expect(acceptButton).not.toBeDisabled();
			expect(container.querySelector('.animate-spin')).toBeNull();
		});
	});

	test('decline button shows spinner during submission (authenticated)', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const { container } = render(AcceptPage, { props: { data: mockAuthData as any, form: null } });

		// In the authenticated view there are two forms: accept and decline.
		// Find the decline form's enhance call.
		const declineCall = enhanceMock.mock.calls.find(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			([formEl]: any[]) => (formEl as HTMLFormElement).getAttribute('action') === '?/decline'
		) as [HTMLFormElement, ((...args: unknown[]) => unknown) | undefined] | undefined;

		expect(declineCall).toBeDefined();
		const [, submitCallback] = declineCall!;

		if (submitCallback) {
			submitCallback({
				action: new URL('http://localhost/?/decline'),
				formData: new FormData(),
				formElement: declineCall![0],
				controller: new AbortController(),
				submitter: null,
				cancel: vi.fn()
			});
		}

		const declineButton = container.querySelector('form[action="?/decline"] button[type="submit"]');
		expect(declineButton).not.toBeNull();
		await waitFor(() => {
			expect(declineButton).toBeDisabled();
			expect(container.querySelector('.animate-spin')).not.toBeNull();
		});
	});
});

// ---------------------------------------------------------------------------
// Unauthenticated view
// ---------------------------------------------------------------------------

describe('accept page – unauthenticated view: spinner / loading state', () => {
	let enhanceMock: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		const formsModule = await import('$app/forms');
		enhanceMock = vi.mocked(formsModule.enhance);
		enhanceMock.mockClear();
		enhanceMock.mockReturnValue({ destroy: vi.fn() });
	});

	test('fast track button shows spinner on submit', async () => {
		const { container } = render(AcceptPage, {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			props: { data: mockUnauthData as any, form: null }
		});

		const fastTrackCall = enhanceMock.mock.calls.find(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			([formEl]: any[]) => (formEl as HTMLFormElement).getAttribute('action') === '?/startFastTrack'
		) as [HTMLFormElement, ((...args: unknown[]) => unknown) | undefined] | undefined;

		expect(fastTrackCall).toBeDefined();
		const [, submitCallback] = fastTrackCall!;

		if (submitCallback) {
			submitCallback({
				action: new URL('http://localhost/?/startFastTrack'),
				formData: new FormData(),
				formElement: fastTrackCall![0],
				controller: new AbortController(),
				submitter: null,
				cancel: vi.fn()
			});
		}

		const fastTrackButton = container.querySelector(
			'form[action="?/startFastTrack"] button[type="submit"]'
		);
		expect(fastTrackButton).not.toBeNull();
		await waitFor(() => {
			expect(fastTrackButton).toBeDisabled();
			expect(container.querySelector('.animate-spin')).not.toBeNull();
		});
	});
});
