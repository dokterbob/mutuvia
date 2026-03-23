// SPDX-License-Identifier: AGPL-3.0-or-later
// See https://svelte.dev/docs/kit/types#app.d.ts

import type { Session, User } from 'better-auth';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			session: Session | null;
			user: User | null;
			appUser: {
				id: string;
				betterAuthUserId: string;
				displayName: string;
				sendConsentAt: Date | null;
				createdAt: Date;
			} | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
