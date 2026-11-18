// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Masks all but the last two characters of a phone number for logging.
 * Used wherever a phone number must appear in a server log (e.g. Prelude
 * verification failures) — never log a full phone number.
 *
 * Handles short/odd inputs gracefully: nothing is masked if there's nothing
 * to hide (0-2 characters), and empty/nullish input is returned as-is.
 */
export function maskPhone(phone: string | null | undefined): string {
	if (!phone) return phone ?? '';
	const visibleCount = Math.min(2, phone.length);
	const maskedCount = phone.length - visibleCount;
	return '*'.repeat(maskedCount) + phone.slice(phone.length - visibleCount);
}
