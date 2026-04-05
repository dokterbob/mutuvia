// SPDX-License-Identifier: AGPL-3.0-or-later
// Tests for loading spinner wiring on the onboarding phone page.

import { vi, describe, test, expect, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import PhonePage from './+page.svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

vi.mock('$lib/auth-client', () => ({
	authClient: {
		phoneNumber: {
			sendOtp: vi.fn()
		}
	}
}));

// Replace PhoneInput with a mock that immediately provides a valid phone number
// via the Svelte 5 bindable callbacks, bypassing the real svelte-tel-input.
vi.mock('$lib/components/ui/phone-input', async () => {
	const { default: PhoneInputMock } = await import('./__mocks__/PhoneInputMock.svelte');
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return { PhoneInput: PhoneInputMock as any };
});

vi.mock('$lib/paraglide/messages.js', () => ({
	phone_eyebrow: () => 'Phone',
	phone_title: () => 'Enter your phone number',
	phone_body: () => "We'll send you a code",
	phone_label: () => 'Phone number',
	phone_hint: () => 'Include country code',
	phone_cta: () => 'Send code',
	phone_back: () => 'Back',
	phone_or: () => 'or',
	phone_email_fallback: () => 'Use email instead',
	error_send_code: () => 'Failed to send code'
}));

describe('phone page – loading spinner', () => {
	let sendOtpMock: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		const { authClient } = await import('$lib/auth-client');
		sendOtpMock = vi.mocked(authClient.phoneNumber.sendOtp);
	});

	test('submit button shows spinner while sending OTP', async () => {
		sendOtpMock.mockReturnValue(new Promise(() => {}));

		const { container } = render(PhonePage);

		// Wait for PhoneInputMock's onMount to fire, setting phoneValue and valid=true
		const form = container.querySelector('form');
		expect(form).not.toBeNull();
		await fireEvent.submit(form!);

		await waitFor(() => {
			const submitButton = container.querySelector('form button[type="submit"]');
			expect(submitButton).not.toBeNull();
			expect(submitButton).toBeDisabled();
			expect(submitButton!.querySelector('.animate-spin')).not.toBeNull();
		});
	});

	test('submit button clears spinner after OTP sent', async () => {
		sendOtpMock.mockResolvedValue({ error: null } as never);

		const { container } = render(PhonePage);

		const form = container.querySelector('form');
		expect(form).not.toBeNull();
		await fireEvent.submit(form!);

		await waitFor(() => {
			const submitButton = container.querySelector('form button[type="submit"]');
			expect(submitButton).not.toBeNull();
			// After sendOtp resolves successfully, isLoading=false and valid=true
			// so the button should no longer be disabled
			expect(submitButton).not.toBeDisabled();
			expect(submitButton!.querySelector('.animate-spin')).toBeNull();
		});
	});

	test('submit button clears spinner on error', async () => {
		sendOtpMock.mockResolvedValue({
			error: { message: 'Too many attempts' }
		} as never);

		const { container } = render(PhonePage);

		const form = container.querySelector('form');
		expect(form).not.toBeNull();
		await fireEvent.submit(form!);

		await waitFor(() => {
			const submitButton = container.querySelector('form button[type="submit"]');
			expect(submitButton).not.toBeNull();
			expect(submitButton!.querySelector('.animate-spin')).toBeNull();
			expect(container.textContent).toContain('Too many attempts');
		});
	});
});
