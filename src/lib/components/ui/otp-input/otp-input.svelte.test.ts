// SPDX-License-Identifier: AGPL-3.0-or-later

import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import OtpInput from './otp-input.svelte';

vi.mock('$lib/paraglide/messages.js', () => ({
	otp_resend_prompt: () => "Didn't receive it?",
	otp_resend: () => 'Resend',
	otp_countdown: ({ seconds }: { seconds: number }) => `${seconds}s`
}));

describe('OtpInput', () => {
	describe('Test A — clears input when error prop becomes non-empty', () => {
		test('Given a typed OTP, when error is set, then the input is cleared', async () => {
			const onSubmit = vi.fn().mockResolvedValue(undefined);
			const onResend = vi.fn().mockResolvedValue(undefined);

			const { container, rerender } = render(OtpInput, {
				props: { onSubmit, onResend, error: '' }
			});

			const input = container.querySelector('input[inputmode="numeric"]') as HTMLInputElement;
			expect(input).not.toBeNull();

			// Simulate typing 123456
			await fireEvent.input(input, { target: { value: '123456' } });
			expect(input.value).toBe('123456');

			// Re-render with error set
			await rerender({ onSubmit, onResend, error: 'Invalid code' });

			// Input should be cleared
			await waitFor(() => {
				expect(input.value).toBe('');
			});
		});
	});

	describe('Test B — resend: when onResend throws, console.error is called and state is not reset', () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		test('Given onResend throws, when resend is clicked, then console.error is called and input is not cleared', async () => {
			const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			const onSubmit = vi.fn().mockResolvedValue(undefined);
			const onResend = vi.fn().mockRejectedValue(new Error('Network error'));

			const { container } = render(OtpInput, {
				props: { onSubmit, onResend, error: '' }
			});

			// Advance timer 30s so countdown reaches 0 and resend button appears
			await vi.advanceTimersByTimeAsync(30_000);

			const input = container.querySelector('input[inputmode="numeric"]') as HTMLInputElement;
			expect(input).not.toBeNull();

			// Simulate typing 654321
			await fireEvent.input(input, { target: { value: '654321' } });
			expect(input.value).toBe('654321');

			// Click the resend button
			const resendButton = container.querySelector('button') as HTMLButtonElement;
			expect(resendButton).not.toBeNull();
			await fireEvent.click(resendButton);

			// Flush pending microtasks so the rejected onResend promise is handled
			// (don't use runAllTimersAsync — the component's setInterval is infinite)
			await Promise.resolve();
			await Promise.resolve();

			// console.error should have been called
			expect(consoleErrorSpy).toHaveBeenCalled();

			// Input should NOT be cleared
			expect(input.value).toBe('654321');

			consoleErrorSpy.mockRestore();
		});
	});
});
