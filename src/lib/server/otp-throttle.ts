// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Delegates to the per-provider throttle implementation selected by
// `config.dbProvider`, mirroring settlement.ts.

import { config } from '$lib/config';
import type { ThrottleResult } from './otp-throttle-types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mod: any =
	config.dbProvider === 'pg'
		? await import('./otp-throttle.pg')
		: await import('./otp-throttle.sqlite');

/**
 * Atomically checks and records one OTP-send attempt for `destination`
 * (already normalized — E.164 phone or lowercased/trimmed email; see
 * normalizeOtpDestination in auth.ts). Returns `{ok:false, retryAfterSeconds}`
 * without recording anything if either the short (3/10min) or long (10/day)
 * window is already at its limit. See otp-throttle.sqlite.ts / otp-throttle.pg.ts
 * for the atomicity story on each provider.
 */
export async function checkAndRecordOtpSend(destination: string): Promise<ThrottleResult> {
	return mod.checkAndRecordOtpSend(destination);
}
