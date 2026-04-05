// SPDX-License-Identifier: AGPL-3.0-or-later

import * as m from '$lib/paraglide/messages.js';
import { baseLocale } from '$lib/paraglide/runtime.js';
import { config } from '$lib/config';
import { formatAmount } from './currency';

export function shareText(amount: number, note: string | null): string {
	const locale = baseLocale;
	const formatted = formatAmount(amount, locale);
	const appName = config.appName;
	return note?.trim()
		? m.qr_share_text_with_note({ amount: formatted, appName, note: note.trim() }, { locale })
		: m.qr_share_text({ amount: formatted, appName }, { locale });
}
