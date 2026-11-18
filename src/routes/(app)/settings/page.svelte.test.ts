// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Review fix (PR #136): the settings page's email/phone verify call sites
// (verifyEmailOtp, verifyPhoneOtp) showed Better Auth's raw English 429 text
// instead of the app's own localized "too many attempts" copy. These tests
// pin that both are routed through the shared otpVerifyErrorMessage helper.

import { vi, describe, test, expect, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import SettingsPage from './+page.svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidateAll: vi.fn() }));
vi.mock('$app/forms', () => ({ enhance: vi.fn().mockReturnValue({ destroy: vi.fn() }) }));

vi.mock('$lib/auth-client', () => ({
	authClient: {
		emailOtp: {
			requestEmailChange: vi.fn(),
			changeEmail: vi.fn()
		},
		phoneNumber: {
			sendOtp: vi.fn(),
			verify: vi.fn()
		}
	}
}));

// Same mock pattern as onboarding/phone/page.svelte.test.ts — bypasses the
// real svelte-tel-input so the phone row always has a valid, bindable value.
vi.mock('$lib/components/ui/phone-input', async () => {
	const { default: PhoneInputMock } =
		await import('../../onboarding/phone/__mocks__/PhoneInputMock.svelte');
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return { PhoneInput: PhoneInputMock as any };
});

vi.mock('$lib/paraglide/runtime.js', () => ({
	getLocale: () => 'en',
	setLocale: vi.fn(),
	locales: ['en'],
	isLocale: () => true
}));

vi.mock('$lib/paraglide/messages.js', () => ({
	locale_name: () => 'English',
	settings_title: () => 'Settings',
	settings_display_name: () => 'Display name',
	settings_language: () => 'Language',
	settings_save: () => 'Save',
	settings_saved: () => 'Saved!',
	settings_sign_in_methods: () => 'Sign-in methods',
	settings_email: () => 'Email',
	settings_phone: () => 'Phone',
	settings_not_set: () => 'Not set',
	settings_verified: () => 'Verified',
	settings_change: () => 'Change',
	settings_add_email: () => 'Add email',
	settings_add_phone: () => 'Add phone',
	settings_new_email: () => 'New email address',
	settings_send_code: () => 'Send code',
	settings_email_updated: () => 'Email updated!',
	settings_phone_updated: () => 'Phone updated!',
	settings_code_sent_to: ({ destination }: { destination: string }) =>
		`Code sent to ${destination}`,
	otp_back: () => 'Back',
	otp_invalid_code: () => 'Invalid code',
	otp_resend_prompt: () => "Didn't receive it?",
	otp_resend: () => 'Resend',
	otp_countdown: ({ seconds }: { seconds: number }) => `${seconds}s`,
	error_send_code: () => 'Failed to send code',
	error_too_many_requests: () => 'Too many attempts, please wait'
}));

const mockData = {
	appUser: { displayName: 'Test User' },
	credentials: {
		email: 'phone.placeholder@phone.placeholder',
		emailVerified: false,
		phoneNumber: null,
		phoneNumberVerified: false
	}
};

describe('settings page — verify error localization', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	test('Given a 429 on email OTP verification, when it fails, then the localized message is shown — not the raw server text', async () => {
		const { authClient } = await import('$lib/auth-client');
		vi.mocked(authClient.emailOtp.requestEmailChange).mockResolvedValue({ error: null } as never);
		vi.mocked(authClient.emailOtp.changeEmail).mockResolvedValue({
			error: { status: 429, message: 'Too many requests. Please try again later.' }
		} as never);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const { container } = render(SettingsPage, { props: { data: mockData as any, form: null } });

		const addEmailButton = Array.from(container.querySelectorAll('button')).find(
			(b) => b.textContent?.trim() === 'Add email'
		)!;
		await fireEvent.click(addEmailButton);

		const emailInput = container.querySelector('input[type="email"]')!;
		await fireEvent.input(emailInput, { target: { value: 'new@example.com' } });

		const sendButtons = Array.from(container.querySelectorAll('button')).filter(
			(b) => b.textContent?.trim() === 'Send code'
		);
		await fireEvent.click(sendButtons[0]!);

		await waitFor(() => {
			expect(container.textContent).toContain('Code sent to');
		});

		const otpInput = container.querySelector('input[inputmode="numeric"]')!;
		await fireEvent.input(otpInput, { target: { value: '123456' } });

		await waitFor(() => {
			expect(container.textContent).toContain('Too many attempts, please wait');
			expect(container.textContent).not.toContain('Too many requests. Please try again later.');
		});
	});

	test('Given a 429 on phone OTP verification, when it fails, then the localized message is shown — not the raw server text', async () => {
		const { authClient } = await import('$lib/auth-client');
		vi.mocked(authClient.phoneNumber.sendOtp).mockResolvedValue({ error: null } as never);
		vi.mocked(authClient.phoneNumber.verify).mockResolvedValue({
			error: { status: 429, message: 'Too many requests. Please try again later.' }
		} as never);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const { container } = render(SettingsPage, { props: { data: mockData as any, form: null } });

		const addPhoneButton = Array.from(container.querySelectorAll('button')).find(
			(b) => b.textContent?.trim() === 'Add phone'
		)!;
		await fireEvent.click(addPhoneButton);

		await waitFor(() => {
			expect(container.querySelector('[data-testid="mock-phone-input"]')).not.toBeNull();
		});

		const sendButtons = Array.from(container.querySelectorAll('button')).filter(
			(b) => b.textContent?.trim() === 'Send code'
		);
		await fireEvent.click(sendButtons[sendButtons.length - 1]!);

		await waitFor(() => {
			expect(container.textContent).toContain('Code sent to');
		});

		const otpInput = container.querySelector('input[inputmode="numeric"]')!;
		await fireEvent.input(otpInput, { target: { value: '123456' } });

		await waitFor(() => {
			expect(container.textContent).toContain('Too many attempts, please wait');
			expect(container.textContent).not.toContain('Too many requests. Please try again later.');
		});
	});
});
