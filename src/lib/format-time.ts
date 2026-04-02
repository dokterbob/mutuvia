// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Format a remaining duration (in seconds) as a locale-aware relative time string
 * using Intl.RelativeTimeFormat. Picks the largest applicable unit.
 *
 * Examples (EN locale):
 *   259200 → "in 3 days"
 *   5400   → "in 2 hours"
 *   90     → "in 2 minutes"
 *   45     → "in 45 seconds"
 */
const cache = new Map<string, Intl.RelativeTimeFormat>();

function getRtf(locale: string): Intl.RelativeTimeFormat {
	let rtf = cache.get(locale);
	if (!rtf) {
		rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'always', style: 'long' });
		cache.set(locale, rtf);
	}
	return rtf;
}

export function formatTimeRemaining(seconds: number, locale: string): string {
	const rtf = getRtf(locale);
	if (seconds >= 86400) {
		return rtf.format(Math.round(seconds / 86400), 'day');
	} else if (seconds >= 3600) {
		return rtf.format(Math.round(seconds / 3600), 'hour');
	} else if (seconds >= 60) {
		return rtf.format(Math.round(seconds / 60), 'minute');
	} else {
		return rtf.format(Math.max(seconds, 0), 'second');
	}
}
