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
// error message that happens to contain someone's name). Phone shapes NOT
// redacted (deliberately — see README): a national number with no leading
// '+', a '00…'-prefixed international dialling form, or bare ungrouped
// digits with no separators at all. This app only ever stores/sends phone
// numbers in canonical E.164 form (a leading '+'), so those other shapes
// don't occur in this app's own data — but if a USER types one into free
// text (e.g. a support message), it can still slip through. Treat Sentry
// data as "reduced risk", not "safe to treat as public".
//
// DESIGN: this module walks the ENTIRE event, recursively (`scrubValueDeep`),
// and runs `scrubString` over every string value AND every object key it
// finds, anywhere, at any depth. This replaced two earlier, narrower designs
// in turn:
//   - enumerating specific fields to scrub (request.url, breadcrumbs,
//     exception.value, ...) one at a time — every review round found
//     another field (span.data, contexts.trace, stack-frame vars, ...) that
//     had been missed, because enumeration can only close the INSTANCE of a
//     bug, not the CLASS;
//   - a flat `EXEMPT_KEYS` allowlist matching by bare key name ANYWHERE in
//     the tree — which meant `extra.filename`, `extra.release`,
//     `breadcrumbs[].data.filename` etc. ALSO matched the allowlist and
//     leaked verbatim, since a structural field name like `release` or
//     `filename` is just as likely to appear (with attacker- or
//     user-controlled content) under `extra`/`tags`/breadcrumb `data`/span
//     `data` as in its real structural position.
//
// Exemptions are now PATH-SCOPED (`isExemptField`, below): a field is only
// exempt at its real structural location — top-level Event fields, the
// `contexts.trace` correlation fields, per-span correlation fields,
// per-breadcrumb structural fields, and stack-frame file/line info. The
// stack-frame check (`isRootStackFrame`) matches the path EXACTLY from the
// event root — `exception.values[<i>].stacktrace.frames[<j>]` or
// `threads.values[<i>].stacktrace.frames[<j>]`, the only two real locations
// a frame lives at — not by a path SUFFIX; a suffix match would be
// spoofable by any attacker- or user-controlled value shaped like
// `{ frames: [{ function: '...' }] }` anywhere else in the tree (e.g. under
// `extra`). Everything under `extra`, `tags`, any custom `contexts.<name>`,
// breadcrumb `data`, span `data`, and `user` gets NO exemptions at all —
// every string there is
// scrubbed. Stack-frame `filename`/`abs_path` are deliberately NOT exempt
// either (unlike `function`/`module`/`lineno`/`colno`/`in_app`): a frame's
// URL can itself be a request URL carrying a route id or query string, and
// redacting that doesn't harm symbolication of a bundle path (see
// sentry-scrub.test.ts's realistic `/_app/immutable/...js` case, which
// passes through unchanged precisely because it has nothing PII-shaped in
// it — not because the field is exempt).
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
//
// Fail-closed: `safeScrubSentryEvent` (the function actually wired into
// beforeSend/beforeSendTransaction) catches any exception from the scrubber
// itself and drops the event (returns `null`) rather than ever risking an
// unscrubbed event reaching Sentry because scrubbing crashed partway
// through. This is enforced in THIS module, not left to the SDK.

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// Two deliberately NARROW phone patterns, replacing a single loose one that
// matched ISO-8601 date/time fragments and version strings as "phone
// numbers" (e.g. "2026-11-11" or "10.46.0").
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
//
// NOT redacted by either pattern (documented, deliberate — see README):
// a national number with no leading '+' and no 3-3-4 grouping (e.g. a
// 10-digit run with no separators), or a '00'-prefixed international
// dialling form. This app only ever stores/sends E.164; these other shapes
// would only ever appear if a user typed one into free text themselves.
const GROUPED_PHONE_PATTERN = /\(\d{3}\)[-.\s]\d{3}[-.\s]\d{4}|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g;

const DYNAMIC_ID_SEGMENTS: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
	{ pattern: /\/accept\/[A-Za-z0-9_-]+/g, replacement: '/accept/[id]' },
	{ pattern: /\/send\/[A-Za-z0-9_-]+/g, replacement: '/send/[id]' },
	{ pattern: /\/api\/qr-status\/[A-Za-z0-9_-]+/g, replacement: '/api/qr-status/[id]' }
];

// Query-parameter keys whose VALUE is dropped entirely wherever they appear,
// regardless of path — not just on /onboarding/otp.
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

