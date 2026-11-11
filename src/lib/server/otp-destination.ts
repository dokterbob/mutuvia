// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Normalizes an OTP destination (phone number or email address) to a stable
// key for the per-destination throttle (otp-throttle.ts) — so superficially
// different-looking strings that actually reach the same mailbox/handset
// all count against the same bucket. This is a THROTTLE-KEY-ONLY
// normalization: it must never be used for the address Better Auth actually
// stores or sends to — doing so would change what mailbox/number a message
// goes to, or (for phone numbers) reintroduce the pre-claim-adjacent
// unique-index hole described in auth.ts's phone-format-rejection comment.

import { parsePhoneNumberFromString } from 'libphonenumber-js';

/**
 * Returns the canonical E.164 form of `phone`, or `null` if it can't be
 * parsed or isn't even a *possible* phone number (wrong length/shape).
 *
 * Deliberately uses `isPossible()`, not `isValid()`: this app's own
 * test/E2E fixtures use fictional NANP numbers (the 555 exchange, e.g.
 * `+15550001111`) that are "possible" (correct length/shape for a NANP
 * number) but not "valid" (555 isn't a real assigned exchange) — using
 * `isValid()` would reject every test number in the suite along with any
 * other deliberately-fake number. `isPossible()` still rejects garbage
 * input and wrong-length strings, which is all this needs to guard against.
 */
export function canonicalE164(phone: string): string | null {
	const parsed = parsePhoneNumberFromString(phone.trim());
	if (!parsed || !parsed.isPossible()) return null;
	return parsed.number;
}

/**
 * Throttle key for a phone number. Callers that write/send to a phone
 * number (auth.ts's hooks.before) must reject anything `canonicalE164`
 * returns `null` for, or whose input doesn't already equal its canonical
 * form, BEFORE calling this — see the long comment there. This function
 * itself never throws: if it's ever called with something unparseable
 * despite that guard, it falls back to the trimmed raw string rather than
 * silently dropping the attempt (a throttle key that doesn't collapse
 * variants is still better than no throttling at all).
 */
export function normalizePhoneDestination(phoneNumber: string): string {
	return canonicalE164(phoneNumber) ?? phoneNumber.trim();
}

/**
 * Throttle key for an email address. Beyond the existing lowercase+trim
 * (matching how every write path already stores `user.email`), this also
 * collapses two well-known email-aliasing schemes that would otherwise let
 * one person spend unlimited distinct throttle buckets against the same
 * real mailbox:
 *
 *  - RFC 5233 "plus addressing" (`local+anything@domain`) — stripped for
 *    EVERY domain, since virtually all modern mail providers support it.
 *  - Gmail's dot-insensitivity (`v.i.c.t.i.m@gmail.com` ==
 *    `victim@gmail.com`) and the `googlemail.com`/`gmail.com` alias — Gmail
 *    specific, since dots are significant on other providers.
 *
 * This is NOT exhaustive: other providers' own alias schemes (e.g.
 * catch-all domains, Outlook's `+`-less aliasing via a separate configured
 * address) aren't covered. That residual gap is bounded by Better Auth's
 * own per-IP rate limiting (auth.ts's `rateLimit.customRules`), which does
 * not depend on the destination string at all.
 */
export function normalizeEmailDestination(email: string): string {
	const trimmedLower = email.trim().toLowerCase();
	const atIndex = trimmedLower.lastIndexOf('@');
	if (atIndex === -1) return trimmedLower;

	let local = trimmedLower.slice(0, atIndex);
	let domain = trimmedLower.slice(atIndex + 1);

	const plusIndex = local.indexOf('+');
	if (plusIndex !== -1) local = local.slice(0, plusIndex);

	if (domain === 'gmail.com' || domain === 'googlemail.com') {
		local = local.replaceAll('.', '');
		domain = 'gmail.com';
	}

	return `${local}@${domain}`;
}
