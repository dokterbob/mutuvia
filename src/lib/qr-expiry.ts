// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Expiry presets for QR creation — the client's only vocabulary for
// requesting a non-default expiry. Isomorphic (no server secrets): the
// client renders labels from these keys, and `$lib/server/qr-expiry` is the
// only place a preset key is turned into an actual `expiresAt`. A raw number
// of seconds is never accepted from the client — see that module's
// `resolveExpiryPreset()`.

export type QrExpiryPresetKey = '1h' | '1d' | '3d' | '1w' | '30d' | 'never';

// Synthetic key for the operator-configured default, offered only when it
// doesn't exactly match one of the presets below (see `getExpiryOptions()`
// in `$lib/server/qr-expiry`).
export const DEFAULT_EXPIRY_KEY = 'default';

export const QR_EXPIRY_PRESET_SECONDS: Record<QrExpiryPresetKey, number | null> = {
	'1h': 3600,
	'1d': 86400,
	'3d': 259200,
	'1w': 604800,
	'30d': 2592000,
	never: null
};

export const QR_EXPIRY_PRESET_KEYS = Object.keys(QR_EXPIRY_PRESET_SECONDS) as QrExpiryPresetKey[];

/** One option the client can offer for an expiry `<select>`. */
export interface QrExpiryOption {
	key: string;
	seconds: number | null;
	isDefault: boolean;
}
