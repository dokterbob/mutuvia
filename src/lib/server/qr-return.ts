// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The cookies that carry a signed-out QR scanner through sign-in / sign-up
// and back to the QR they scanned:
//
// - `qr_return_to`     — where to land after onboarding (`/accept/<token>` or
//                        `/send/<id>`). Consumed by the onboarding name step
//                        (new users) or the onboarding layout (existing users).
// - `qr_skip_intros`   — fast track: skip the intro screens. Consumed with
//                        `qr_return_to`.
// - `qr_amount`        — reusable QR: the amount typed before signing in.
//                        Consumed by `/send/[id]` itself, not here.
// - `qr_accept_intent` — one-time QR: which token the user set out to accept,
//                        and whether they came through the fast track
//                        ("Accept … and sign in") or "How it works". It must
//                        outlive `qr_return_to`, so it's consumed by
//                        `/accept/[token]` itself (see `readAcceptIntent`).
//
// Every cookie here gets the same explicit policy. In particular `secure`
// follows APP_URL's scheme — exactly like Better Auth's session cookie
// (`advanced.useSecureCookies` in ./auth.ts). Left to SvelteKit's default,
// `secure` is true on every host but `localhost`, so on a plain-http dev
// server reached over the LAN the browser silently drops these cookies while
// keeping the session cookie: sign-in "works" but never returns to the QR.

import type { Cookies } from '@sveltejs/kit';
import { config } from '$lib/config';

export const QR_RETURN_TO_COOKIE = 'qr_return_to';
export const QR_SKIP_INTROS_COOKIE = 'qr_skip_intros';
export const QR_AMOUNT_COOKIE = 'qr_amount';
export const QR_ACCEPT_INTENT_COOKIE = 'qr_accept_intent';

/** Onboarding window for a QR that never expires (reusable "never"). */
export const ONBOARDING_WINDOW_SECONDS = 86_400;

/**
 * Extra lifetime past the QR's own expiry, so a user whose QR expires while
 * they're still signing up lands back on it and gets a clear "expired before
 * you finished" message — instead of the return cookie vanishing at the same
 * instant as the QR and dropping them on Home with no explanation.
 */
export const EXPIRED_GRACE_SECONDS = 900;

export type AcceptIntentMode = 'fast' | 'full';

type CookieOptions = Parameters<Cookies['set']>[2];

/** The shared cookie policy for every QR return cookie. */
export function qrCookieOptions(maxAge?: number): CookieOptions {
	return {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: config.appUrl.startsWith('https://'),
		...(maxAge === undefined ? {} : { maxAge })
	};
}

/**
 * How long the return cookies live: the onboarding window (1 day), capped at
 * the QR's remaining lifetime plus a short grace period. A QR that never
 * expires gets the full window.
 */
export function returnCookieMaxAge(expiresAt: Date | null, nowMs: number = Date.now()): number {
	if (expiresAt === null) return ONBOARDING_WINDOW_SECONDS;
	const remaining = Math.ceil((expiresAt.getTime() - nowMs) / 1000);
	return Math.max(
		EXPIRED_GRACE_SECONDS,
		Math.min(ONBOARDING_WINDOW_SECONDS, remaining + EXPIRED_GRACE_SECONDS)
	);
}

/**
 * Open-redirect guard: only a same-origin absolute path, never a
 * protocol-relative `//host`, and never back into onboarding (loop).
 */
export function isSafeReturnTo(value: string | undefined): value is string {
	return (
		typeof value === 'string' &&
		value.startsWith('/') &&
		!value.startsWith('//') &&
		!value.startsWith('/\\') &&
		!value.startsWith('/onboarding')
	);
}

export interface QrReturnOptions {
	returnTo: string;
	expiresAt: Date | null;
	skipIntros: boolean;
	/** Reusable QR only: `undefined` leaves `qr_amount` alone, `null` clears it. */
	amount?: number | null;
	/** One-time QR only: record what the user set out to accept. */
	acceptIntent?: { token: string; mode: AcceptIntentMode };
}

export function setQrReturnCookies(cookies: Cookies, opts: QrReturnOptions): void {
	const set = qrCookieOptions(returnCookieMaxAge(opts.expiresAt));
	const del = qrCookieOptions();

	cookies.set(QR_RETURN_TO_COOKIE, opts.returnTo, set);

	if (opts.skipIntros) cookies.set(QR_SKIP_INTROS_COOKIE, '1', set);
	else cookies.delete(QR_SKIP_INTROS_COOKIE, del);

	if (opts.amount !== undefined) {
		if (opts.amount === null) cookies.delete(QR_AMOUNT_COOKIE, del);
		else cookies.set(QR_AMOUNT_COOKIE, String(opts.amount), set);
	}

	if (opts.acceptIntent) {
		cookies.set(
			QR_ACCEPT_INTENT_COOKIE,
			`${opts.acceptIntent.mode}:${opts.acceptIntent.token}`,
			set
		);
	} else {
		cookies.delete(QR_ACCEPT_INTENT_COOKIE, del);
	}
}

/**
 * Returns the validated post-onboarding destination, or null. Always clears
 * `qr_return_to` and `qr_skip_intros` (a rejected value must not linger).
 * Deliberately leaves `qr_amount` and `qr_accept_intent` in place — the page
 * the user returns to consumes those itself.
 */
export function consumeQrReturnTo(cookies: Cookies): string | null {
	const returnTo = cookies.get(QR_RETURN_TO_COOKIE);
	if (returnTo === undefined) return null;
	const del = qrCookieOptions();
	cookies.delete(QR_RETURN_TO_COOKIE, del);
	cookies.delete(QR_SKIP_INTROS_COOKIE, del);
	return isSafeReturnTo(returnTo) ? returnTo : null;
}

/** The accept intent recorded for exactly this token, or null. */
export function readAcceptIntent(cookies: Cookies, token: string): AcceptIntentMode | null {
	const raw = cookies.get(QR_ACCEPT_INTENT_COOKIE);
	if (!raw) return null;
	const sep = raw.indexOf(':');
	if (sep < 0) return null;
	const mode = raw.slice(0, sep);
	if (raw.slice(sep + 1) !== token) return null;
	return mode === 'fast' || mode === 'full' ? mode : null;
}

export function clearAcceptIntent(cookies: Cookies): void {
	cookies.delete(QR_ACCEPT_INTENT_COOKIE, qrCookieOptions());
}
