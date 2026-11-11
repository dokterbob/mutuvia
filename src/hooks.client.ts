// SPDX-License-Identifier: AGPL-3.0-or-later

import { registerSW } from 'virtual:pwa-register';
import * as Sentry from '@sentry/sveltekit';
import { env } from '$env/dynamic/public';
import { parseSentryTracesSampleRate } from '$lib/sentry-config';
import { scrubSentryEvent, type ScrubbableSentryEvent } from '$lib/sentry-scrub';

// Register the service worker for offline support and PWA updates.
// `immediate: false` defers registration until after the load event, avoiding a
// Chrome "Receiving end does not exist" runtime error caused by Workbox's auto-update
// messaging channel opening before the SW is fully activated.
registerSW({ immediate: false });

const dsn = env.PUBLIC_SENTRY_DSN;

// The feedback widget injects its own <style> tags via plain DOM APIs
// (document.createElement('style')) rather than through Svelte's compiled
// output, so SvelteKit's automatic per-request nonce never reaches them —
// under this app's CSP (style-src 'self', no 'unsafe-inline') they'd
// otherwise be silently blocked. Sentry's own `styleNonce` option sets the
// nonce attribute on those tags itself; src/app.html exposes the same
// per-request nonce used in the CSP header via a <meta> tag for exactly
// this. Falls back to undefined if the meta tag is missing for some reason
// (e.g. an unexpected app.html change) — feedbackIntegration treats that the
// same as not passing the option at all.
const cspNonce =
	document.querySelector('meta[name="csp-nonce"]')?.getAttribute('content') ?? undefined;

if (dsn) {
	Sentry.init({
		dsn,
		tunnel: '/sentry-tunnel',
		integrations: [
			Sentry.replayIntegration({
				// Session replay would otherwise capture every phone/email the
				// user types (sign-in, settings) and every amount/name on
				// screen — mask it all rather than try to allowlist what's
				// safe. Media (camera preview while scanning a QR) is blocked
				// outright, not just masked.
				maskAllText: true,
				maskAllInputs: true,
				blockAllMedia: true
			}),
			Sentry.feedbackIntegration({
				colorScheme: 'system',
				autoInject: true,
				enableScreenshot: true,
				styleNonce: cspNonce
			})
		],
		// Shared parser/default with src/instrumentation.server.ts and
		// $lib/config's sentryTracesSampleRate (used there only for the
		// boot-time validateConfig() check) — see src/lib/sentry-config.ts.
		tracesSampleRate: parseSentryTracesSampleRate(env.PUBLIC_SENTRY_TRACES_SAMPLE_RATE),
		replaysSessionSampleRate: 0.1,
		replaysOnErrorSampleRate: 1.0,
		enableLogs: true,
		// Shared with instrumentation.server.ts — see src/lib/sentry-scrub.ts
		// for what this redacts and why (ids in /accept, /send,
		// /api/qr-status; `dest` on /onboarding/otp; phone numbers/emails in
		// free text).
		beforeSend: (event) =>
			scrubSentryEvent(event as unknown as ScrubbableSentryEvent) as unknown as typeof event,
		beforeSendTransaction: (event) =>
			scrubSentryEvent(event as unknown as ScrubbableSentryEvent) as unknown as typeof event
	});
}

export const handleError = Sentry.handleErrorWithSentry();
