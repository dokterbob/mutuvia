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
// shapes/known sensitive query-param keys wherever a string appears in the
// event — it cannot find PII in a shape nobody anticipated (e.g. a free-text
// error message that happens to contain someone's name, or a phone number
// formatted in a way the regexes below don't recognise). Treat Sentry data
// as "reduced risk", not "safe to treat as public".
//
// DESIGN (review round 2): this module used to enumerate specific fields to
// scrub (request.url, breadcrumbs, exception.value, ...) one at a time —
// every round of review found another field (span.data, contexts.trace,
// stack-frame vars, ...) that had been missed, because enumeration can only
// ever close the INSTANCE of a bug, not the CLASS. It's inverted instead:
// `scrubValueDeep` walks the ENTIRE event, recursively, and runs `scrubString`
// over every string value it finds, anywhere, at any depth — with a short
// EXEMPT_KEYS allowlist of structural fields that must survive byte-for-byte
// (ids Sentry uses for grouping/correlation, timestamps, release/environment/
// platform/sdk metadata, stack-frame file/line info) rather than a growing
// list of fields to remember to scrub. A new field Sentry adds next month is
// covered automatically; only a field that happens to share a name with
// something in EXEMPT_KEYS could ever be missed, and that list is reviewed
// deliberately, not accumulated by trial and error.
//
// On top of that blanket pass, a few fields are handled structurally (not
// just string-redacted, but DELETED or REPLACED) because partial redaction
// isn't enough for them:
//   - `request.cookies` / `request.data` (the request body — which, for an
//     OTP request, is the phone number/email/code itself) are deleted
//     entirely, as are the `Cookie`/`Authorization` request headers.
//   - `user` is reduced to an opaque `id` only (dropping email/username/
//     ip_address, and anything else a custom `setUser()` call attached) — or
//     dropped entirely if there's no usable id.
//
// Fixed at the source too, not just here: src/instrumentation.server.ts
// explicitly configures Sentry's `requestDataIntegration` (a DEFAULT
// integration for @sentry/bun/@sentry/node that otherwise attaches request
// cookies and body to every server-side event) with
// `include: { cookies: false, data: false }`, so that data never reaches an
// Event in the first place — the deletion above is defense-in-depth for any
// other path that might still populate those fields. `sendDefaultPii` is not
// set anywhere in this app (confirmed by grep), which is what keeps IP
// addresses off `user.ip_address` by default.
//
// Session replay: `networkDetailAllowUrls` (replayIntegration's own option)
// is left at its default of `[]` — see
// node_modules/@sentry-internal/replay/build/npm/esm/index.js — meaning
// replay never records network request/response bodies or headers for any
// URL. The generic navigation/fetch breadcrumbs replay DOES record (method,
// url, status, timing) go through the same blanket walk as everything else.

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// Two deliberately NARROW phone patterns, replacing a single loose one that
// matched ISO-8601 date/time fragments and version strings as "phone
// numbers" (e.g. "2026-11-11" or "10.46.0") — see review round 2, finding 4.
//
// 1. E.164 — the format this app actually stores/logs phone numbers in
//    (see $lib/config's phoneCountryAllowlist / libphonenumber-js usage):
//    a leading '+' is a strong, rare signal that real dates/uuids never
//    produce, so the middle section can stay loose (international numbers
//    are written with varying grouping, e.g. "+31 6 12345678").
const E164_PHONE_PATTERN = /\+\d[\d().\- ]{5,}\d/g;
// 2. A human-typed grouped local number (e.g. "555-123-4567",
//    "(555) 123-4567") — requires the EXACT 3-3-4 digit grouping, which an
//    ISO date (4-2-2) or a UUID segment (8-4-4-4-12, and never pure digits
//    throughout) does not produce, unlike the old open-ended pattern. Two
//    alternatives rather than one `\(?...\)?...\b` pattern: a parenthesised
//    area code is its own unambiguous delimiter (no `\b` needed, and
//    needing one would wrongly exclude the opening paren from the match
//    when preceded by whitespace/another non-word character), while the
//    unparenthesised form still needs `\b` on both ends to avoid matching
//    the tail of a longer digit run.
const GROUPED_PHONE_PATTERN = /\(\d{3}\)[-.\s]\d{3}[-.\s]\d{4}|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g;

const DYNAMIC_ID_SEGMENTS: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
	{ pattern: /\/accept\/[A-Za-z0-9_-]+/g, replacement: '/accept/[id]' },
	{ pattern: /\/send\/[A-Za-z0-9_-]+/g, replacement: '/send/[id]' },
	{ pattern: /\/api\/qr-status\/[A-Za-z0-9_-]+/g, replacement: '/api/qr-status/[id]' }
];

