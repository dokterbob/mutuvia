// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, test, expect, vi, beforeEach } from 'vitest';

const mockConfig = vi.hoisted(() => ({ appUrl: 'https://app.example' }));
vi.mock('$lib/config', () => ({ config: mockConfig }));

import {
	qrCookieOptions,
	returnCookieMaxAge,
	isSafeReturnTo,
	setQrReturnCookies,
	consumeQrReturnTo,
	readAcceptIntent,
	clearAcceptIntent,
	ONBOARDING_WINDOW_SECONDS,
	EXPIRED_GRACE_SECONDS,
	QR_RETURN_TO_COOKIE,
	QR_SKIP_INTROS_COOKIE,
	QR_AMOUNT_COOKIE,
	QR_ACCEPT_INTENT_COOKIE
} from './qr-return';
import { setAcceptFlash, consumeAcceptFlash, ACCEPT_FLASH_COOKIE } from './accept-flash';
import type { Cookies } from '@sveltejs/kit';

type SetCall = { name: string; value: string; opts: Record<string, unknown> };

function makeCookies(initial: Record<string, string> = {}) {
	const store = new Map(Object.entries(initial));
	const sets: SetCall[] = [];
	const deletes: { name: string; opts: Record<string, unknown> }[] = [];
	const cookies = {
		get: (name: string) => store.get(name),
		set: (name: string, value: string, opts: Record<string, unknown>) => {
			store.set(name, value);
			sets.push({ name, value, opts });
		},
		delete: (name: string, opts: Record<string, unknown>) => {
			store.delete(name);
			deletes.push({ name, opts });
		}
	};
	return { cookies: cookies as unknown as Cookies, store, sets, deletes };
}

beforeEach(() => {
	mockConfig.appUrl = 'https://app.example';
});

describe('qrCookieOptions', () => {
	test('given an https APP_URL, when built, then cookies are Secure', () => {
		expect(qrCookieOptions(60)).toMatchObject({
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: true,
			maxAge: 60
		});
	});

	// The LAN-dev regression: SvelteKit's default is Secure on any host but
	// localhost, so on http://<LAN-IP> the browser dropped these cookies.
	test('given a plain-http APP_URL (e.g. a LAN IP in dev), when built, then cookies are NOT Secure', () => {
		mockConfig.appUrl = 'http://192.168.1.20:5173';
		expect(qrCookieOptions(60).secure).toBe(false);
	});

	test('given no maxAge, when built, then no maxAge is set (for deletes)', () => {
		expect(qrCookieOptions()).not.toHaveProperty('maxAge');
	});
});

describe('returnCookieMaxAge', () => {
	const now = 1_000_000_000;

	test('given a QR that never expires, when computed, then uses the 1-day onboarding window', () => {
		expect(returnCookieMaxAge(null, now)).toBe(ONBOARDING_WINDOW_SECONDS);
	});

	test('given a QR expiring in 10 minutes, when computed, then caps at its remaining lifetime plus the grace period', () => {
		expect(returnCookieMaxAge(new Date(now + 600_000), now)).toBe(600 + EXPIRED_GRACE_SECONDS);
	});

	test('given a QR expiring in 3 days, when computed, then caps at the 1-day onboarding window', () => {
		expect(returnCookieMaxAge(new Date(now + 3 * 86_400_000), now)).toBe(ONBOARDING_WINDOW_SECONDS);
	});

	test('given a QR that already expired, when computed, then still allows the grace period', () => {
		expect(returnCookieMaxAge(new Date(now - 60_000), now)).toBe(EXPIRED_GRACE_SECONDS);
	});
});

describe('isSafeReturnTo', () => {
	test.each(['/accept/abc', '/send/abc', '/home'])('accepts same-origin path %j', (v) => {
		expect(isSafeReturnTo(v)).toBe(true);
	});

	test.each([
		'//evil.example',
		'/\\evil.example',
		'/\t/evil.example',
		'/\n/evil.example',
		'/\r//evil.example',
		'/a\\b',
		'https://evil.example/accept/abc',
		'evil',
		'/onboarding',
		'/onboarding/name',
		'',
		undefined
	])('rejects %j', (v) => {
		expect(isSafeReturnTo(v)).toBe(false);
	});
});

