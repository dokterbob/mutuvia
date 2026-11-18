// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Reduces a database connection URL to host/port/db-name for logging —
 * never the credentials embedded in it. Falls back to a generic message
 * (never the raw URL) if the value can't be parsed as a URL.
 */
export function scrubDatabaseUrl(url: string): string {
	try {
		const parsed = new URL(url);
		const db = parsed.pathname.replace(/^\//, '');
		return `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}/${db}`;
	} catch {
		return '(unable to parse DATABASE_URL for logging)';
	}
}
