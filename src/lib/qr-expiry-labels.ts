// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Maps a `QrExpiryOption.key` (from `getExpiryOptions()`) to its localized
// label. Shared between the send and receive create forms so the Select's
// option text stays in one place.

import * as m from '$lib/paraglide/messages.js';
import { DEFAULT_EXPIRY_KEY } from '$lib/qr-expiry';

const LABELS: Record<string, () => string> = {
	'1h': m.qr_expiry_1h,
	'1d': m.qr_expiry_1d,
	'3d': m.qr_expiry_3d,
	'1w': m.qr_expiry_1w,
	'30d': m.qr_expiry_30d,
	never: m.qr_expiry_never,
	[DEFAULT_EXPIRY_KEY]: m.qr_expiry_default
};

export function qrExpiryLabel(key: string): string {
	return LABELS[key]?.() ?? key;
}
