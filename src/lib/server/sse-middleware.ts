// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Returns true for endpoints that return a streaming ReadableStream (SSE).
 * These must bypass Sentry.sentryHandle() which buffers response bodies
 * for performance tracing, breaking chunked SSE delivery.
 */
export function isStreamingEndpoint(pathname: string): boolean {
	return pathname === '/api/events';
}
