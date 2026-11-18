// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Review fix (PR #136): the OTP *verify* call-sites (onboarding's shared
// verifyOtp(), settings' verifyEmailOtp()/verifyPhoneOtp()) showed Better
// Auth's raw English rate-limit text ("Too many requests. Please try again
// later.") on a 429 from the IP rate limiter, instead of the app's own
// localized copy — the send call-sites already got this right via
// otpSendErrorMessage. These tests pin a shared, status-aware helper used
// by both.

import { describe, test, expect, vi } from 'vitest';

vi.mock('$lib/paraglide/messages.js', () => ({
	error_too_many_requests: () => 'Too many attempts (localized)',
	error_send_code: () => 'Failed to send code',
	otp_invalid_code: () => 'Invalid code'
}));

import { otpSendErrorMessage, otpVerifyErrorMessage } from './otp-error';

describe('otpSendErrorMessage', () => {
	test('Given a 429 status, when picking a message, then it returns the localized throttle/rate-limit copy — not the raw server text', () => {
		expect(
			otpSendErrorMessage({ status: 429, message: 'Too many requests. Please try again later.' })
		).toBe('Too many attempts (localized)');
	});

	test('Given a non-429 error with a message, when picking a message, then it returns that message as-is', () => {
		expect(otpSendErrorMessage({ status: 400, message: 'Invalid phone number' })).toBe(
			'Invalid phone number'
		);
	});

	test('Given a non-429 error with no message, when picking a message, then it falls back to the localized send-failure copy', () => {
		expect(otpSendErrorMessage({ status: 500, message: null })).toBe('Failed to send code');
	});
});

describe('otpVerifyErrorMessage', () => {
	test("Given a 429 status (e.g. the IP rate limiter on /phone-number/verify or /sign-in/email-otp), when picking a message, then it returns the localized throttle/rate-limit copy — not Better Auth's raw English text", () => {
		expect(
			otpVerifyErrorMessage({ status: 429, message: 'Too many requests. Please try again later.' })
		).toBe('Too many attempts (localized)');
	});

	test('Given a non-429 error with a message (e.g. a genuinely wrong code), when picking a message, then it returns that message as-is', () => {
		expect(otpVerifyErrorMessage({ status: 400, message: 'Invalid OTP' })).toBe('Invalid OTP');
	});

	test('Given a non-429 error with no message, when picking a message, then it falls back to the localized invalid-code copy (not the send-failure copy)', () => {
		expect(otpVerifyErrorMessage({ status: 400, message: null })).toBe('Invalid code');
	});
});
