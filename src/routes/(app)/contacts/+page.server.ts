// SPDX-License-Identifier: AGPL-3.0-or-later

import type { PageServerLoad } from './$types';
import { formatAmount } from '$lib/server/currency';
import { getContactBalances } from '$lib/server/balance';

export const load: PageServerLoad = async ({ locals }) => {
	const contacts = (await getContactBalances(locals.appUser!.id)).map((c) => ({
		id: c.id,
		name: c.name,
		balance: c.balance,
		formattedBalance: formatAmount(c.balance)
	}));
	return { contacts };
};