describe('setQrReturnCookies', () => {
	test('given a fast-track accept, when set, then return path, skip-intros and token-bound intent share one policy', () => {
		const { cookies, store, sets } = makeCookies();
		setQrReturnCookies(cookies, {
			returnTo: '/accept/tok-1',
			expiresAt: null,
			skipIntros: true,
			acceptIntent: { token: 'tok-1', mode: 'fast' }
		});

		expect(store.get(QR_RETURN_TO_COOKIE)).toBe('/accept/tok-1');
		expect(store.get(QR_SKIP_INTROS_COOKIE)).toBe('1');
		expect(store.get(QR_ACCEPT_INTENT_COOKIE)).toBe('fast:tok-1');
		for (const s of sets) {
			expect(s.opts).toMatchObject({ path: '/', httpOnly: true, sameSite: 'lax', secure: true });
			expect(s.opts.maxAge).toBe(ONBOARDING_WINDOW_SECONDS);
		}
	});

	test('given full onboarding without intent, when set, then a stale skip-intros and intent are cleared', () => {
		const { cookies, store } = makeCookies({
			[QR_SKIP_INTROS_COOKIE]: '1',
			[QR_ACCEPT_INTENT_COOKIE]: 'fast:old'
		});
		setQrReturnCookies(cookies, { returnTo: '/send/r-1', expiresAt: null, skipIntros: false });

		expect(store.has(QR_SKIP_INTROS_COOKIE)).toBe(false);
		expect(store.has(QR_ACCEPT_INTENT_COOKIE)).toBe(false);
	});

	test('given an amount, when set, then stored; given null, then cleared; given undefined, then untouched', () => {
		const a = makeCookies();
		setQrReturnCookies(a.cookies, {
			returnTo: '/send/r',
			expiresAt: null,
			skipIntros: false,
			amount: 1050
		});
		expect(a.store.get(QR_AMOUNT_COOKIE)).toBe('1050');

		const b = makeCookies({ [QR_AMOUNT_COOKIE]: '1' });
		setQrReturnCookies(b.cookies, {
			returnTo: '/send/r',
			expiresAt: null,
			skipIntros: false,
			amount: null
		});
		expect(b.store.has(QR_AMOUNT_COOKIE)).toBe(false);

		const c = makeCookies({ [QR_AMOUNT_COOKIE]: '7' });
		setQrReturnCookies(c.cookies, { returnTo: '/accept/t', expiresAt: null, skipIntros: false });
		expect(c.store.get(QR_AMOUNT_COOKIE)).toBe('7');
	});

	test('given a QR expiring soon, when set, then maxAge is capped by its expiry', () => {
		const { cookies, sets } = makeCookies();
		setQrReturnCookies(cookies, {
			returnTo: '/accept/t',
			expiresAt: new Date(Date.now() + 120_000),
			skipIntros: true
		});
		const maxAge = sets[0].opts.maxAge as number;
		expect(maxAge).toBeLessThanOrEqual(120 + EXPIRED_GRACE_SECONDS);
		expect(maxAge).toBeGreaterThan(EXPIRED_GRACE_SECONDS);
	});
});

