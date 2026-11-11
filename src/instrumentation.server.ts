// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Sentry from '@sentry/bun';
import { parseSentryTracesSampleRate } from '$lib/sentry-config';
import { scrubSentryEvent, type ScrubbableSentryEvent } from '$lib/sentry-scrub';

const dsn = process.env.PUBLIC_SENTRY_DSN;

// Reads `process.env` directly rather than `$lib/config`/`$env/dynamic/*`,
// matching the existing PUBLIC_SENTRY_DSN line above: this file runs via
// SvelteKit's `experimental.instrumentation.server` hook, earlier than
// SvelteKit's own env modules are guaranteed to be ready — see
// svelte.config.js's comment on that option.
if (dsn) {
	Sentry.init({
		dsn,
		// Shared parser/default with src/hooks.client.ts and $lib/config's
		// sentryTracesSampleRate (used there only for the boot-time
		// validateConfig() check) — see src/lib/sentry-config.ts.
		tracesSampleRate: parseSentryTracesSampleRate(process.env.PUBLIC_SENTRY_TRACES_SAMPLE_RATE),
		enableLogs: true,
		// Shared with hooks.client.ts — see src/lib/sentry-scrub.ts for what
		// this redacts and why.
		beforeSend: (event) =>
			scrubSentryEvent(event as unknown as ScrubbableSentryEvent) as unknown as typeof event,
		beforeSendTransaction: (event) =>
			scrubSentryEvent(event as unknown as ScrubbableSentryEvent) as unknown as typeof event
	});
}
