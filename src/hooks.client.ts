// SPDX-License-Identifier: AGPL-3.0-or-later

import { registerSW } from 'virtual:pwa-register';
import * as Sentry from '@sentry/sveltekit';
import { env } from '$env/dynamic/public';

// Register the service worker for offline support and PWA updates.
// `immediate: true` triggers registration without waiting for the load event,
// which improves first-install speed.
// immediate: false avoids a Chrome "Receiving end does not exist" runtime error
// that occurs when the SW messaging channel is opened before the SW is activated.
registerSW({ immediate: false });

const dsn = env.PUBLIC_SENTRY_DSN;

if (dsn) {
	Sentry.init({
		dsn,
		tunnel: '/sentry-tunnel',
		integrations: [
			Sentry.replayIntegration(),
			Sentry.feedbackIntegration({
				colorScheme: 'system',
				autoInject: true,
				enableScreenshot: true
			})
		],
		tracesSampleRate: 1.0,
		replaysSessionSampleRate: 0.1,
		replaysOnErrorSampleRate: 1.0,
		enableLogs: true
	});
}

export const handleError = Sentry.handleErrorWithSentry();
