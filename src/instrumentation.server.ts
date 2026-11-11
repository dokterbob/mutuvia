// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Sentry from '@sentry/bun';
import { parseSentryTracesSampleRate } from '$lib/sentry-config';
import { safeScrubSentryEvent, type ScrubbableSentryEvent } from '$lib/sentry-scrub';

const dsn = process.env.PUBLIC_SENTRY_DSN;

// Reads `process.env` directly rather than `$lib/config`/`$env/dynamic/*`,
// matching the existing PUBLIC_SENTRY_DSN line above: this file runs via
// SvelteKit's `experimental.instrumentation.server` hook, earlier than
// SvelteKit's own env modules are guaranteed to be ready — see
// svelte.config.js's comment on that option.
if (dsn) {
	Sentry.init({
		dsn,
		// @sentry/bun's DEFAULT integrations include requestDataIntegration()
		// with DEFAULT_INCLUDE = { cookies: true, data: true, headers: true,
		// query_string: true, url: true } — see
		// node_modules/@sentry/core/build/esm/integrations/requestdata.js —
		// meaning every server-side event otherwise gets the request's
		// cookies (the Better Auth session cookie) AND body (which, for an
		// OTP send/verify request, is the phone number/email/code itself)
		// attached by default. Re-declaring it here with `include` set
		// overrides the default instance (Sentry dedupes integrations by
		// name, user-provided wins — see filterDuplicates in
		// @sentry/core/build/esm/integration.js) so that data is never
		// collected in the first place. `ip: false` is already the default
		// here (gated on `sendDefaultPii`, which this app never sets), kept
		// explicit for clarity. src/lib/sentry-scrub.ts's scrubSentryEvent()
		// also strips cookies/data/Cookie/Authorization defensively, in case
		// any other code path (a future SDK change, a manually attached
		// extra) ever populates them.
		integrations: [
			Sentry.requestDataIntegration({ include: { cookies: false, data: false, ip: false } })
		],
		// Shared parser/default with src/hooks.client.ts and $lib/config's
		// sentryTracesSampleRate (used there only for the boot-time
		// validateConfig() check) — see src/lib/sentry-config.ts.
		tracesSampleRate: parseSentryTracesSampleRate(process.env.PUBLIC_SENTRY_TRACES_SAMPLE_RATE),
		enableLogs: true,
		// Shared with hooks.client.ts — see src/lib/sentry-scrub.ts for what
		// this redacts and why. Uses the fail-CLOSED wrapper: if scrubbing
		// itself throws, the event is dropped rather than risking it
		// reaching Sentry unscrubbed.
		beforeSend: (event) =>
			safeScrubSentryEvent(event as unknown as ScrubbableSentryEvent) as unknown as typeof event,
		beforeSendTransaction: (event) =>
			safeScrubSentryEvent(event as unknown as ScrubbableSentryEvent) as unknown as typeof event
	});
}