describe('consumeQrReturnTo', () => {
	test('given a safe return path, when consumed, then returns it and clears return + skip-intros but keeps amount and intent', () => {
		const { cookies, store } = makeCookies({
			[QR_RETURN_TO_COOKIE]: '/accept/tok',
			[QR_SKIP_INTROS_COOKIE]: '1',
			[QR_AMOUNT_COOKIE]: '100',
			[QR_ACCEPT_INTENT_COOKIE]: 'fast:tok'
		});

		expect(consumeQrReturnTo(cookies)).toBe('/accept/tok');
		expect(store.has(QR_RETURN_TO_COOKIE)).toBe(false);
		expect(store.has(QR_SKIP_INTROS_COOKIE)).toBe(false);
		// consumed by the destination page itself
		expect(store.get(QR_AMOUNT_COOKIE)).toBe('100');
		expect(store.get(QR_ACCEPT_INTENT_COOKIE)).toBe('fast:tok');
	});

	test.each(['//evil.example', 'https://evil.example', '/onboarding/name'])(
		'given an unsafe return path %j, when consumed, then returns null and still clears it',
		(value) => {
			const { cookies, store } = makeCookies({ [QR_RETURN_TO_COOKIE]: value });
			expect(consumeQrReturnTo(cookies)).toBeNull();
			expect(store.has(QR_RETURN_TO_COOKIE)).toBe(false);
		}
	);

	test('given no return cookie, when consumed, then returns null and deletes nothing', () => {
		const { cookies, deletes } = makeCookies();
		expect(consumeQrReturnTo(cookies)).toBeNull();
		expect(deletes).toHaveLength(0);
	});

	test('given an http APP_URL, when deleting, then the delete uses the same non-Secure policy', () => {
		mockConfig.appUrl = 'http://192.168.1.20:5173';
		const { cookies, deletes } = makeCookies({ [QR_RETURN_TO_COOKIE]: '/home' });
		consumeQrReturnTo(cookies);
		expect(deletes.every((d) => d.opts.secure === false && d.opts.path === '/')).toBe(true);
	});
});

describe('readAcceptIntent / clearAcceptIntent', () => {
	test('given an intent for this token, when read, then returns its mode', () => {
		const { cookies } = makeCookies({ [QR_ACCEPT_INTENT_COOKIE]: 'fast:tok-1' });
		expect(readAcceptIntent(cookies, 'tok-1')).toBe('fast');
	});

	test('given an intent for a different token, when read, then returns null (bound to its token)', () => {
		const { cookies } = makeCookies({ [QR_ACCEPT_INTENT_COOKIE]: 'fast:tok-1' });
		expect(readAcceptIntent(cookies, 'tok-2')).toBeNull();
	});

	test.each(['', 'fast', 'bogus:tok-1', ':tok-1'])(
		'given a malformed intent %j, when read, then returns null',
		(raw) => {
			const { cookies } = makeCookies({ [QR_ACCEPT_INTENT_COOKIE]: raw });
			expect(readAcceptIntent(cookies, 'tok-1')).toBeNull();
		}
	);

	test('given an intent, when cleared, then it is gone', () => {
		const { cookies, store } = makeCookies({ [QR_ACCEPT_INTENT_COOKIE]: 'full:tok-1' });
		clearAcceptIntent(cookies);
		expect(store.has(QR_ACCEPT_INTENT_COOKIE)).toBe(false);
	});
});

describe('accept flash', () => {
	test('given a set flash, when consumed, then returns it once and deletes it', () => {
		const { cookies, store } = makeCookies();
		setAcceptFlash(cookies, { direction: 'send', name: 'Alice', amount: '€5.00' });

		expect(consumeAcceptFlash(cookies)).toEqual({
			direction: 'send',
			name: 'Alice',
			amount: '€5.00'
		});
		expect(store.has(ACCEPT_FLASH_COOKIE)).toBe(false);
		expect(consumeAcceptFlash(cookies)).toBeNull();
	});

	test.each(['not json', '{"direction":"sideways","name":"A","amount":"1"}', '{}'])(
		'given a malformed flash %j, when consumed, then returns null and deletes it',
		(raw) => {
			const { cookies, store } = makeCookies({ [ACCEPT_FLASH_COOKIE]: raw });
			expect(consumeAcceptFlash(cookies)).toBeNull();
			expect(store.has(ACCEPT_FLASH_COOKIE)).toBe(false);
		}
	);
});
