// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Shared strict amount parser for every user-submitted amount (send/receive
// QR creation, reusable payments). Replaces three hand-rolled parseFloat-based
// parsers that each independently accepted exponential notation ("1e9"),
// "Infinity", "10abc", and unbounded values, and used floating-point
// multiplication (`floatAmount * 10 ** dp`) to convert to minor units — a
// precision hazard for a ledger that must only ever store exact integers.
//
// All three current call sites submit amounts from an `<input type="number">`
// (or a hidden input that mirrors one), whose value is always serialized with
// "." as the decimal separator regardless of the browser's locale — so a
// comma decimal separator (e.g. "1,50") was never a legitimate input and is
// intentionally rejected here rather than guessed at.

import { config } from '$lib/config';

// Generous for any real currency amount (the default max transaction amount
// is 9 digits) while still rejecting pathologically long strings before they
// ever reach the regex engine or Number().
const MAX_INPUT_LENGTH = 32;

/**
 * Parses a user-submitted amount string into minor units (e.g. cents).
 *
 * Accepts only `\d+` or `\d+.\d{1,fractionDigits}` after trimming whitespace
 * — no sign, no exponent, no leading/trailing decimal point, no thousands or
 * comma separators. The result must be a positive safe integer no greater
 * than `config.maxTransactionAmount`.
 *
 * Returns `null` for anything else, including non-string `FormData` values
 * (e.g. a `File`, or `null` for a missing field).
 */
export function parseAmount(input: unknown, fractionDigits: number): number | null {
	if (typeof input !== 'string') return null;

	const trimmed = input.trim();
	if (trimmed.length === 0 || trimmed.length > MAX_INPUT_LENGTH) return null;

	const pattern =
		fractionDigits > 0 ? new RegExp(`^\\d+(?:\\.\\d{1,${fractionDigits}})?$`) : /^\d+$/;
	if (!pattern.test(trimmed)) return null;

	// Integer arithmetic only: build the minor-unit digit string directly
	// instead of `Number(trimmed) * 10 ** fractionDigits`, which can mis-round
	// for values whose decimal representation isn't exact in binary floating
	// point (e.g. 19.99 * 100 === 1998.9999999999998 before rounding).
	const [wholePart, fractionPart = ''] = trimmed.split('.');
	const minorDigits = wholePart + fractionPart.padEnd(fractionDigits, '0');
	// Strip leading zeros (keeping at least one digit) so e.g. "05.00" and
	// "5.00" parse to the same value.
	const normalized = minorDigits.replace(/^0+(?=\d)/, '');

	const amount = Number(normalized);
	if (!Number.isSafeInteger(amount) || amount <= 0) return null;
	if (amount > config.maxTransactionAmount) return null;

	return amount;
}
