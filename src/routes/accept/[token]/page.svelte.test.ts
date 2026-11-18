// SPDX-License-Identifier: AGPL-3.0-or-later
// Tests for loading spinner and loading-state wiring on the accept page.

import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/svelte';
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
	accept_signed_out_send_cta: ({ amount, name }: { amount: string; name: string }) =>
		`Accept ${amount} from ${name}`,
	accept_signed_out_send_helper: () => "It's added right after.",
	accept_signed_out_receive_cta: () => 'Sign in to review',
	accept_signed_out_receive_helper: () => "You'll confirm before anything is paid.",
	accept_resume_banner: ({ name }: { name: string }) => `Signed in as ${name} · Last step`,
	accept_finishing: () => 'Finishing…',
	accept_pay_cta: ({ name, amount }: { name: string; amount: string }) => `Pay ${name} ${amount}`,
	accept_self_qr: () => 'This is your own QR, so nothing happened.',
	accept_expired_during_onboarding: ({ name }: { name: string }) =>
		`This QR from ${name} expired before you finished.`,
	send_back_home: () => 'Back home',
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

const mockAuthReceiveData = {
	expired: false,
	needsAuth: false,
	direction: 'receive' as const,
	initiatorName: 'Alice',
	formattedAmount: '€10.00',
	initiatorBalance: null,
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

	test('[security] renders no decline form at all — the server action now 401s unauthenticated callers', () => {
		const { container } = render(AcceptPage, {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			props: { data: mockUnauthData as any, form: null }
		});

		expect(container.querySelector('form[action="?/decline"]')).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Balance display — only for direction 'send', never 'receive'
// ---------------------------------------------------------------------------

describe('accept page – initiator balance [security]', () => {
	test('direction "send": renders the balance label', () => {
		const { getByText } = render(AcceptPage, {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			props: { data: mockAuthData as any, form: null }
		});

		expect(getByText('Alice balance: €50.00')).toBeTruthy();
	});

	test('[security] direction "receive": never renders the balance label, even if present in data', () => {
		const { container, queryByText } = render(AcceptPage, {
			// A malformed/future server response could theoretically still set
			// initiatorBalance for a 'receive' QR — the template's own `direction
			// === 'send'` guard must suppress it regardless of what load() sends.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			props: { data: { ...mockAuthReceiveData, initiatorBalance: '€50.00' } as any, form: null }
		});

		expect(queryByText(/balance/i)).toBeNull();
		expect(container.textContent).not.toContain('€50.00');
	});
});

// ---------------------------------------------------------------------------
// Signed-out CTAs and post-sign-in acceptance (user-testing feedback on #141)
// ---------------------------------------------------------------------------

describe('accept page – signed-out view says what happens next', () => {
	afterEach(() => cleanup());

	test('Given incoming credit (send), Then the CTA names the amount and sender, with "added right after" helper', () => {
		const { getByText } = render(AcceptPage, {
			props: { data: mockUnauthData as never, form: null }
		});

		expect(getByText('Accept €10.00 from Alice')).toBeTruthy();
		expect(getByText("It's added right after.")).toBeTruthy();
	});

	test('Given a payment request (receive), Then the CTA is "Sign in to review", promising a confirm step', () => {
		const data = { ...mockUnauthData, direction: 'receive' as const };

		const { getByText, queryByText } = render(AcceptPage, {
			props: { data: data as never, form: null }
		});

		expect(getByText('Sign in to review')).toBeTruthy();
		expect(getByText("You'll confirm before anything is paid.")).toBeTruthy();
		expect(queryByText(/^Accept €/)).toBeNull();
	});

	test.each(['send', 'receive'] as const)(
		'Given direction %s, Then the balance impact and the "not real money" notice show before sign-in',
		(direction) => {
			const data = { ...mockUnauthData, direction };
			const { getByText } = render(AcceptPage, { props: { data: data as never, form: null } });

			expect(
				getByText(direction === 'send' ? 'Alice will send €10.00' : 'Alice will receive €10.00')
			).toBeTruthy();
			expect(getByText('First time connecting')).toBeTruthy();
		}
	);
});

describe('accept page – after signing in', () => {
	let requestSubmitSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		requestSubmitSpy = vi
			.spyOn(HTMLFormElement.prototype, 'requestSubmit')
			.mockImplementation(() => {});
	});
	afterEach(() => {
		cleanup();
		requestSubmitSpy.mockRestore();
	});

	test('Given autoAccept, When mounted → submits the accept form exactly once and shows "Finishing…"', async () => {
		const data = { ...mockAuthData, resumed: true, autoAccept: true, viewerName: 'Bob' };
		const { getByText } = render(AcceptPage, { props: { data: data as never, form: null } });

		await waitFor(() => expect(requestSubmitSpy).toHaveBeenCalledTimes(1));
		const submitted = requestSubmitSpy.mock.instances[0] as unknown as HTMLFormElement;
		expect(submitted.getAttribute('action')).toBe('?/accept');
		expect(getByText('Finishing…')).toBeTruthy();
		expect(getByText('Signed in as Bob · Last step')).toBeTruthy();
	});

	test('Given no autoAccept, When mounted → never submits on its own', async () => {
		const data = { ...mockAuthData, resumed: true, autoAccept: false, viewerName: 'Bob' };
		const { queryByText } = render(AcceptPage, { props: { data: data as never, form: null } });

		await new Promise((r) => setTimeout(r, 20));
		expect(requestSubmitSpy).not.toHaveBeenCalled();
		expect(queryByText('Finishing…')).toBeNull();
	});

	test('Given autoAccept but the settlement failed, Then the error shows and "Finishing…" is gone', async () => {
		const data = { ...mockAuthData, resumed: true, autoAccept: true, viewerName: 'Bob' };
		const { getByText, queryByText } = render(AcceptPage, {
			props: {
				data: data as never,
				form: { error: 'This QR code has expired or already been used.' }
			}
		});

		expect(getByText('This QR code has expired or already been used.')).toBeTruthy();
		expect(queryByText('Finishing…')).toBeNull();
	});

	test('Given a resumed payment request (receive), Then it shows the banner and a "Pay {name} {amount}" button plus Decline', () => {
		const data = { ...mockAuthReceiveData, resumed: true, autoAccept: false, viewerName: 'Bob' };

		const { getByText, getByRole } = render(AcceptPage, {
			props: { data: data as never, form: null }
		});

		expect(getByText('Signed in as Bob · Last step')).toBeTruthy();
		expect(getByRole('button', { name: /Pay Alice €10.00/ })).toBeTruthy();
		expect(getByRole('button', { name: /Decline/ })).toBeTruthy();
		expect(requestSubmitSpy).not.toHaveBeenCalled();
	});

	test('Given selfAccept, Then it says nothing happened instead of "expired"', () => {
		const data = { expired: false, selfAccept: true, initiatorName: 'Alice' };

		const { getByText, queryByText } = render(AcceptPage, {
			props: { data: data as never, form: null }
		});

		expect(getByText('This is your own QR, so nothing happened.')).toBeTruthy();
		expect(queryByText('QR expired')).toBeNull();
	});

	test('Given expiredDuringOnboarding, Then it names the creator instead of a generic invalid link', () => {
		const data = {
			expired: true,
			expiredDuringOnboarding: true,
			initiatorName: 'Alice',
			error: 'This link has expired or is invalid.'
		};

		const { getByText, queryByText } = render(AcceptPage, {
			props: { data: data as never, form: null }
		});

		expect(getByText('This QR from Alice expired before you finished.')).toBeTruthy();
		expect(queryByText('QR expired')).toBeNull();
	});
});
