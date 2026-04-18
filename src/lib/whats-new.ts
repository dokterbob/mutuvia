// SPDX-License-Identifier: AGPL-3.0-or-later

import * as m from '$lib/paraglide/messages.js';

export interface WhatsNewEntry {
	version: string;
	content: () => string;
}

/**
 * Changelog entries ordered newest-first.
 *
 * To add a new release:
 * 1. Add message keys to all locale files in messages/*.json
 *    (whats_new_vX_Y_Z with \n-delimited bullet points)
 * 2. Add an entry here at the top of the array
 * 3. Bump version in package.json
 */
export const changelog: WhatsNewEntry[] = [{ version: '0.2.0', content: m.whats_new_v0_2_0 }];

/** Returns changelog entries the user has not yet seen. */
export function getUnseenEntries(
	lastSeenVersion: string | null,
	entries: WhatsNewEntry[] = changelog
): WhatsNewEntry[] {
	if (lastSeenVersion === null) return entries;
	const idx = entries.findIndex((e) => e.version === lastSeenVersion);
	if (idx === -1) return entries;
	return entries.slice(0, idx);
}
