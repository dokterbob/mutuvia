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

// The feedback widget (Sentry.feedbackIntegration) is deliberately NOT
// registered — verified in a real browser (not assumed) that it cannot work
// under this app's CSP:
//
// It injects its own <style> elements via plain DOM APIs
// (document.createElement('style'); see
// node_modules/@sentry-internal/feedback/build/npm/esm/index.js's
// createActorStyles/createDialogStyles/createScreenshotInputStyles), which
// Sentry's own `styleNonce` option can set a `nonce="..."` attribute on. The
// nonce VALUE is readable correctly client-side — via the `.nonce` IDL
// PROPERTY of SvelteKit's own hydration <script nonce="..."> tag
// (`document.querySelector('script[nonce]')?.nonce`; NEVER via a `<meta>`
// tag or `getAttribute('nonce')`, both of which republish it as a readable
// content attribute and defeat the browser's deliberate nonce-hiding — a
// previous version of this file did that via a `<meta name="csp-nonce">` in
// src/app.html; do not reintroduce it) — but that value is never actually
// AUTHORIZED by the `style-src` directive this app sends: SvelteKit only
// ever adds a `nonce-...` source to `style-src` when ITS OWN SSR output
// renders an inline `<style>` tag (`Csp#add_style` in
// @sveltejs/kit/src/runtime/server/page/csp.js) — and in a production
// build, Vite extracts every Svelte component's styles into the external
// stylesheet rather than inlining them, so that never happens here. CSP
// nonces are directive-scoped (a nonce authorized for `script-src` does
// nothing for `style-src`), so the widget's injected `<style>` tags are
// blocked (`style-src-elem` violations) and render completely unstyled
// regardless of `styleNonce`. Confirmed via Playwright in a real browser
// against the built server.
//
// Re-enabling this widget would need one of: (a) sha256-hash-allowlisting
// its exact, version-pinned injected CSS as static `style-src`/
// `style-src-elem` sources (same pinning discipline as
// src/lib/wasm-integrity.test.ts, but across 3+ style-generating functions
// in a third-party package — meaningful ongoing maintenance), or (b) adding
// 'unsafe-inline' to style-src (weakens the CSP for every inline <style>
// element, not just this widget's). Neither is implemented here — left as
// an explicit choice for a future PR, not silently worked around.
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
