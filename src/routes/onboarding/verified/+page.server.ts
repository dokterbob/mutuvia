// SPDX-License-Identifier: AGPL-3.0-or-later

import type { PageServerLoad } from './$types';
import { QR_SKIP_INTROS_COOKIE } from '$lib/server/qr-return';

export const load: PageServerLoad = async ({ cookies }) => {
	return {
		skipIntros: cookies.get(QR_SKIP_INTROS_COOKIE) === '1'
	};
};
