// SPDX-License-Identifier: AGPL-3.0-or-later

// JWT tokens use the base64url alphabet (A-Za-z0-9-_) with dots as part separators.
// This pattern matches a single path segment with no slashes, preventing path traversal.
const TOKEN_RE = /^[A-Za-z0-9\-_.]+$/;

// UUIDs and short IDs used in /send/ paths (hex chars and hyphens)
const ID_RE = /^[A-Za-z0-9-]+$/;

/**
 * Extract an /accept/{token} or /send/{id} path from Web Share Target query params.
 *
 * Returns the path (without origin) or null.
 * Always returns a path-only string to prevent open redirects.
 */
export function extractAcceptUrl(params: URLSearchParams): string | null {
	// Try `url` param first (most reliable — structured URL field)
	const urlParam = params.get('url');
	if (urlParam) {
		const path = parseAcceptPath(urlParam) ?? parseSendPath(urlParam);
		if (path) return path;
	}

	// Fall back to `text` param (URL embedded in message text)
	const textParam = params.get('text');
	if (textParam) {
		const path = extractAcceptPathFromText(textParam) ?? extractSendPathFromText(textParam);
		if (path) return path;
	}

	// Last resort: `title` param
	const titleParam = params.get('title');
	if (titleParam) {
		const path = extractAcceptPathFromText(titleParam) ?? extractSendPathFromText(titleParam);
		if (path) return path;
	}

	return null;
}

/**
 * Parse a URL string and return the /send/{id} path if it matches.
 * Strips the origin so redirects are always relative (prevents open redirect).
 * ID must be a single path segment matching alphanumeric + hyphen charset (UUID).
 */
function parseSendPath(input: string): string | null {
	let pathname: string;
	try {
		pathname = new URL(input).pathname;
	} catch {
		// Not a full URL — treat as a bare path; strip query/fragment
		pathname = input.replace(/[?#].*$/, '');
	}
	// Trim optional trailing slash before matching
	if (pathname.length > 1 && pathname.endsWith('/')) {
		pathname = pathname.slice(0, -1);
	}
	const match = pathname.match(/^\/send\/([^/]+)$/);
	if (match && ID_RE.test(match[1])) return `/send/${match[1]}`;
	return null;
}

/**
 * Search free text for a URL containing /send/{id}.
 * Handles cases like "Pay me: https://app.example.com/send/abc-123"
 */
function extractSendPathFromText(text: string): string | null {
	const urlRegex = /https?:\/\/[^\s]+\/send\/[^\s]+/gi;
	const matches = text.match(urlRegex);
	if (matches) {
		for (const rawMatch of matches) {
			// Strip trailing sentence punctuation that messaging apps may have captured
			const match = rawMatch.replace(/[.,;:!?'")\]>]+$/, '');
			const path = parseSendPath(match);
			if (path) return path;
		}
	}

	// Also handle bare /send/ paths, trimming query/fragment and trailing punctuation
	const pathMatch = text.match(/\/send\/([^\s?#.,;:!'"()[\]]+)/);
	if (pathMatch) {
		const path = parseSendPath(`/send/${pathMatch[1]}`);
		if (path) return path;
	}

	return null;
}

/**
 * Parse a URL string and return the /accept/{token} path if it matches.
 * Strips the origin so redirects are always relative (prevents open redirect).
 * Token must be a single path segment matching the JWT base64url charset.
 */
function parseAcceptPath(input: string): string | null {
	let pathname: string;
	try {
		pathname = new URL(input).pathname;
	} catch {
		// Not a full URL — treat as a bare path; strip query/fragment
		pathname = input.replace(/[?#].*$/, '');
	}
	// Trim optional trailing slash before matching
	if (pathname.length > 1 && pathname.endsWith('/')) {
		pathname = pathname.slice(0, -1);
	}
	const match = pathname.match(/^\/accept\/([^/]+)$/);
	if (match && TOKEN_RE.test(match[1])) return `/accept/${match[1]}`;
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
		for (const rawMatch of matches) {
			// Strip trailing sentence punctuation that messaging apps may have captured
			const match = rawMatch.replace(/[.,;:!?'")\]>]+$/, '');
			const path = parseAcceptPath(match);
			if (path) return path;
		}
	}

	// Also handle bare /accept/ paths, trimming query/fragment and trailing punctuation
	const pathMatch = text.match(/\/accept\/([^\s?#.,;:!'"()[\]]+)/);
	if (pathMatch) {
		const path = parseAcceptPath(`/accept/${pathMatch[1]}`);
		if (path) return path;
	}

	return null;
}
