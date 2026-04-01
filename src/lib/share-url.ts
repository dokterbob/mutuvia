// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Extract an /accept/{token} path from Web Share Target query params.
 *
 * Returns the /accept/{token} path (without origin) or null.
 * Always returns a path-only string to prevent open redirects.
 */
export function extractAcceptUrl(params: URLSearchParams): string | null {
	// Try `url` param first (most reliable — structured URL field)
	const urlParam = params.get('url');
	if (urlParam) {
		const path = parseAcceptPath(urlParam);
		if (path) return path;
	}

	// Fall back to `text` param (URL embedded in message text)
	const textParam = params.get('text');
	if (textParam) {
		const path = extractAcceptPathFromText(textParam);
		if (path) return path;
	}

	// Last resort: `title` param
	const titleParam = params.get('title');
	if (titleParam) {
		const path = extractAcceptPathFromText(titleParam);
		if (path) return path;
	}

	return null;
}

/**
 * Parse a URL string and return the /accept/{token} path if it matches.
 * Strips the origin so redirects are always relative (prevents open redirect).
 */
function parseAcceptPath(input: string): string | null {
	try {
		const parsed = new URL(input);
		const match = parsed.pathname.match(/^\/accept\/(.+)$/);
		if (match) return `/accept/${match[1]}`;
	} catch {
		// Not a full URL — check if it's already a bare path
		const match = input.match(/^\/accept\/(.+)$/);
		if (match) return `/accept/${match[1]}`;
	}
	return null;
}

/**
 * Search free text for a URL containing /accept/{token}.
 * Handles cases like "Check this: https://app.example.com/accept/eyJ..."
 */
function extractAcceptPathFromText(text: string): string | null {
	const urlRegex = /https?:\/\/[^\s]+\/accept\/[^\s]+/gi;
	const matches = text.match(urlRegex);
	if (matches) {
		for (const match of matches) {
			const path = parseAcceptPath(match);
			if (path) return path;
		}
	}

	// Also handle bare /accept/ paths
	const pathMatch = text.match(/\/accept\/(\S+)/);
	if (pathMatch) return `/accept/${pathMatch[1]}`;

	return null;
}
