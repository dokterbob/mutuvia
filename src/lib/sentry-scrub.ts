// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Pure, isomorphic PII scrubbing for Sentry events — shared by the client
// (src/hooks.client.ts) and server (src/instrumentation.server.ts)
// beforeSend/beforeSendTransaction hooks, so the scrubbing policy can't drift
// between the two, and so it's table-driven-testable without constructing a
// full Sentry Event/Transaction object.
//
// IMPORTANT: this is best-effort PATTERN MATCHING, not a guarantee. It
// redacts things that LOOK like emails/phone numbers/known dynamic-id URL
// shapes wherever this module was told to look — it cannot find PII in a
// shape nobody anticipated (e.g. a free-text error message that happens to
// contain someone's name, or a phone number formatted in a way the regex
// below doesn't recognise). Treat Sentry data as "reduced risk", not "safe to
// treat as public".
//
// Scope: ids in /accept/<id>, /send/<id> and /api/qr-status/<id>; the `dest`
// query param on /onboarding/otp (a phone number or email); phone
// numbers/emails anywhere else in free text (URLs, transaction names,
// breadcrumb data, span descriptions, extra/tags/contexts, exception
// messages, stack frame local variables, the top-level message/logentry,
// the Referer header); and request data that should never reach Sentry at
// all regardless of content — `request.cookies`, `request.data` (body), and
// the `Cookie`/`Authorization` request headers are stripped entirely, not
// just redacted. `user` is reduced to an opaque `id` only (email/username/
// ip_address dropped) — see scrubUser.
//
// Fixed at the source too, not just here: src/instrumentation.server.ts
// explicitly configures Sentry's `requestDataIntegration` (a DEFAULT
// integration for @sentry/bun/@sentry/node — see
// node_modules/@sentry/core/build/esm/integrations/requestdata.js's
// DEFAULT_INCLUDE, which has `cookies: true, data: true, headers: true` —
// i.e. request cookies and body are attached to every server-side event
// UNLESS explicitly turned off) with `include: { cookies: false, data: false
// }`, so that data never reaches an Event in the first place. The stripping
// here is defense-in-depth for any other path (e.g. manually attached data,
// or a future SDK/integration change) that might still populate those
// fields. `sendDefaultPii` is not set anywhere in this app (confirmed by
// grep) — it defaults to false, which is what keeps IP addresses off
// `user.ip_address` by default; `user` is reduced further still, below.
//
// Session replay: `networkDetailAllowUrls` (replayIntegration's own option)
// is left at its default of `[]` — see
// node_modules/@sentry-internal/replay/build/npm/esm/index.js — meaning
// replay never records network request/response bodies or headers for any
// URL. The generic navigation/fetch breadcrumbs replay DOES record (method,
// url, status, timing) go through the same scrubBreadcrumb as every other
// breadcrumb, below.

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

// Bounds on the recursive walk below: depth guarantees termination even on a
// circular object (depth is a monotonic counter, independent of object
// identity, so a cycle just hits the depth cap rather than looping forever);
// the key/item caps bound the cost of an unexpectedly huge extra/tags/
// contexts payload or stack-frame `vars` object.
const MAX_SCRUB_DEPTH = 4;
const MAX_SCRUB_ITEMS = 200;

