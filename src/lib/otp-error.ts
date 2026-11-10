// SPDX-License-Identifier: AGPL-3.0-or-later

import * as m from '$lib/paraglide/messages.js';

/**
 * Picks a user-facing message for a failed OTP-send call (phoneNumber.sendOtp,
 * emailOtp.sendVerificationOtp, emailOtp.requestEmailChange). The server's
 * per-destination throttle (src/lib/server/auth.ts) returns a plain English
 * `APIError` message — never shown directly to the user, since this app is
 * localized — so a 429 always maps to the translated, non-enumerating
 * "too many attempts" copy instead.
 */
export function otpSendErrorMessage(error: { status?: number; message?: string | null }): string {
	if (error.status === 429) return m.error_too_many_requests();
	return error.message || m.error_send_code();
}
