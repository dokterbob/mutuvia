// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Pure header-building logic for src/hooks.server.ts's `handle` — kept
// separate and side-effect-free so it's unit-testable without constructing a
// real SvelteKit RequestEvent/Response. See hooks.server.ts for *where* this
// is applied and why that's the one place that covers every response path.

/**
 * `/accept/*` and `/send/*` carry per-recipient QR/payment data in the URL
 * itself — never indexable, and never cacheable by a shared/intermediate
 * cache regardless of auth state (an unauthenticated visitor can still load
 * one via a shared link).
 */
export function isSensitivePath(pathname: string): boolean {
	return pathname.startsWith('/accept/') || pathname.startsWith('/send/');
}

/**
 * Better Auth's own routes (sign-in/OTP send+verify, sign-out, session
 * refresh, etc). A request that CREATES a session here (e.g. `POST
 * /api/auth/sign-in/email-otp`) is judged "authenticated" by `authenticated`
 * below based on the session that existed BEFORE this request (there isn't
 * one yet) — so without this separate check, the exact response that sets
 * the session cookie would carry no Cache-Control at all. Path-matched
 * rather than relying solely on `setsCookie` below so a GET that merely
 * checks session state (no cookie to set) is covered too.
 */
function isAuthApiPath(pathname: string): boolean {
	return pathname.startsWith('/api/auth/');
}

export interface SecurityHeaderInput {
	pathname: string;
	/** `event.url.protocol === 'https:'` — HSTS is meaningless (and actively wrong) to send over plain http. */
	isHttps: boolean;
	/**
	 * `config.appUrl.startsWith('https://')` — the operator's OWN declared
	 * origin, independent of what this specific request's `isHttps` says.
	 * Required in addition to `isHttps`: `svelte-adapter-bun`'s `get_origin()`
	 * (dist/files/handler.js) defaults the request's protocol to 'https'
	 * whenever neither `ORIGIN` nor `PROTOCOL_HEADER` is configured — so on an
	 * all-http deployment that hasn't set either, `isHttps` alone would be
	 * `true` for every request with no TLS anywhere. Gating on BOTH means a
	 * plain-http `APP_URL` never gets HSTS regardless of the adapter's guess.
	 * See `$lib/config`'s `validateConfig()` for the complementary startup
	 * warning covering the opposite misconfiguration (https `APP_URL` with
	 * neither `ORIGIN` nor `PROTOCOL_HEADER` set, where `isHttps` can't
	 * actually be trusted either way).
	 */
	appUrlIsHttps: boolean;
	/** `!!event.locals.user` — set by authHandle before this runs. */
	authenticated: boolean;
	/** Whether the response already carries its own Cache-Control (e.g. the SSE stream, assetlinks.json) — never overridden. */
	hasCacheControl: boolean;
	/** `response.headers.has('set-cookie')` — a response that sets ANY cookie is treated as sensitive, not just /api/auth/* ones. */
	setsCookie: boolean;
	hstsMaxAgeSeconds: number;
	hstsIncludeSubdomains: boolean;
}

/**
 * Builds the header set to apply. Returns a plain object (not a Headers
 * instance) so tests can assert on it directly; src/hooks.server.ts applies
 * each entry with `response.headers.set(...)`.
 */
export function buildSecurityHeaders(input: SecurityHeaderInput): Record<string, string> {
	const headers: Record<string, string> = {
		'x-content-type-options': 'nosniff',
		'referrer-policy': 'no-referrer',
		// Camera is granted to same-origin content only — the QR scanner needs
		// it; geolocation/microphone are never used anywhere in the app.
		'permissions-policy': 'camera=(self), geolocation=(), microphone=()',
		// Legacy/defense-in-depth backups for frame-ancestors (CSP already sends
		// frame-ancestors 'none' as a header — see svelte.config.js); harmless
		// to double up, and covers browsers that don't support CSP3's directive.
		'x-frame-options': 'DENY',
		'cross-origin-opener-policy': 'same-origin'
	};

	if (input.isHttps && input.appUrlIsHttps) {
		headers['strict-transport-security'] =
			`max-age=${input.hstsMaxAgeSeconds}` +
			(input.hstsIncludeSubdomains ? '; includeSubDomains' : '');
	}

	if (isSensitivePath(input.pathname)) {
		// Reaches crawlers that don't execute JS/render a <meta> tag — see
		// README's "Security headers" section for why this is header-only.
		headers['x-robots-tag'] = 'noindex, nofollow';
	}

	const isSensitiveResponse =
		input.authenticated ||
		isSensitivePath(input.pathname) ||
		isAuthApiPath(input.pathname) ||
		input.setsCookie;
	if (!input.hasCacheControl && isSensitiveResponse) {
		headers['cache-control'] = 'private, no-store';
	}

	return headers;
}

/** Applies `buildSecurityHeaders`'s output to a real Response's headers (mutates in place). */
export function applySecurityHeaders(
	response: Response,
	input: Omit<SecurityHeaderInput, 'hasCacheControl' | 'setsCookie'>
): void {
	const headers = buildSecurityHeaders({
		...input,
		hasCacheControl: response.headers.has('cache-control'),
		setsCookie: response.headers.has('set-cookie')
	});
	for (const [key, value] of Object.entries(headers)) {
		response.headers.set(key, value);
	}
}
