// SPDX-License-Identifier: AGPL-3.0-or-later

import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const dest = url.searchParams.get('dest');
	const method = url.searchParams.get('method');
	if (!dest || (method !== 'phone' && method !== 'email')) {
		redirect(307, '/onboarding/phone');
	}
	return { otpDestination: dest, otpMethod: method as 'phone' | 'email' };
};
