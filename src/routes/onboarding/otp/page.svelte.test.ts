// SPDX-License-Identifier: AGPL-3.0-or-later
// Tests for loading spinner wiring on the onboarding OTP page.

import { vi, describe, test, expect, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import OtpPage from './+page.svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

vi.mock('$lib/auth-client', () => ({
	authClient: {
		phoneNumber: {
			verify: vi.fn(),
			sendOtp: vi.fn()
		},
		signIn: {
			emailOtp: vi.fn()
		},
		emailOtp: {
			sendVerificationOtp: vi.fn()
		}
	}
}));

vi.mock('$lib/paraglide/messages.js', () => ({
	otp_eyebrow: () => 'Verify',
	otp_title: () => 'Enter your 6-digit code',
	otp_sent_to: ({ destination }: { destination: string }) => `Code sent to ${destination}`,
	otp_resend_prompt: () => "Didn't receive it?",
	otp_resend: () => 'Resend',
	otp_countdown: ({ seconds }: { seconds: number }) => `${seconds}s`,
	otp_cta: () => 'Verify',
	otp_back: () => 'Back',
	otp_invalid_code: () => 'Invalid code',
	error_send_code: () => 'Failed to send code'
}));

const mockData = {
	otpMethod: 'phone' as const,
	otpDestination: '+351912345678'
};

describe('OTP page – loading spinner', () => {
	let verifyMock: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		const { authClient } = await import('$lib/auth-client');
		verifyMock = vi.mocked(authClient.phoneNumber.verify);
	});

	test('verify button shows spinner while verifying OTP', async () => {
		verifyMock.mockReturnValue(new Promise(() => {}));

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const { container } = render(OtpPage, { props: { data: mockData as any } });

		const otpInput = container.querySelector('input[inputmode="numeric"]');
		expect(otpInput).not.toBeNull();
		await fireEvent.input(otpInput!, { target: { value: '123456' } });

		await waitFor(() => {
			// Find the verify button (not the ghost back button) — look for the disabled one
			const buttons = container.querySelectorAll('button[data-slot="button"]');
			// The primary verify button is the one that becomes disabled while loading
			const primaryButton = Array.from(buttons).find((btn) =>
				btn.className.includes('bg-[#2D4A32]')
			);
			expect(primaryButton).not.toBeNull();
			expect(primaryButton).toBeDisabled();
			expect(primaryButton!.querySelector('.animate-spin')).not.toBeNull();
		});
	});

	test('verify button clears spinner after successful verification', async () => {
		verifyMock.mockResolvedValue({ error: null } as never);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const { container } = render(OtpPage, { props: { data: mockData as any } });

		const otpInput = container.querySelector('input[inputmode="numeric"]');
		expect(otpInput).not.toBeNull();
		await fireEvent.input(otpInput!, { target: { value: '123456' } });

		await waitFor(() => {
			const buttons = container.querySelectorAll('button[data-slot="button"]');
			const primaryButton = Array.from(buttons).find((btn) =>
				btn.className.includes('bg-[#2D4A32]')
			);
			expect(primaryButton).not.toBeNull();
			expect(primaryButton!.querySelector('.animate-spin')).toBeNull();
		});
	});

	test('verify button clears spinner on verification error', async () => {
		verifyMock.mockResolvedValue({
			error: { message: 'Invalid code' }
		} as never);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const { container } = render(OtpPage, { props: { data: mockData as any } });

		const otpInput = container.querySelector('input[inputmode="numeric"]');
		expect(otpInput).not.toBeNull();
		await fireEvent.input(otpInput!, { target: { value: '123456' } });

		await waitFor(() => {
			const buttons = container.querySelectorAll('button[data-slot="button"]');
			const primaryButton = Array.from(buttons).find((btn) =>
				btn.className.includes('bg-[#2D4A32]')
			);
			expect(primaryButton).not.toBeNull();
			expect(primaryButton!.querySelector('.animate-spin')).toBeNull();
			expect(container.textContent).toContain('Invalid code');
		});
	});
});
