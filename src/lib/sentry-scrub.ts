// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Pure, isomorphic PII scrubbing for Sentry events — shared by the client
// (src/hooks.client.ts) and server (src/instrumentation.server.ts)
// beforeSend/beforeSendTransaction hooks, so the scrubbing policy can't drift
// between the two, and so it's table-driven-testable without constructing a
// full Sentry Event/Transaction object.
//
// Scope, per the security-hardening plan: ids in /accept/<id>, /send/<id> and
// /api/qr-status/<id>; the `dest` query param on /onboarding/otp (a phone
// number or email); and phone numbers/emails appearing anywhere else in free
// text (URLs, transaction names, breadcrumb data, span descriptions,
// extra/tags, the Referer header).

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Loosely formatted phone numbers: optional leading '+', then digits with
// optional separators (spaces, hyphens, dots, parens), at least 7 digits
// total. Deliberately wide — a false positive only redacts a harmless numeric
// string in telemetry (e.g. an order id), which costs nothing; a missed real
// phone number costs a user's privacy.
const PHONE_PATTERN = /\+?\d[\d().\- ]{5,}\d/g;

const DYNAMIC_ID_SEGMENTS: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
	{ pattern: /\/accept\/[A-Za-z0-9_-]+/g, replacement: '/accept/[id]' },
	{ pattern: /\/send\/[A-Za-z0-9_-]+/g, replacement: '/send/[id]' },
	{ pattern: /\/api\/qr-status\/[A-Za-z0-9_-]+/g, replacement: '/api/qr-status/[id]' }
];

/** Replaces email addresses and phone-shaped numbers anywhere in free text. */
export function redactContactInfo(text: string): string {
	return text.replace(EMAIL_PATTERN, '[redacted-email]').replace(PHONE_PATTERN, '[redacted-phone]');
}

/** Replaces the dynamic id segment of /accept/<id>, /send/<id> and /api/qr-status/<id> wherever they appear. */
export function redactDynamicIds(text: string): string {
	let result = text;
	for (const { pattern, replacement } of DYNAMIC_ID_SEGMENTS) {
		result = result.replace(pattern, replacement);
	}
	return result;
}

/**
 * Strips the `dest` query param (a phone number or email) from a
 * /onboarding/otp URL — stripped entirely, not just redacted, because the
 * param name itself is only ever used for this one destination value.
 * Works on both absolute and relative URL strings; returns the input
 * unchanged if it isn't a /onboarding/otp URL or has no `dest` param.
 */
export function stripOtpDestParam(raw: string): string {
	if (!raw.includes('/onboarding/otp')) return raw;
	try {
		const url = new URL(raw, 'https://placeholder.invalid');
		if (!url.pathname.startsWith('/onboarding/otp') || !url.searchParams.has('dest')) {
			return raw;
		}
		url.searchParams.delete('dest');
		const isAbsolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
		return isAbsolute
			? `${url.origin}${url.pathname}${url.search}${url.hash}`
			: `${url.pathname}${url.search}${url.hash}`;
	} catch {
		return raw;
	}
}

/** Scrubs one arbitrary string value: URLs, transaction names, span descriptions, free text. */
export function scrubString(text: string): string {
	return redactContactInfo(redactDynamicIds(stripOtpDestParam(text)));
}

const MAX_SCRUB_DEPTH = 4;

/** Recursively scrubs string leaves in an arbitrary JSON-ish value (extra/tags payloads). */
function scrubUnknownDeep(value: unknown, depth = 0): unknown {
	if (depth > MAX_SCRUB_DEPTH) return value;
	if (typeof value === 'string') return scrubString(value);
	if (Array.isArray(value)) return value.map((item) => scrubUnknownDeep(item, depth + 1));
	if (value && typeof value === 'object') {
		const result: Record<string, unknown> = {};
		for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
			result[key] = scrubUnknownDeep(item, depth + 1);
		}
		return result;
	}
	return value;
}

interface ScrubbableBreadcrumb {
	message?: string;
	data?: Record<string, unknown>;
	[key: string]: unknown;
}

function scrubBreadcrumb(breadcrumb: ScrubbableBreadcrumb): ScrubbableBreadcrumb {
	let result = breadcrumb;
	const data = breadcrumb.data;
	if (data && typeof data === 'object') {
		const scrubbedData = { ...data };
		for (const key of ['url', 'to', 'from']) {
			const value = scrubbedData[key];
			if (typeof value === 'string') scrubbedData[key] = scrubString(value);
		}
		result = { ...result, data: scrubbedData };
	}
	if (typeof result.message === 'string') {
		result = { ...result, message: scrubString(result.message) };
	}
	return result;
}

/**
 * Minimal shape of the fields this module touches on a Sentry
 * ErrorEvent/TransactionEvent — kept loose (rather than importing the full
 * `@sentry/core` Event type) so this stays a plain, isomorphic, easily
 * unit-tested module. Callers pass the real Sentry event object; TypeScript's
 * structural typing accepts it as long as these fields line up, which they do
 * for both ErrorEvent and TransactionEvent.
 */
export interface ScrubbableSentryEvent {
	request?: { url?: string; headers?: Record<string, string> };
	transaction?: string;
	breadcrumbs?: ScrubbableBreadcrumb[];
	spans?: Array<{ description?: string; [key: string]: unknown }>;
	extra?: Record<string, unknown>;
	tags?: Record<string, unknown>;
	[key: string]: unknown;
}

/**
 * Scrubs one Sentry event/transaction in place (and returns it) — the shared
 * body of both beforeSend and beforeSendTransaction. Never drops the event
 * (returns it, never null/undefined) — scrubbing failures should degrade to
 * "less redacted" being caught by other layers, not to losing the report.
 */
export function scrubSentryEvent<T extends ScrubbableSentryEvent>(event: T): T {
	if (event.request?.url) {
		event.request.url = scrubString(event.request.url);
	}
	if (event.request?.headers) {
		for (const key of Object.keys(event.request.headers)) {
			if (key.toLowerCase() === 'referer' || key.toLowerCase() === 'referrer') {
				event.request.headers[key] = scrubString(event.request.headers[key]);
			}
		}
	}
	if (typeof event.transaction === 'string') {
		event.transaction = scrubString(event.transaction);
	}
	if (Array.isArray(event.breadcrumbs)) {
		event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb);
	}
	if (Array.isArray(event.spans)) {
		event.spans = event.spans.map((span) =>
			typeof span?.description === 'string'
				? { ...span, description: scrubString(span.description) }
				: span
		);
	}
	if (event.extra) {
		event.extra = scrubUnknownDeep(event.extra) as Record<string, unknown>;
	}
	if (event.tags) {
		const scrubbedTags: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(event.tags)) {
			scrubbedTags[key] = typeof value === 'string' ? scrubString(value) : value;
		}
		event.tags = scrubbedTags;
	}
	return event;
}
