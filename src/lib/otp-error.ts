// SPDX-License-Identifier: AGPL-3.0-or-later

import * as m from '$lib/paraglide/messages.js';

/**
 * Shared "pick a localized message for a failed authClient call" logic. A
 * 429 always maps to the translated, non-enumerating "too many attempts"
 * copy — never the raw server/library text — regardless of whether it came
 * from the per-destination throttle (src/lib/server/auth.ts, a plain
 * English `APIError` message) or Better Auth's own IP-based rate limiter
 * (also plain English: "Too many requests. Please try again later." —
 * reachable on `/phone-number/verify` and `/sign-in/email-otp` too, not
 * just the send endpoints). `fallback` is only used for a non-429 error
 * with no message of its own, and differs between a *send* failure and a
 * *verify* failure so each still reads naturally.
 */
function otpErrorMessage(
	error: { status?: number; message?: string | null },
	fallback: () => string
): string {
	if (error.status === 429) return m.error_too_many_requests();
	return error.message || fallback();
}

/** For a failed OTP-send call (phoneNumber.sendOtp, emailOtp.sendVerificationOtp,
 * emailOtp.requestEmailChange). */
export function otpSendErrorMessage(error: { status?: number; message?: string | null }): string {
	return otpErrorMessage(error, m.error_send_code);
}

/** For a failed OTP-*verify* call (phoneNumber.verify, signIn.emailOtp,
 * emailOtp.changeEmail) — review fix (PR #136): these previously showed
 * Better Auth's raw English 429 text instead of going through this helper
 * at all. */
export function otpVerifyErrorMessage(error: { status?: number; message?: string | null }): string {
	return otpErrorMessage(error, m.otp_invalid_code);
}
