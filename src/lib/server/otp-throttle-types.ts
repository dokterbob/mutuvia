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
