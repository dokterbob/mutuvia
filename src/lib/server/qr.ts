// SPDX-License-Identifier: AGPL-3.0-or-later

import { config } from '$lib/config';

export function buildPaymentRequestUrl(id: string): string {
	return `${config.appUrl}/accept/${id}`;
}

export function buildReusableUrl(id: string): string {
	return `${config.appUrl}/send/${id}`;
}
