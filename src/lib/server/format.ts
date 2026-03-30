// SPDX-License-Identifier: AGPL-3.0-or-later

import { config } from '$lib/config';

export function formatAmount(amount: number): string {
	const dp = config.decimalPlaces;
	const value = amount / Math.pow(10, dp);
	const formatted = value.toFixed(dp);
	return `${config.unitSymbol}\u00A0${formatted}`;
}
