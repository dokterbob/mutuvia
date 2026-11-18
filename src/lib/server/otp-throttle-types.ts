// SPDX-License-Identifier: AGPL-3.0-or-later

export type ThrottleResult = { ok: true } | { ok: false; retryAfterSeconds: number };

// Per-destination OTP send limits — independent of client IP. Deliberately
// not configurable via env: these are abuse-prevention tuning, not a
// deployment concern, and a hardcoded value can't be accidentally
// misconfigured to something unsafe.
export const SHORT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
export const SHORT_WINDOW_MAX = 3;
export const LONG_WINDOW_MS = 24 * 60 * 60 * 1000; // 1 day
export const LONG_WINDOW_MAX = 10;

/**
 * The window decision both providers share: given one destination's recorded
 * sends, would one more exceed either limit? Rows older than the long window
 * are ignored, so callers that don't prune first (the read-only check) get
 * the same answer as those that do.
 */
export function evaluateThrottle(rows: { createdAt: Date }[], now: number): ThrottleResult {
	const live = rows.filter((r) => r.createdAt.getTime() >= now - LONG_WINDOW_MS);
	if (live.length >= LONG_WINDOW_MAX) {
		return { ok: false, retryAfterSeconds: retryAfter(oldest(live), LONG_WINDOW_MS, now) };
	}
	const recent = live.filter((r) => r.createdAt.getTime() >= now - SHORT_WINDOW_MS);
	if (recent.length >= SHORT_WINDOW_MAX) {
		return { ok: false, retryAfterSeconds: retryAfter(oldest(recent), SHORT_WINDOW_MS, now) };
	}
	return { ok: true };
}

function oldest(rows: { createdAt: Date }[]): number {
	return Math.min(...rows.map((r) => r.createdAt.getTime()));
}

function retryAfter(oldestMs: number, windowMs: number, now: number): number {
	return Math.max(1, Math.ceil((oldestMs + windowMs - now) / 1000));
}