/** Recursively scrubs string leaves in an arbitrary JSON-ish value (extra/tags/contexts/vars payloads). */
function scrubUnknownDeep(value: unknown, depth = 0): unknown {
	if (depth > MAX_SCRUB_DEPTH) return value;
	if (typeof value === 'string') return scrubString(value);
	if (Array.isArray(value)) {
		return value.slice(0, MAX_SCRUB_ITEMS).map((item) => scrubUnknownDeep(item, depth + 1));
	}
	if (value && typeof value === 'object') {
		const result: Record<string, unknown> = {};
		for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(
			0,
			MAX_SCRUB_ITEMS
		)) {
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

interface ScrubbableStackFrame {
	vars?: Record<string, unknown>;
	[key: string]: unknown;
}

interface ScrubbableExceptionValue {
	type?: string;
	value?: string;
	stacktrace?: { frames?: ScrubbableStackFrame[]; [key: string]: unknown };
	[key: string]: unknown;
}

function scrubExceptionValue(value: ScrubbableExceptionValue): ScrubbableExceptionValue {
	const result: ScrubbableExceptionValue = { ...value };
	if (typeof result.type === 'string') result.type = scrubString(result.type);
	if (typeof result.value === 'string') result.value = scrubString(result.value);
	if (result.stacktrace?.frames) {
		result.stacktrace = {
			...result.stacktrace,
			frames: result.stacktrace.frames.map((frame) =>
				frame?.vars
					? { ...frame, vars: scrubUnknownDeep(frame.vars) as Record<string, unknown> }
					: frame
			)
		};
	}
	return result;
}

/**
 * Reduces a Sentry `user` object to an opaque id only — drops email,
 * username, ip_address, and any other field a custom `setUser()` call might
 * have attached. Returns `undefined` when there's no usable id, signalling
 * the caller to drop `user` entirely rather than send an empty-but-present
 * object (which some Sentry UI surfaces render as "Unknown User" either
 * way, so dropping it is no loss).
 */
function scrubUser(user: Record<string, unknown>): Record<string, unknown> | undefined {
	const id = user.id;
	if (typeof id === 'string' || typeof id === 'number') {
		return { id };
	}
	return undefined;
}

const SENSITIVE_HEADER_NAMES = new Set(['cookie', 'authorization']);

interface ScrubbableRequest {
	url?: string;
	headers?: Record<string, string>;
	cookies?: unknown;
	data?: unknown;
	[key: string]: unknown;
}

function scrubRequest(request: ScrubbableRequest): ScrubbableRequest {
	const result: ScrubbableRequest = { ...request };
	// Never sent to Sentry at all, regardless of content — not just redacted.
	delete result.cookies;
	delete result.data;
	if (result.url) result.url = scrubString(result.url);
	if (result.headers) {
		const headers: Record<string, string> = {};
		for (const [key, value] of Object.entries(result.headers)) {
			const lower = key.toLowerCase();
			if (SENSITIVE_HEADER_NAMES.has(lower)) continue; // dropped, not scrubbed
			headers[key] = lower === 'referer' || lower === 'referrer' ? scrubString(value) : value;
		}
		result.headers = headers;
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
	request?: ScrubbableRequest;
	transaction?: string;
	message?: string;
	logentry?: { message?: string; params?: unknown[]; [key: string]: unknown };
	exception?: { values?: ScrubbableExceptionValue[] };
	contexts?: Record<string, unknown>;
	user?: Record<string, unknown>;
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
	if (event.request) {
		event.request = scrubRequest(event.request);
	}
	if (typeof event.transaction === 'string') {
		event.transaction = scrubString(event.transaction);
	}
	if (typeof event.message === 'string') {
		event.message = scrubString(event.message);
	}
	if (event.logentry) {
		const logentry = { ...event.logentry };
		if (typeof logentry.message === 'string') logentry.message = scrubString(logentry.message);
		if (Array.isArray(logentry.params)) {
			logentry.params = logentry.params.map((param) =>
				typeof param === 'string' ? scrubString(param) : param
			);
		}
		event.logentry = logentry;
	}
	if (event.exception?.values) {
		event.exception = {
			...event.exception,
			values: event.exception.values.map(scrubExceptionValue)
		};
	}
	if (event.contexts) {
		event.contexts = scrubUnknownDeep(event.contexts) as Record<string, unknown>;
	}
	if (event.user) {
		const scrubbed = scrubUser(event.user);
		if (scrubbed) {
			event.user = scrubbed;
		} else {
			delete event.user;
		}
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
