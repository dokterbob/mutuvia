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
 */
export function applyTrustedIpHeader(event: RequestEvent): void {
	const headerName = config.trustedIpHeader;
	const headers = new Headers(event.request.headers);
	headers.delete(headerName);
	headers.set(headerName, event.getClientAddress());
	event.request = new Request(event.request, { headers });
}
