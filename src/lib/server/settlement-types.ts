// SPDX-License-Identifier: AGPL-3.0-or-later

/** Shared result shape for both settlement paths, on both DB providers. */
export type SettleResult =
	| { ok: true; txId: string }
	| { ok: false; status: number; error: string };
