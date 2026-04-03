import { test, expect, describe, beforeEach, afterEach } from 'vitest';
import {
	isDismissedRecently,
	saveDismissal,
	getDismissalTimestamp,
	isStandaloneMode,
	isIOSDevice
} from './use-install-prompt.svelte.js';

// ---------------------------------------------------------------------------
// Shared in-memory localStorage mock
// ---------------------------------------------------------------------------

const store: Record<string, string> = {};
const mockLocalStorage = {
	getItem: (k: string) => store[k] ?? null,
	setItem: (k: string, v: string) => {
		store[k] = v;
	},
	removeItem: (k: string) => {
		delete store[k];
	},
	clear: () => {
		for (const k in store) delete store[k];
	}
};

// ---------------------------------------------------------------------------
// getDismissalTimestamp
// ---------------------------------------------------------------------------

describe('getDismissalTimestamp', () => {
	beforeEach(() => {
		mockLocalStorage.clear();
		(globalThis as Record<string, unknown>).localStorage = mockLocalStorage;
	});

	afterEach(() => {
		delete (globalThis as Record<string, unknown>).localStorage;
	});

	test('returns null when key is absent', () => {
		expect(getDismissalTimestamp('test-key')).toBeNull();
	});

	test('returns the parsed number when key exists', () => {
		mockLocalStorage.setItem('test-key', '1700000000000');
		expect(getDismissalTimestamp('test-key')).toBe(1700000000000);
	});
});

// ---------------------------------------------------------------------------
// isDismissedRecently
// ---------------------------------------------------------------------------

describe('isDismissedRecently', () => {
	beforeEach(() => {
		mockLocalStorage.clear();
		(globalThis as Record<string, unknown>).localStorage = mockLocalStorage;
	});

	afterEach(() => {
		delete (globalThis as Record<string, unknown>).localStorage;
	});

	test('returns false when no dismissal stored', () => {
		expect(isDismissedRecently('test-key', 30)).toBe(false);
	});

	test('returns false when dismissal is older than 30 days', () => {
		const oldTimestamp = Date.now() - 31 * 86_400_000;
		mockLocalStorage.setItem('test-key', String(oldTimestamp));
		expect(isDismissedRecently('test-key', 30)).toBe(false);
	});

	test('returns true when dismissal is within 30 days', () => {
		const recentTimestamp = Date.now() - 1 * 86_400_000; // 1 day ago
		mockLocalStorage.setItem('test-key', String(recentTimestamp));
		expect(isDismissedRecently('test-key', 30)).toBe(true);
	});

	test('returns false for a corrupt/non-numeric localStorage value', () => {
		mockLocalStorage.setItem('test-key', 'not-a-number');
		expect(isDismissedRecently('test-key', 30)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// saveDismissal
// ---------------------------------------------------------------------------

describe('saveDismissal', () => {
	beforeEach(() => {
		mockLocalStorage.clear();
		(globalThis as Record<string, unknown>).localStorage = mockLocalStorage;
	});

	afterEach(() => {
		delete (globalThis as Record<string, unknown>).localStorage;
	});

	test('writes a numeric timestamp string to localStorage under the given key', () => {
		const before = Date.now();
		saveDismissal('test-key');
		const after = Date.now();

		const raw = mockLocalStorage.getItem('test-key');
		expect(raw).not.toBeNull();
		const value = Number(raw);
		expect(isNaN(value)).toBe(false);
		expect(value).toBeGreaterThanOrEqual(before);
		expect(value).toBeLessThanOrEqual(after);
	});
});

// ---------------------------------------------------------------------------
// isStandaloneMode
// ---------------------------------------------------------------------------

describe('isStandaloneMode', () => {
	let originalMatchMedia: unknown;
	let originalNavigator: unknown;

	beforeEach(() => {
		originalMatchMedia = (globalThis as Record<string, unknown>).matchMedia;
		originalNavigator = (globalThis as Record<string, unknown>).navigator;
	});

	afterEach(() => {
		(globalThis as Record<string, unknown>).matchMedia = originalMatchMedia;
		(globalThis as Record<string, unknown>).navigator = originalNavigator;
	});

	test('returns true when matchMedia returns matches: true for (display-mode: standalone)', () => {
		(globalThis as Record<string, unknown>).matchMedia = (_query: string) => ({ matches: true });
		(globalThis as Record<string, unknown>).navigator = {};
		(globalThis as Record<string, unknown>).window = globalThis;
		expect(isStandaloneMode()).toBe(true);
	});

	test('returns true when navigator.standalone is true', () => {
		(globalThis as Record<string, unknown>).matchMedia = (_query: string) => ({ matches: false });
		(globalThis as Record<string, unknown>).navigator = { standalone: true };
		(globalThis as Record<string, unknown>).window = globalThis;
		expect(isStandaloneMode()).toBe(true);
	});

	test('returns false in normal browser mode (matchMedia returns false, standalone undefined)', () => {
		(globalThis as Record<string, unknown>).matchMedia = (_query: string) => ({ matches: false });
		(globalThis as Record<string, unknown>).navigator = {};
		(globalThis as Record<string, unknown>).window = globalThis;
		expect(isStandaloneMode()).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// isIOSDevice
// ---------------------------------------------------------------------------

describe('isIOSDevice', () => {
	let originalWindow: unknown;

	beforeEach(() => {
		originalWindow = (globalThis as Record<string, unknown>).window;
	});

	afterEach(() => {
		(globalThis as Record<string, unknown>).window = originalWindow;
	});

	test('returns true when both GestureEvent and ontouchstart are present on window', () => {
		(globalThis as Record<string, unknown>).GestureEvent = function () {};
		(globalThis as Record<string, unknown>).ontouchstart = null;
		(globalThis as Record<string, unknown>).window = globalThis;
		expect(isIOSDevice()).toBe(true);
		delete (globalThis as Record<string, unknown>).GestureEvent;
		delete (globalThis as Record<string, unknown>).ontouchstart;
	});

	test('returns false when they are absent', () => {
		// Ensure neither is set
		delete (globalThis as Record<string, unknown>).GestureEvent;
		delete (globalThis as Record<string, unknown>).ontouchstart;
		(globalThis as Record<string, unknown>).window = globalThis;
		expect(isIOSDevice()).toBe(false);
	});
});
