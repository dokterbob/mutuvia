// SPDX-License-Identifier: AGPL-3.0-or-later

// Validates Web Push subscription endpoints and keys supplied by the browser
// before we ever store or POST to them. Without this, `web-push` would send
// an authenticated HTTPS POST (with VAPID credentials) to any URL a client
// chooses to supply — a blind SSRF primitive.
//
// Host allowlist, verified against current vendor documentation (2026-11):
//   - fcm.googleapis.com               Chrome / Firefox-on-Android via FCM.
//                                      https://developer.chrome.com/blog/web-push-interop-wins
//   - android.googleapis.com           Legacy Chrome/GCM endpoint form. Chrome's own
//                                      blog still documents `android.googleapis.com/gcm/send/…`
//                                      as a working (if older) endpoint shape.
//                                      https://developer.chrome.com/blog/web-push-interop-wins
//   - updates.push.services.mozilla.com  Firefox (Mozilla autopush).
//                                      https://autopush.readthedocs.io/en/latest/http.html
//   - *.push.apple.com                 Safari. Apple's own guidance: "If your network
//                                      infrastructure limits which URLs your server can
//                                      access, allow access for https://*.push.apple.com".
//                                      Observed endpoints use the `web.push.apple.com` subdomain.
//                                      https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers
//   - *.notify.windows.com              Edge (Windows Push Notification Services / WNS).
//                                      Microsoft: "the cloud service always ensures that the
//                                      channel URI uses the domain notify.windows.com".
//                                      https://learn.microsoft.com/windows/apps/design/shell/tiles-and-notifications/firewall-allowlist-config
//
// Deliberately NOT included: FCM/autopush staging hosts (e.g. jmt17.google.com,
// updates-autopush.stage.mozaws.net) — these are non-production and should never
// appear in a real browser subscription.
//
// Operators can extend the list via PUSH_ENDPOINT_EXTRA_HOSTS (see config.ts).

export const PUSH_ENDPOINT_MAX_LENGTH = 2048;

export const DEFAULT_ALLOWED_PUSH_HOSTS: readonly string[] = [
	'fcm.googleapis.com',
	'android.googleapis.com',
	'updates.push.services.mozilla.com',
	'*.push.apple.com',
	'*.notify.windows.com'
];

const HOST_PATTERN = /^(\*\.)?([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;

/** Validates a PUSH_ENDPOINT_EXTRA_HOSTS entry shape ("example.com" or "*.example.com"). */
export function isValidHostPattern(pattern: string): boolean {
	return HOST_PATTERN.test(pattern);
}

function hostMatches(hostname: string, pattern: string): boolean {
	const host = hostname.toLowerCase();
	const pat = pattern.toLowerCase();
	if (pat.startsWith('*.')) {
		const base = pat.slice(2);
		return host === base || host.endsWith(`.${base}`);
	}
	return host === pat;
}

export function isAllowedPushHost(hostname: string, extraHosts: readonly string[] = []): boolean {
	return [...DEFAULT_ALLOWED_PUSH_HOSTS, ...extraHosts].some((pattern) =>
		hostMatches(hostname, pattern)
	);
}

function isIpLiteral(hostname: string): boolean {
	// IPv6 literals retain their brackets in URL#hostname (e.g. "[::1]").
	if (hostname.startsWith('[')) return true;
	// IPv4 dotted-quad. The WHATWG URL parser already rejects other IPv4 forms
	// (hex/octal/decimal-integer) by normalizing or failing to parse, so a
	// plain dotted-quad check is sufficient here.
	return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

export type PushEndpointValidation = { ok: true; url: URL } | { ok: false; reason: string };

/**
 * Validates a push subscription endpoint URL: well-formed, https-only, no
 * embedded credentials, no non-default port, not an IP literal or a
 * trailing-dot hostname trick, and on the host allowlist.
 */
export function validatePushEndpoint(
	endpoint: unknown,
	extraHosts: readonly string[] = []
): PushEndpointValidation {
	if (typeof endpoint !== 'string' || endpoint.length === 0) {
		return { ok: false, reason: 'endpoint must be a non-empty string' };
	}
	if (endpoint.length > PUSH_ENDPOINT_MAX_LENGTH) {
		return { ok: false, reason: `endpoint must not exceed ${PUSH_ENDPOINT_MAX_LENGTH} characters` };
	}

	let url: URL;
	try {
		url = new URL(endpoint);
	} catch {
		return { ok: false, reason: 'endpoint is not a valid URL' };
	}

	if (url.protocol !== 'https:') {
		return { ok: false, reason: 'endpoint must use the https: scheme' };
	}
	if (url.username !== '' || url.password !== '') {
		return { ok: false, reason: 'endpoint must not include embedded credentials' };
	}
	// `.port` is '' unless the URL specifies a non-default port for its scheme.
	if (url.port !== '') {
		return { ok: false, reason: 'endpoint must not override the default port' };
	}
	if (url.hostname.endsWith('.')) {
		return { ok: false, reason: 'endpoint host must not have a trailing dot' };
	}
	if (isIpLiteral(url.hostname)) {
		return { ok: false, reason: 'endpoint host must not be an IP address literal' };
	}
	if (!isAllowedPushHost(url.hostname, extraHosts)) {
		return { ok: false, reason: `endpoint host "${url.hostname}" is not an allowed push service` };
	}

	return { ok: true, url };
}

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

function decodeBase64Url(value: string): Uint8Array | null {
	if (!BASE64URL_PATTERN.test(value)) return null;
	try {
		const buf = Buffer.from(value, 'base64url');
		return new Uint8Array(buf);
	} catch {
		return null;
	}
}

export type PushKeysValidation =
	| { ok: true; p256dh: string; auth: string }
	| { ok: false; reason: string };

/**
 * Validates the shape of the two Web Push subscription keys:
 *   - p256dh: base64url-encoded 65-byte uncompressed P-256 point (0x04 prefix)
 *   - auth:   base64url-encoded 16-byte secret
 */
export function validatePushKeys(keys: unknown): PushKeysValidation {
	if (typeof keys !== 'object' || keys === null) {
		return { ok: false, reason: 'keys must be an object' };
	}
	const { p256dh, auth } = keys as Record<string, unknown>;
	if (typeof p256dh !== 'string' || typeof auth !== 'string') {
		return { ok: false, reason: 'keys.p256dh and keys.auth must be strings' };
	}

	const p256dhBytes = decodeBase64Url(p256dh);
	if (!p256dhBytes || p256dhBytes.length !== 65 || p256dhBytes[0] !== 0x04) {
		return {
			ok: false,
			reason: 'keys.p256dh must be a base64url-encoded 65-byte uncompressed P-256 point'
		};
	}

	const authBytes = decodeBase64Url(auth);
	if (!authBytes || authBytes.length !== 16) {
		return { ok: false, reason: 'keys.auth must be a base64url-encoded 16-byte secret' };
	}

	return { ok: true, p256dh, auth };
}

// Drop the oldest subscription(s) once a user has more than this many —
// bounds both storage and the number of HTTP calls a notification fans out to.
export const MAX_SUBSCRIPTIONS_PER_USER = 10;

export const MAX_USER_AGENT_LENGTH = 512;

/** Caps the stored userAgent string length — it's informational metadata, not validated input. */
export function capUserAgent(userAgent: unknown): string | null {
	if (typeof userAgent !== 'string' || userAgent.length === 0) return null;
	return userAgent.slice(0, MAX_USER_AGENT_LENGTH);
}
