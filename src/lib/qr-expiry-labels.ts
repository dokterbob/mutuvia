// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Maps a `QrExpiryOption` (from `getExpiryOptions()`) to its localized
// label. Shared between the send and receive create forms so the Select's
// option text stays in one place.

import * as m from '$lib/paraglide/messages.js';
import { formatDuration } from '$lib/format-time';
import { DEFAULT_EXPIRY_KEY, type QrExpiryOption } from '$lib/qr-expiry';

// A Map (not a plain object) so an unexpected key like "toString" or
// "constructor" can never resolve to an inherited Object.prototype member —
// `LABELS.get(key)` is `undefined` for any key that wasn't explicitly set,
// full stop, unlike a bracket lookup on `{}`.
const LABELS = new Map<string, () => string>([
	['1h', m.qr_expiry_1h],
	['1d', m.qr_expiry_1d],
	['3d', m.qr_expiry_3d],
	['1w', m.qr_expiry_1w],
	['30d', m.qr_expiry_30d],
	['never', m.qr_expiry_never]
]);

/**
 * The label for one expiry option. The synthetic operator default (offered
 * only when `QR_TTL_SECONDS` / `REUSABLE_QR_TTL_SECONDS` matches no preset)
 * is labelled with its actual duration — e.g. "10 minutes" — rather than a
 * bare "Default" that says nothing about how long the QR will last.
 */
export function qrExpiryLabel(
	option: Pick<QrExpiryOption, 'key' | 'seconds'>,
	locale: string
): string {
	if (option.key === DEFAULT_EXPIRY_KEY) {
		return option.seconds === null ? m.qr_expiry_never() : formatDuration(option.seconds, locale);
	}
	return LABELS.get(option.key)?.() ?? option.key;
}
