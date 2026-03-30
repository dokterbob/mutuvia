// SPDX-License-Identifier: AGPL-3.0-or-later

import type { PageServerLoad } from './$types';
import { config } from '$lib/config';

export const load: PageServerLoad = async () => {
	return {
		appName: config.appName,
		communityDocUrl: config.communityDocUrl
	};
};
