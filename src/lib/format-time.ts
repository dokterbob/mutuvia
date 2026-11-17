// SPDX-License-Identifier: AGPL-3.0-or-later

const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;

const rtfCache = new Map<string, Intl.RelativeTimeFormat>();

function getRtf(locale: string): Intl.RelativeTimeFormat {
	let rtf = rtfCache.get(locale);
	if (!rtf) {
		rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'always', style: 'long' });
		rtfCache.set(locale, rtf);
	}
	return rtf;
}

/**
 * Whole seconds left until `expiresAt`, clamped at 0. Pass `nowMs` (e.g. the
 * shared reactive clock's `now.current`) to make the result reactive;
 * defaults to `Date.now()`.
 */
export function remainingSeconds(expiresAt: Date | string, nowMs: number = Date.now()): number {
	return Math.max(0, Math.floor((new Date(expiresAt).getTime() - nowMs) / 1000));
}

/**
 * Format a remaining duration (in seconds) as a locale-aware relative time
 * string using Intl.RelativeTimeFormat.
 *
 * Buckets are floor-based — ≥1 day → days, ≥1 hour → hours, ≥1 minute →
 * minutes, otherwise seconds — so the label never overstates what's left
 * ("in 60 minutes" or "in 24 hours" can't appear) and the last minute counts
 * down every second. Callers render "Expired" themselves at 0.
 *
 * Examples (EN locale):
 *   259200 → "in 3 days"
 *   86399  → "in 23 hours"
 *   3599   → "in 59 minutes"
 *   45     → "in 45 seconds"
 */
export function formatTimeRemaining(seconds: number, locale: string): string {
	const rtf = getRtf(locale);
	const s = Math.max(0, Math.floor(seconds));
	if (s >= DAY) return rtf.format(Math.floor(s / DAY), 'day');
	if (s >= HOUR) return rtf.format(Math.floor(s / HOUR), 'hour');
	if (s >= MINUTE) return rtf.format(Math.floor(s / MINUTE), 'minute');
	return rtf.format(s, 'second');
}

const UNITS = [
	{ unit: 'day', seconds: DAY },
	{ unit: 'hour', seconds: HOUR },
	{ unit: 'minute', seconds: MINUTE }
] as const;

/**
 * Format a duration (in seconds) as a plain locale-aware length of time,
 * e.g. "10 minutes" or "2 days", via Intl.NumberFormat's unit style.
 *
 * Uses the largest unit that divides the duration exactly; when none does
 * (an operator-configured value like 12345 s), uses the largest unit ≥ 1 with
 * at most one decimal ("3.4 hours").
 */
export function formatDuration(seconds: number, locale: string): string {
	const s = Math.max(0, seconds);
	const exact = UNITS.find((u) => s >= u.seconds && s % u.seconds === 0);
	const chosen = exact ?? UNITS.find((u) => s >= u.seconds);
	const unit = chosen?.unit ?? 'second';
	const value = chosen ? s / chosen.seconds : s;
	return new Intl.NumberFormat(locale, {
		style: 'unit',
		unit,
		unitDisplay: 'long',
		maximumFractionDigits: 1
	}).format(value);
}