// Bound on iterative percent-decoding (review round 3, finding 4: a single
// decode pass left double-encoded PII like "jane%2540example.com" —
// %2540 -> %40 -> @ — one decode short of readable). Three passes covers
// double-encoding with margin to spare; anything decoded that many times
// over and still not exposing a recognisable pattern is treated as not
// worth chasing further (bounded cost against adversarial input).
const MAX_DECODE_PASSES = 3;

/** `decodeURIComponent`, returning `null` instead of throwing on a malformed sequence. */
function tryDecode(value: string): string | null {
	try {
		return decodeURIComponent(value);
	} catch {
		return null;
	}
}

/** Repeatedly percent-decodes `value` until it stops changing or `MAX_DECODE_PASSES` is reached. */
function decodeIteratively(value: string): string {
	let result = value;
	for (let pass = 0; pass < MAX_DECODE_PASSES; pass++) {
		const decoded = tryDecode(result);
		if (decoded === null || decoded === result) break;
		result = decoded;
	}
	return result;
}

/**
 * Redacts query-parameter VALUES structurally wherever a `?key=value` or
 * `&key=value` shape appears in `text` (not just in a fully-parseable URL —
 * this also catches one embedded in a larger string, e.g. a Referer header
 * or a log line). Known-sensitive keys (`dest`, `email`, `phone`,
 * `phoneNumber`, `to`, `otp`) have their value replaced outright, regardless
 * of whether it happens to match the email/phone patterns. Every other key's
 * value is percent-decoded (iteratively, to unwrap double-encoding) before
 * running the contact-info patterns on it.
 */