// Query-parameter keys whose VALUE is dropped entirely wherever they appear,
// regardless of path — not just on /onboarding/otp (review round 2, finding
// 3: the old `dest`-only, /onboarding/otp-only check missed `?dest=...` on
// any other path).
const SENSITIVE_QUERY_PARAM_KEYS = new Set(['dest', 'email', 'phone', 'phonenumber', 'to', 'otp']);

/** Replaces email addresses and phone-shaped numbers anywhere in free text. */
export function redactContactInfo(text: string): string {
	return text
		.replace(EMAIL_PATTERN, '[redacted-email]')
		.replace(E164_PHONE_PATTERN, '[redacted-phone]')
		.replace(GROUPED_PHONE_PATTERN, '[redacted-phone]');
}

/** Replaces the dynamic id segment of /accept/<id>, /send/<id> and /api/qr-status/<id> wherever they appear. */
export function redactDynamicIds(text: string): string {
	let result = text;
	for (const { pattern, replacement } of DYNAMIC_ID_SEGMENTS) {
		result = result.replace(pattern, replacement);
	}
	return result;
}

/** `decodeURIComponent`, returning `null` instead of throwing on a malformed sequence. */
function tryDecode(value: string): string | null {
	try {
		return decodeURIComponent(value);
	} catch {
		return null;
	}
}

/**
 * Redacts query-parameter VALUES structurally wherever a `?key=value` or
 * `&key=value` shape appears in `text` (not just in a fully-parseable URL —
 * this also catches one embedded in a larger string, e.g. a Referer header
 * or a log line). Known-sensitive keys (`dest`, `email`, `phone`,
 * `phoneNumber`, `to`, `otp`) have their value replaced outright, regardless
 * of whether it happens to match the email/phone patterns. Every other key's
 * value is percent-decoded (when possible) before running the contact-info
 * patterns on it, so e.g. `?note=jane%40example.com` is still caught.
 */
