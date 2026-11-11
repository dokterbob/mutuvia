// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Isomorphic, pure — used by both src/hooks.client.ts (reads
// `$env/dynamic/public` directly) and src/instrumentation.server.ts (reads
// `process.env` directly, since it runs too early for SvelteKit's env
// modules — see that file's own comment), plus `$lib/config`'s
// `sentryTracesSampleRate` getter (for the boot-time validateConfig() check).
// All three must agree on the same default and the same validation, so the
// parsing lives in exactly one place.

export const DEFAULT_SENTRY_TRACES_SAMPLE_RATE = 0.1;

/**
 * Parses `PUBLIC_SENTRY_TRACES_SAMPLE_RATE` (unset/empty -> the default).
 * Throws on an out-of-range or non-numeric value — same "fail fast at boot,
 * never silently clamp" posture as the other numeric env vars in
 * `$lib/config`.
 */
export function parseSentryTracesSampleRate(raw: string | undefined): number {
	if (raw === undefined || raw === '') return DEFAULT_SENTRY_TRACES_SAMPLE_RATE;
	const value = Number(raw);
	if (!Number.isFinite(value) || value < 0 || value > 1) {
		throw new Error(`PUBLIC_SENTRY_TRACES_SAMPLE_RATE "${raw}" must be a number between 0 and 1`);
	}
	return value;
}
