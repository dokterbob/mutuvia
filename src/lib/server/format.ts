// SPDX-License-Identifier: AGPL-3.0-or-later

import { config } from '$lib/config';
import { getLocale } from '$lib/paraglide/runtime';

export function currencyFractionDigits(): number {
	return (
		new Intl.NumberFormat('en', {
			style: 'currency',
			currency: config.unitCode
		}).resolvedOptions().maximumFractionDigits ?? 2
	);
}

export function formatAmount(amount: number): string {
	const value = amount / Math.pow(10, currencyFractionDigits());
	return new Intl.NumberFormat(getLocale(), {
		style: 'currency',
		currency: config.unitCode
	}).format(value);
}
