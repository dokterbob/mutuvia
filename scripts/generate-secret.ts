// SPDX-License-Identifier: AGPL-3.0-or-later
// Generates a cryptographically secure secret suitable for BETTER_AUTH_SECRET
// (min 32 chars — see validateConfig() in src/lib/config.ts).

import { randomBytes } from 'node:crypto';

export function generateSecret(): string {
	return randomBytes(32).toString('base64url');
}

if (import.meta.main) {
	console.log(generateSecret());
}
