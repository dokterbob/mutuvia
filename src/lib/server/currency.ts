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

export function formatAmount(amount: number, locale?: string): string {
	const digits = currencyFractionDigits();
	const value = amount / Math.pow(10, digits);
	try {
		return getFormatter(locale ?? getLocale()).format(value);
	} catch {
		// getLocale() relies on Paraglide's AsyncLocalStorage, which may not be
		// set outside a full request context. Return a locale-independent
		// representation so callers never need to handle a thrown error.
		return `${value.toFixed(digits)} ${config.unitCode}`;
	}
}
