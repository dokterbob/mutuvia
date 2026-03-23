// SPDX-License-Identifier: AGPL-3.0-or-later

import { createAuthClient } from 'better-auth/svelte';
import { phoneNumberClient, emailOTPClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
	plugins: [phoneNumberClient(), emailOTPClient()]
});
