// SPDX-License-Identifier: AGPL-3.0-or-later
// See https://svelte.dev/docs/kit/types#app.d.ts
/// <reference types="vite-plugin-pwa/client" />

import type { Session } from 'better-auth';
import type { auth } from '$lib/server/auth';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			session: Session | null;
			user: typeof auth.$Infer.Session.user | null;
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

	interface BeforeInstallPromptEvent extends Event {
		prompt(): Promise<{ outcome: 'accepted' | 'dismissed' }>;
	}

	interface WindowEventMap {
		beforeinstallprompt: BeforeInstallPromptEvent;
	}
}

export {};