export function redactQueryParams(text: string): string {
	return text.replace(
		/([?&])([A-Za-z][A-Za-z0-9_]*)=([^&#\s]*)/g,
		(match, sep: string, key: string, value: string) => {
			if (SENSITIVE_QUERY_PARAM_KEYS.has(key.toLowerCase())) {
				return `${sep}${key}=[redacted]`;
			}
			if (!value) return match;
			const decoded = tryDecode(value);
			if (decoded === null) return match;
			const scrubbed = redactContactInfo(decoded);
			// No PII found in the decoded value — keep the original
			// (still percent-encoded) form rather than needlessly rewriting
			// e.g. `q=caf%C3%A9` to `q=café`.
			if (scrubbed === decoded) return match;
			return `${sep}${key}=${scrubbed}`;
		}
	);
}

/**
 * Scrubs one arbitrary string value: URLs, transaction names, span
 * descriptions, free text. Applies dest/id/contact-info redaction to the raw
 * text, then — separately — percent-decodes the WHOLE string (when it
 * decodes cleanly) and re-checks for contact info there too, so PII hidden
 * behind percent-encoding outside of a `key=value` shape (e.g. embedded in a
 * path segment) is still caught (review round 2, finding 3).
 */
export function scrubString(text: string): string {
	let result = redactDynamicIds(text);
	result = redactQueryParams(result);
	result = redactContactInfo(result);

	const decoded = tryDecode(result);
	if (decoded !== null && decoded !== result) {
		const decodedScrubbed = redactContactInfo(decoded);
		// Only adopt the decoded form if it actually surfaced new PII to
		// redact — otherwise keep the original (still percent-encoded, which
		// is the more faithful representation) untouched.
		if (decodedScrubbed !== decoded) {
			result = decodedScrubbed;
		}
	}

	return result;
}

// Bounds on the deep walk below. Depth guarantees termination even on a
// circular object (depth is a monotonic counter, independent of object
// identity, so a cycle just hits the depth cap rather than looping forever).
// Raised from 4 (review round 2, finding 2 — too shallow for a realistically
// nested `extra`/`contexts` payload) to 10. Beyond the cap, the subtree is
// replaced with a marker rather than returned unscrubbed — review round 2
// found a 6-level-nested `extra` leaking an email verbatim past the old
// depth limit, which failed OPEN; this fails closed instead.
const MAX_SCRUB_DEPTH = 10;
const MAX_SCRUB_ITEMS = 200;
const TOO_DEEP_MARKER = '[scrubbed: too deep]';

/**
 * Structural Sentry fields that must survive this walk byte-for-byte,
 * wherever they appear (matched by key name, not by path — these names are
 * specific enough that a collision with an unrelated, PII-bearing field in
 * `extra`/`tags`/`contexts` is an acceptable, deliberate trade-off):
 * correlation/grouping ids, timestamps, and release/environment/sdk/platform
 * metadata, plus stack-frame file/line info. Exception `type`/`value` are
 * deliberately NOT here — `type` in particular can carry a custom error
 * message (see sentry-scrub.test.ts), so it goes through the normal walk.
 */
const EXEMPT_KEYS = new Set([
	'event_id',
	'trace_id',
	'span_id',
	'parent_span_id',
	'segment_id',
	'timestamp',
	'start_timestamp',
	'release',
	'environment',
	'sdk',
	'platform',
	'debug_meta',
	'filename',
	'function',
	'module',
	'lineno',
	'colno',
	'abs_path',
	'in_app'
]);

/** True for `{}`-literal-shaped objects and `Object.create(null)` — i.e. safe to walk into and reconstruct as a plain record. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (value === null || typeof value !== 'object') return false;
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}

/**
 * Deep-scrubs every string value anywhere in `value`, except for
 * `EXEMPT_KEYS`. This is the primary scrubbing mechanism for the whole
 * event — see the module doc comment for why it replaced per-field
 * enumeration.
 */
function scrubValueDeep(value: unknown, depth: number): unknown {
	if (depth > MAX_SCRUB_DEPTH) return TOO_DEEP_MARKER;
	if (typeof value === 'string') return scrubString(value);
	// Dates have no enumerable own properties, so walking them as a plain
	// object below would silently produce `{}` (review round 2, finding 5) —
	// preserve as an ISO string instead. Any other non-plain-object type
	// (RegExp, Map, Set, Error, a custom class instance, ...) is passed
	// through completely unchanged for the same reason: we can't generically
	// introspect arbitrary object types for PII, and mangling them into `{}`
	// is strictly worse than leaving them as-is. This is a known, accepted
	// limitation of pattern-matching, not a guarantee that such values never
	// carry PII.
	if (value instanceof Date) return value.toISOString();
	if (Array.isArray(value)) {
		return value.slice(0, MAX_SCRUB_ITEMS).map((item) => scrubValueDeep(item, depth + 1));
	}
	if (isPlainObject(value)) {
		const result: Record<string, unknown> = {};
		for (const [key, item] of Object.entries(value).slice(0, MAX_SCRUB_ITEMS)) {
			result[key] = EXEMPT_KEYS.has(key) ? item : scrubValueDeep(item, depth + 1);
		}
		return result;
	}
	return value;
}

/**
 * Minimal shape of the fields this module touches STRUCTURALLY (deletion,
 * not just string-redaction) — `request` and `user`. Everything else is
 * typed loosely via the index signature, since `scrubValueDeep` scrubs
 * arbitrary shapes generically rather than requiring each field to be named
 * here. Callers pass the real Sentry event object; TypeScript's structural
 * typing accepts it as long as these two fields line up, which they do for
 * both ErrorEvent and TransactionEvent.
 */
export interface ScrubbableSentryEvent {
	request?: {
		url?: string;
		headers?: Record<string, string>;
		cookies?: unknown;
		data?: unknown;
		[key: string]: unknown;
	};
	user?: { id?: string | number; [key: string]: unknown };
	[key: string]: unknown;
}

/**
 * Scrubs one Sentry event/transaction (and returns it) — the shared body of
 * both beforeSend and beforeSendTransaction. Never drops the event (returns
 * it, never null/undefined) — scrubbing failures should degrade to "less
 * redacted" being caught by other layers, not to losing the report.
 */
export function scrubSentryEvent<T extends ScrubbableSentryEvent>(event: T): T {
	const scrubbed = scrubValueDeep(event, 0) as T;

	// Structural deletions — these fields must be REMOVED, not merely have
	// their string content redacted in place, so they're handled as an
	// explicit pass on top of the blanket walk above.
	if (scrubbed.request) {
		delete scrubbed.request.cookies;
		delete scrubbed.request.data;
		if (scrubbed.request.headers) {
			for (const key of Object.keys(scrubbed.request.headers)) {
				const lower = key.toLowerCase();
				if (lower === 'cookie' || lower === 'authorization') {
					delete scrubbed.request.headers[key];
				}
			}
		}
	}

	if (scrubbed.user) {
		const id = scrubbed.user.id;
		if (typeof id === 'string' || typeof id === 'number') {
			scrubbed.user = { id };
		} else {
			delete scrubbed.user;
		}
	}

	return scrubbed;
}
