// SPDX-License-Identifier: AGPL-3.0-or-later

import type { RequestEvent } from '@sveltejs/kit';
import { config } from '$lib/config';

/**
 * Makes `event.request` carry a trustworthy client IP under
 * `config.trustedIpHeader` — the header Better Auth is configured to read
 * for rate-limit bucketing (`advanced.ipAddress.ipAddressHeaders` in
 * auth.ts). Always strips any client-supplied value of that same header
 * first, then sets it from SvelteKit's own `event.getClientAddress()` —
 * so a client can never choose its own rate-limit bucket, and limiting is
 * never silently skipped for lack of a determinable IP (Better Auth's own
 * IP lookup, node_modules/better-auth/dist/utils/get-request-ip.mjs, returns
 * `null` — and skips rate limiting entirely — when the configured header is
 * absent or invalid).
 *
 * `event.getClientAddress()` is only as trustworthy as `ADDRESS_HEADER` /
 * `XFF_DEPTH` (svelte-adapter-bun's own env vars) make it when behind a
 * reverse proxy — see README's "Reverse proxy / client IP" section and the
 * startup warning in `validateConfig()`.
 *
 * Reconstructs the Request (rather than mutating `event.request.headers` in
 * place) to avoid depending on whether the runtime's `Headers` instance for
 * an incoming request happens to be mutable — `new Request(old, {headers})`
 * is guaranteed to work regardless, and preserves method/body/etc.
 *
 * When the client address can't be resolved: svelte-adapter-bun's
 * `getClientAddress()` throws when `ADDRESS_HEADER` is configured but absent
 * from the request (or `XFF_DEPTH` exceeds the hops present). That's normal
 * for requests that bypass the proxy, most importantly the Dockerfile /
 * docker-compose.yml health checks (`wget http://localhost:3000/api/health`).
 * Only Better Auth's own HTTP routes (`/api/auth/*`, its default basePath,
 * which `svelteKitHandler` dispatches to) consume this header, for rate
 * limiting and the Prelude IP signal. So:
 * - on those routes we keep failing closed and rethrow, because continuing
 *   without the header would make Better Auth skip rate limiting entirely;
 * - everywhere else we continue with the header absent. A client-supplied
 *   value is still always stripped, so it can never pose as the trusted one.
 */
export function applyTrustedIpHeader(event: RequestEvent): void {
	const headerName = config.trustedIpHeader;
	const headers = new Headers(event.request.headers);
	headers.delete(headerName);
	let address: string | undefined;
	try {
		address = event.getClientAddress();
	} catch (err) {
		if (isBetterAuthPath(event.url.pathname)) throw err;
	}
	if (address !== undefined) headers.set(headerName, address);
	event.request = new Request(event.request, { headers });
}

const BETTER_AUTH_BASE_PATH = '/api/auth';

function isBetterAuthPath(pathname: string): boolean {
	return pathname === BETTER_AUTH_BASE_PATH || pathname.startsWith(`${BETTER_AUTH_BASE_PATH}/`);
}
