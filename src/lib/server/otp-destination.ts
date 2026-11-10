// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Normalizes an OTP destination (phone number or email address) to a stable
// key for the per-destination throttle (otp-throttle.ts) — so "Bob@Ex.com",
// "bob@ex.com " and "bob@ex.com" all count against the same bucket, and a
// phone number is compared the same way the rest of the app already stores
// it (E.164, as produced by svelte-tel-input on the client).

/** Lowercases and trims — the same normalization every write path in auth.ts
 * already applies to `email` before it reaches the database (see the
 * `user.email` unique-index comment in schema.sqlite.ts). */
export function normalizeEmailDestination(email: string): string {
	return email.trim().toLowerCase();
}

/** Phone numbers arrive pre-validated as E.164 from the client (PhoneInput /
 * svelte-tel-input); only whitespace trimming is needed here. */
export function normalizePhoneDestination(phoneNumber: string): string {
	return phoneNumber.trim();
}
