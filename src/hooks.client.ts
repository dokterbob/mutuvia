// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Sentry from '@sentry/sveltekit';

const dsn = import.meta.env.PUBLIC_SENTRY_DSN;

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
