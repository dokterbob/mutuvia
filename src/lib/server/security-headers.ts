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

export interface SecurityHeaderInput {
	pathname: string;
	/** `event.url.protocol === 'https:'` — HSTS is meaningless (and actively wrong) to send over plain http. */
	isHttps: boolean;
	/** `!!event.locals.user` — set by authHandle before this runs. */
	authenticated: boolean;
	/** Whether the response already carries its own Cache-Control (e.g. the SSE stream, assetlinks.json) — never overridden. */
	hasCacheControl: boolean;
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

	if (input.isHttps) {
		headers['strict-transport-security'] =
			`max-age=${input.hstsMaxAgeSeconds}` +
			(input.hstsIncludeSubdomains ? '; includeSubDomains' : '');
	}

	if (isSensitivePath(input.pathname)) {
		// Reaches crawlers that don't execute JS/render a <meta> tag — see
		// README's "Security headers" section for why this is header-only.
		headers['x-robots-tag'] = 'noindex, nofollow';
	}

	if (!input.hasCacheControl && (input.authenticated || isSensitivePath(input.pathname))) {
		headers['cache-control'] = 'private, no-store';
	}

	return headers;
}

/** Applies `buildSecurityHeaders`'s output to a real Response's headers (mutates in place). */
export function applySecurityHeaders(
	response: Response,
	input: Omit<SecurityHeaderInput, 'hasCacheControl'>
): void {
	const headers = buildSecurityHeaders({
		...input,
		hasCacheControl: response.headers.has('cache-control')
	});
	for (const [key, value] of Object.entries(headers)) {
		response.headers.set(key, value);
	}
}
