// SPDX-License-Identifier: AGPL-3.0-or-later

import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { auth } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	if (env.E2E !== 'true') error(404);

	const identifier = url.searchParams.get('identifier');
	if (!identifier) error(400, 'identifier required');

	const ctx = await auth.$context;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const otp = (ctx as any).test?.getOTP(identifier) as string | undefined;
	if (!otp) error(404, 'OTP not found');

	return json({ otp });
};
