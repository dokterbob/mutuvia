// SPDX-License-Identifier: AGPL-3.0-or-later

import { config } from '$lib/config';

export function buildQrUrl(id: string): string {
	return `${config.appUrl}/accept/${id}`;
}
