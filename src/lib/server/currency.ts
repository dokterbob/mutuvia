// SPDX-License-Identifier: AGPL-3.0-or-later

import { config } from '$lib/config';
import { getLocale } from '$lib/paraglide/runtime.js';

let cachedFractionDigits: number | null = null;
const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(locale: string): Intl.NumberFormat {
	let fmt = formatterCache.get(locale);
	if (!fmt) {
		fmt = new Intl.NumberFormat(locale, { style: 'currency', currency: config.unitCode });
		formatterCache.set(locale, fmt);
	}
	return fmt;
}

export function currencyFractionDigits(): number {
	if (cachedFractionDigits === null) {
		cachedFractionDigits =
			new Intl.NumberFormat('en', {
				style: 'currency',
				currency: config.unitCode
			}).resolvedOptions().maximumFractionDigits ?? 2;
	}
	return cachedFractionDigits;
}

export function formatAmount(amount: number): string {
	const value = amount / Math.pow(10, currencyFractionDigits());
	return getFormatter(getLocale()).format(value);
}
