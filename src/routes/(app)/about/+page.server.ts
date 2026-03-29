// SPDX-License-Identifier: AGPL-3.0-or-later

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	return {
		appName: process.env.PUBLIC_APP_NAME || 'Mutuvia',
		communityDocUrl: process.env.PUBLIC_COMMUNITY_DOC_URL || ''
	};
};
