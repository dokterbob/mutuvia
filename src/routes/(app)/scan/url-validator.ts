// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Validates a QR scan result and returns the app-relative pathname to navigate to,
 * or null if the scanned data is not a recognised payment URL.
 *
 * Accepts both single-use /accept/[token] and reusable /send/[id] paths.
 */
export function parsePaymentUrl(data: string): string | null {
	try {
		const url = new URL(data);
		const acceptMatch = url.pathname.match(/^\/accept\/([^/]+)$/);
		if (acceptMatch && /^[A-Za-z0-9\-_.]+$/.test(acceptMatch[1])) {
			return url.pathname;
		}
		const sendMatch = url.pathname.match(/^\/send\/([^/]+)$/);
		if (sendMatch && /^[A-Za-z0-9-]+$/.test(sendMatch[1])) {
			return url.pathname;
		}
	} catch {
		// Not a URL
	}
	return null;
}
