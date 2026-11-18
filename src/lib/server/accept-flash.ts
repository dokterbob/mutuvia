// SPDX-License-Identifier: AGPL-3.0-or-later
//
// One-shot "you just accepted this QR" message, carried across the accept
// action's redirect to /home in a short-lived cookie and read (and deleted)
// by the Home page's load, which shows it as a toast. A cookie rather than a
// `?accepted=` param so a reload or a shared URL never repeats it.

import type { Cookies } from '@sveltejs/kit';
import { qrCookieOptions } from './qr-return';

export const ACCEPT_FLASH_COOKIE = 'qr_accepted_flash';
const MAX_AGE_SECONDS = 60;

export interface AcceptFlash {
	direction: 'send' | 'receive';
	name: string;
	amount: string;
}

export function setAcceptFlash(cookies: Cookies, flash: AcceptFlash): void {
	cookies.set(ACCEPT_FLASH_COOKIE, JSON.stringify(flash), qrCookieOptions(MAX_AGE_SECONDS));
}

export function consumeAcceptFlash(cookies: Cookies): AcceptFlash | null {
	const raw = cookies.get(ACCEPT_FLASH_COOKIE);
	if (raw === undefined) return null;
	cookies.delete(ACCEPT_FLASH_COOKIE, qrCookieOptions());
	try {
		const v = JSON.parse(raw) as Partial<AcceptFlash>;
		if (
			(v.direction === 'send' || v.direction === 'receive') &&
			typeof v.name === 'string' &&
			typeof v.amount === 'string'
		) {
			return { direction: v.direction, name: v.name, amount: v.amount };
		}
	} catch {
		// malformed — ignore
	}
	return null;
}
