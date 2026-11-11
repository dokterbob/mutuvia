// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Pure helpers for src/routes/sentry-tunnel/+server.ts, split out so they're
// unit-testable without constructing real streaming Requests for every case.

/**
 * An envelope may only be forwarded when BOTH its DSN host AND its project id
 * (the numeric path segment) match the one this deployment is configured
 * with — host alone is not enough: a self-hosted Sentry instance (or even
 * sentry.io, which can host more than one org/project per ingest host in
 * some setups) could have a different project living at the same hostname,
 * and matching host-only would let anyone tunnel arbitrary envelopes to that
 * other project through this server — an open relay. Comparing both pins
 * this endpoint to exactly the one project it was built to carry telemetry
 * for.
 */
export function isAllowedEnvelopeDsn(envelopeDsn: URL, configuredDsn: URL): boolean {
	return (
		envelopeDsn.hostname === configuredDsn.hostname &&
		envelopeDsn.pathname === configuredDsn.pathname
	);
}

export function dsnProjectId(dsn: URL): string {
	return dsn.pathname.replace(/^\//, '');
}

/**
 * Reads a Request body up to `maxBytes`, counting ACTUAL bytes received as
 * they stream in — never trusting the client-supplied `Content-Length`
 * (which a client can simply lie about). Returns `null` if the body exceeds
 * the cap (and cancels the stream immediately, rather than reading the rest).
 */
export async function readBodyWithLimit(
	request: Request,
	maxBytes: number
): Promise<Uint8Array | null> {
	if (!request.body) return new Uint8Array(0);

	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		total += value.byteLength;
		if (total > maxBytes) {
			try {
				await reader.cancel();
			} catch {
				// already closed/cancelled — nothing more to do
			}
			return null;
		}
		chunks.push(value);
	}

	const result = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return result;
}
