// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Delegates to the per-provider settlement implementation selected by
// `config.dbProvider`, mirroring how `./db.ts` delegates to `./db.sqlite.ts`
// or `./db.pg.ts`. Only the selected module is ever imported, so the other
// provider's driver is never touched.

import { config } from '$lib/config';
import type { SettleResult } from './settlement-types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mod: any =
	config.dbProvider === 'pg'
		? await import('./settlement.pg')
		: await import('./settlement.sqlite');

/**
 * Atomically claims and settles a one-time QR accept. See
 * settlement.sqlite.ts / settlement.pg.ts for the implementation.
 */
export async function settleOneTimeAccept(
	qrId: string,
	acceptingUserId: string
): Promise<SettleResult> {
	return mod.settleOneTimeAccept(qrId, acceptingUserId);
}

/**
 * Atomically settles a payment against a reusable payment request. See
 * settlement.sqlite.ts / settlement.pg.ts for the implementation.
 */
export async function settleReusable(
	paymentRequestId: string,
	scannerId: string,
	amount: number
): Promise<SettleResult> {
	return mod.settleReusable(paymentRequestId, scannerId, amount);
}
