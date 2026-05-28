// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Sentry from '@sentry/bun';

const dsn = process.env.PUBLIC_SENTRY_DSN;

if (dsn) {
	Sentry.init({
		dsn,
		tracesSampleRate: 1.0,
		enableLogs: true
	});
}