export function redactQueryParams(text: string): string {
	return text.replace(
		/([?&])([A-Za-z][A-Za-z0-9_]*)=([^&#\s]*)/g,
		(match, sep: string, key: string, value: string) => {
			if (SENSITIVE_QUERY_PARAM_KEYS.has(key.toLowerCase())) {
				return `${sep}${key}=[redacted]`;
			}
			if (!value) return match;
			const decoded = decodeIteratively(value);
			if (decoded === value) return match;
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
 * descriptions, object keys, free text. Applies id/query-param/contact-info
 * redaction to the raw text, then — separately — percent-decodes the WHOLE
 * string ITERATIVELY (to unwrap double-encoding; when it decodes cleanly)
 * and re-checks for contact info there too, so PII hidden behind
 * percent-encoding outside of a `key=value` shape (e.g. embedded in a path
 * segment) is still caught.
 */
export function scrubString(text: string): string {
	let result = redactDynamicIds(text);
	result = redactQueryParams(result);
	result = redactContactInfo(result);

	const decoded = decodeIteratively(result);
	if (decoded !== result) {
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
// Beyond the cap, the subtree is replaced with a marker rather than returned
// unscrubbed — failing closed rather than open.
const MAX_SCRUB_DEPTH = 10;
const MAX_SCRUB_ITEMS = 200;
const TOO_DEEP_MARKER = '[scrubbed: too deep]';

type PathSegment = string | number;

/**
 * Structural Sentry Event fields read directly off the event root (path
 * length 0 — i.e. `event.<key>`) that must survive byte-for-byte: ids
 * Sentry uses for grouping/correlation, timestamps, and release/
 * environment/platform/sdk/modules metadata. `type` here is the event-level
 * discriminator ("transaction"/"feedback"/"check_in"/...), NOT
 * `exception.values[].type` (the error class name, which CAN carry a
 * custom, PII-bearing message, and is NOT exempt — see
 * sentry-scrub.test.ts).
 */
const TOP_LEVEL_EXEMPT = new Set([
	'event_id',
	'timestamp',
	'start_timestamp',
	'release',
	'environment',
	'platform',
	'level',
	'type',
	'dist',
	'sdk',
	'modules',
	'debug_meta',
	'fingerprint'
]);

/** `contexts.trace.<key>` — span/trace correlation fields, not free text. */
const TRACE_CONTEXT_EXEMPT = new Set(['trace_id', 'span_id', 'parent_span_id', 'op', 'status']);

/** `spans[<i>].<key>` — per-span correlation/timing/status fields. `description`/`data` are NOT here and go through the normal walk. */
const SPAN_EXEMPT = new Set([
	'span_id',
	'parent_span_id',
	'trace_id',
	'start_timestamp',
	'timestamp',
	'op',
	'status'
]);

/** `breadcrumbs[<i>].<key>` — structural breadcrumb fields. `message`/`data` are NOT here. */
const BREADCRUMB_EXEMPT = new Set(['timestamp', 'type', 'category', 'level']);

/**
 * Stack-frame fields. Deliberately does NOT include `filename`/`abs_path` —
 * a frame's URL can itself carry a route id or query string worth
 * redacting, and doing so doesn't harm symbolication of a bundle path.
 * `pre_context`/`context_line`/`post_context` (source lines) and local
 * `vars` are also NOT here, and so go through the normal walk like
 * everything else.
 */
const STACK_FRAME_EXEMPT = new Set(['function', 'module', 'lineno', 'colno', 'in_app']);

/**
 * True when `path` is exactly `exception.values[<i>].stacktrace.frames[<j>]`
 * or `threads.values[<i>].stacktrace.frames[<j>]` — the only two real
 * locations a Sentry stack frame lives at (per `@sentry/core`'s `Event`
 * type: `exception?: { values?: Exception[] }` and
 * `threads?: { values: Thread[] }`, each `Exception`/`Thread` carrying its
 * own `stacktrace?: { frames?: StackFrame[] }`).
 *
 * Checked by matching the path from the EVENT ROOT exactly, not by a path
 * SUFFIX (`.../frames/<n>`) — a suffix match is spoofable: an attacker- or
 * user-controlled value anywhere in the tree need only be shaped like
 * `{ frames: [{ function: '...' }] }` (e.g. under `extra`, or even under a
 * genuine `exception.values[]` entry's own nested data) to have that
 * `function`/`module`/etc. field wrongly exempted. Not reachable from any
 * code in this app today (nothing calls `setExtra`/`setContext` with
 * attacker-controlled data), but closed anyway rather than left as a latent
 * footgun.
 */
function isRootStackFrame(path: readonly PathSegment[]): boolean {
	if (path.length !== 6) return false;
	const [root, valuesKey, index, stacktraceKey, framesKey, frameIndex] = path;
	return (
		(root === 'exception' || root === 'threads') &&
		valuesKey === 'values' &&
		typeof index === 'number' &&
		stacktraceKey === 'stacktrace' &&
		framesKey === 'frames' &&
		typeof frameIndex === 'number'
	);
}

/**
 * Decides whether `key`, found at `path` (the path of its PARENT object,
 * i.e. not including `key` itself), must survive untouched. All exemptions
 * are path-scoped: the same key name under `extra`, `tags`, a custom
 * `contexts.<name>`, breadcrumb `data`, or span `data` is NEVER exempt.
 */
function isExemptField(path: readonly PathSegment[], key: string): boolean {
	if (path.length === 0) {
		return TOP_LEVEL_EXEMPT.has(key);
	}
	if (path.length === 2 && path[0] === 'contexts' && path[1] === 'trace') {
		return TRACE_CONTEXT_EXEMPT.has(key);
	}
	if (path.length === 2 && path[0] === 'spans' && typeof path[1] === 'number') {
		return SPAN_EXEMPT.has(key);
	}
	if (path.length === 2 && path[0] === 'breadcrumbs' && typeof path[1] === 'number') {
		return BREADCRUMB_EXEMPT.has(key);
	}
	if (isRootStackFrame(path)) {
		return STACK_FRAME_EXEMPT.has(key);
	}
	return false;
}

/** True for `{}`-literal-shaped objects and `Object.create(null)` — i.e. safe to walk into and reconstruct as a plain record. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (value === null || typeof value !== 'object') return false;
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}

/**
 * Scrubs an object key (`extra: { 'jane@example.com': 1 }` leaked the key
 * itself). Collisions after scrubbing (two different keys that redact to
 * the same string) are resolved deterministically by suffixing, so no data
 * is silently dropped by being overwritten. Checks OWN properties only
 * (`Object.hasOwn`, not the `in` operator, which also matches inherited
 * names like `toString` from `Object.prototype` and would otherwise
 * needlessly suffix a legitimately-named key that happens to collide with
 * one) — see `assignScrubbedProperty` below for why an input key can safely
 * be the LITERAL string `__proto__` here without that ever being a problem.
 */
function scrubKey(key: string, existing: Record<string, unknown>): string {
	const scrubbed = scrubString(key);
	if (!Object.hasOwn(existing, scrubbed)) return scrubbed;
	let suffix = 2;
	while (Object.hasOwn(existing, `${scrubbed}__${suffix}`)) suffix++;
	return `${scrubbed}__${suffix}`;
}

/**
 * Sets `target[key] = value` WITHOUT ever risking prototype pollution, no
 * matter what `key` is (including the literal strings `__proto__` or
 * `constructor`) and independent of how `scrubKey`'s collision check above
 * is implemented. A plain bracket/dot assignment (`target[key] = value`)
 * for `key === '__proto__'` on an ordinary `{}`-based object does NOT create
 * an own property named "__proto__" — it invokes `Object.prototype`'s
 * inherited `__proto__` ACCESSOR and actually changes `target`'s prototype
 * to `value`. `Object.defineProperty` never goes through that accessor: it
 * always creates/overwrites a genuine own data property, exactly like
 * `JSON.parse` itself does for a literal `"__proto__"` key in JSON text
 * (which is why `JSON.parse('{"__proto__":{"polluted":true}}')` is itself
 * safe — the vulnerability was only ever in OUR re-assignment of an
 * already-safe parsed key, not in receiving one). The result stays a
 * perfectly ordinary, JSON-serialisable plain object for Sentry's SDK —
 * `JSON.stringify` only cares about own enumerable properties, which this
 * still produces.
 */
function assignScrubbedProperty(
	target: Record<string, unknown>,
	key: string,
	value: unknown
): void {
	Object.defineProperty(target, key, {
		value,
		writable: true,
		enumerable: true,
		configurable: true
	});
}

/**
 * Deep-scrubs every string value AND every object key anywhere in `value`,
 * except for the path-scoped exemptions above. This is the primary
 * scrubbing mechanism for the whole event — see the module doc comment.
 */
function scrubValueDeep(value: unknown, depth: number, path: readonly PathSegment[]): unknown {
	if (depth > MAX_SCRUB_DEPTH) return TOO_DEEP_MARKER;
	if (typeof value === 'string') return scrubString(value);
	// Dates have no enumerable own properties, so walking them as a plain
	// object below would silently produce `{}` — preserve as an ISO string
	// instead. Any other non-plain-object type (RegExp, Map, Set, Error, a
	// custom class instance, ...) is passed through completely unchanged for
	// the same reason: we can't generically introspect arbitrary object
	// types for PII, and mangling them into `{}` is strictly worse than
	// leaving them as-is. This is a known, accepted limitation of
	// pattern-matching, not a guarantee that such values never carry PII.
	if (value instanceof Date) return value.toISOString();
	if (Array.isArray(value)) {
		return value
			.slice(0, MAX_SCRUB_ITEMS)
			.map((item, index) => scrubValueDeep(item, depth + 1, [...path, index]));
	}
	if (isPlainObject(value)) {
		const result: Record<string, unknown> = {};
		for (const [key, item] of Object.entries(value).slice(0, MAX_SCRUB_ITEMS)) {
			const exempt = isExemptField(path, key);
			const scrubbedValue = exempt ? item : scrubValueDeep(item, depth + 1, [...path, key]);
			const finalKey = exempt ? key : scrubKey(key, result);
			assignScrubbedProperty(result, finalKey, scrubbedValue);
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
 * both beforeSend and beforeSendTransaction. Never drops the event itself
 * (returns it, never null/undefined) on its own — callers that need
 * fail-closed behaviour on an unexpected throw should use
 * `safeScrubSentryEvent` instead, which wraps this.
 */
export function scrubSentryEvent<T extends ScrubbableSentryEvent>(event: T): T {
	const scrubbed = scrubValueDeep(event, 0, []) as T;

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

/**
 * The function actually wired into beforeSend/beforeSendTransaction (both
 * client and server). Fails CLOSED: if `scrubSentryEvent` throws for any
 * reason — a bug in this module, an unexpected event shape, anything — the
 * event is dropped (`null`, which tells Sentry not to send it) rather than
 * risking an unscrubbed event reaching Sentry. This is enforced here, in the
 * app, rather than relying on the SDK to behave any particular way if a
 * beforeSend hook throws.
 */
export function safeScrubSentryEvent<T extends ScrubbableSentryEvent>(event: T): T | null {
	try {
		return scrubSentryEvent(event);
	} catch (err) {
		console.error(
			'[sentry-scrub] scrubbing failed; dropping this event rather than risk sending it unscrubbed:',
			err
		);
		return null;
	}
}
