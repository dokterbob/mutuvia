// SPDX-License-Identifier: AGPL-3.0-or-later

export function isSentryTunnelPath(pathname: string): boolean {
	return pathname === '/sentry-tunnel';
}

type SessionLookupResult<T> =
	| { skipped: true; session: null }
	| { skipped: false; session: T };

/**
 * Returns skipped=true for the Sentry tunnel path so callers can bypass Better Auth
 * session APIs for that route and avoid request-state errors.
 */
export async function getSessionUnlessSentryTunnel<T>(
	pathname: string,
	getSession: () => Promise<T>
): Promise<SessionLookupResult<T>> {
	if (isSentryTunnelPath(pathname)) {
		return { skipped: true, session: null };
	}

	return { skipped: false, session: await getSession() };
}
