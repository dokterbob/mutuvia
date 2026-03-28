// SPDX-License-Identifier: AGPL-3.0-or-later

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	return {
		skipIntros: cookies.get('qr_skip_intros') === '1'
	};
};
