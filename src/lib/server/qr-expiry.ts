// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Single source of truth for "is this QR expired?" (used by every route and
// settlement path that reads `paymentRequests.expiresAt`) and for turning a
// client-submitted expiry preset key into an `expiresAt` value. A payment
// request with `expiresAt: null` never expires ("never" — the only way a
// *reusable* QR can be created, and the only pre-existing shape in the DB).
//
// Boundary: `expiresAt <= now` is expired. Equivalently, "not expired" is
// `expiresAt === null || expiresAt > now`. Every check below — JS and SQL —
// uses that exact boundary so a QR can never be "active" in one place and
// "expired" in another at the same instant.

import { isNull, gt, or, type AnyColumn, type SQL } from 'drizzle-orm';
import { config } from '$lib/config';
import {
	QR_EXPIRY_PRESET_KEYS,
	QR_EXPIRY_PRESET_SECONDS,
	DEFAULT_EXPIRY_KEY,
	type QrExpiryOption
} from '$lib/qr-expiry';

/** JS-side expiry check — see module doc for the boundary. */
export function isExpired(expiresAt: Date | null, now: Date = new Date()): boolean {
	return expiresAt !== null && expiresAt <= now;
}

/**
 * The SQL equivalent of `!isExpired(...)`, for a `WHERE`/claim condition on
 * an `expiresAt` column: `expiresAt IS NULL OR expiresAt > now`. `gt` (not
 * `gte`) is what gives this the same `<=` boundary as `isExpired()` above.
 */
export function notExpiredCondition(expiresAtColumn: AnyColumn, now: Date): SQL {
	return or(isNull(expiresAtColumn), gt(expiresAtColumn, now)) as SQL;
}

function defaultSecondsFor(reusable: boolean): number | null {
	return reusable ? config.reusableQrTtlSeconds : config.qrTtlSeconds;
}

/**
 * The presets a client may choose from for this QR kind, filtered by
 * `QR_MAX_TTL_SECONDS` (removes presets above it, and "never" entirely) and
 * by `reusable` ("never" is reusable-only). If the operator's configured
 * default doesn't exactly match a surviving preset, a synthetic `"default"`
 * option is appended so the operator's own default is always selectable and
 * always marked `isDefault` — see AGENTS.md task notes for why this beats
 * silently picking the nearest preset.
 */
export function getExpiryOptions(reusable: boolean): QrExpiryOption[] {
	const max = config.qrMaxTtlSeconds;
	const defaultSeconds = defaultSecondsFor(reusable);

	const presets: QrExpiryOption[] = QR_EXPIRY_PRESET_KEYS.filter((key) => {
		if (key === 'never') return reusable && max === null;
		return max === null || QR_EXPIRY_PRESET_SECONDS[key]! <= max;
	}).map((key) => {
		const seconds = QR_EXPIRY_PRESET_SECONDS[key];
		return { key, seconds, isDefault: seconds === defaultSeconds };
	});

	if (presets.some((p) => p.isDefault)) return presets;

	return [...presets, { key: DEFAULT_EXPIRY_KEY, seconds: defaultSeconds, isDefault: true }];
}

export type ResolveExpiryResult =
	| { ok: true; expiresAt: Date | null }
	| { ok: false; error: string };

function toExpiresAt(seconds: number | null): Date | null {
	return seconds === null ? null : new Date(Date.now() + seconds * 1000);
}

/**
 * Turns a client-submitted preset key into an `expiresAt`. A missing key
 * (the field wasn't submitted at all, e.g. JS-disabled client or an older
 * caller) silently falls back to the operator's configured default — that's
 * not the "silent fallback" the task description warns against, which is
 * about an explicitly-submitted but invalid key. A key that IS submitted
 * and doesn't name one of `getExpiryOptions(reusable)`'s options (unknown
 * key, "never" on a one-time QR, a preset above `QR_MAX_TTL_SECONDS`) is
 * rejected outright.
 */
export function resolveExpiryPreset(
	presetKeyRaw: FormDataEntryValue | null,
	reusable: boolean
): ResolveExpiryResult {
	if (presetKeyRaw === null || presetKeyRaw === '') {
		return { ok: true, expiresAt: toExpiresAt(defaultSecondsFor(reusable)) };
	}
	if (typeof presetKeyRaw !== 'string') {
		return { ok: false, error: 'Invalid expiry selection.' };
	}
	const match = getExpiryOptions(reusable).find((o) => o.key === presetKeyRaw);
	if (!match) {
		return { ok: false, error: 'Invalid expiry selection.' };
	}
	return { ok: true, expiresAt: toExpiresAt(match.seconds) };
}
