// SPDX-License-Identifier: AGPL-3.0-or-later
// Regression test: share messages must be rendered in the app's base locale,
// not the initiating user's current locale.

import { describe, it, expect, vi } from 'vitest';

vi.mock('$lib/paraglide/messages.js', () => ({
	qr_share_text: vi.fn(
		(params: { amount: string; appName: string }, opts?: { locale?: string }) =>
			`[${opts?.locale ?? 'current'}] ${params.amount} of credit through ${params.appName}.`
	),
	qr_share_text_with_note: vi.fn(
		(params: { amount: string; appName: string; note: string }, opts?: { locale?: string }) =>
			`[${opts?.locale ?? 'current'}] ${params.amount} of credit through ${params.appName} — ${params.note}`
	)
}));

vi.mock('$lib/paraglide/runtime.js', () => ({
	baseLocale: 'en',
	getLocale: vi.fn(() => 'de') // user is in German locale
}));

vi.mock('$lib/config', () => ({
	config: { appName: 'Mutuvia', unitCode: 'EUR' }
}));

vi.mock('./currency', () => ({
	formatAmount: vi.fn((_amount: number, locale?: string) =>
		locale === 'en' ? '€10.00' : '10,00 €'
	),
	currencyFractionDigits: vi.fn(() => 2)
}));

import { shareText } from './share-text';
import * as m from '$lib/paraglide/messages.js';
import { formatAmount } from './currency';

describe('shareText', () => {
	it('uses the base locale, not the current user locale', () => {
		const text = shareText(1000, null);
		expect(text).toContain('[en]');
		expect(text).not.toContain('[current]');
		expect(text).not.toContain('[de]');
	});

	it('passes the base locale to formatAmount for the amount string', () => {
		vi.mocked(formatAmount).mockClear();
		shareText(1000, null);
		expect(formatAmount).toHaveBeenCalledWith(1000, 'en');
	});

	it('uses qr_share_text with locale override when no note', () => {
		shareText(1000, null);
		expect(vi.mocked(m.qr_share_text)).toHaveBeenCalledWith(
			expect.objectContaining({ appName: 'Mutuvia' }),
			{ locale: 'en' }
		);
	});

	it('uses qr_share_text_with_note with locale override when note provided', () => {
		shareText(1000, 'coffee');
		expect(vi.mocked(m.qr_share_text_with_note)).toHaveBeenCalledWith(
			expect.objectContaining({ appName: 'Mutuvia', note: 'coffee' }),
			{ locale: 'en' }
		);
	});

	it('treats whitespace-only note as no note', () => {
		vi.mocked(m.qr_share_text).mockClear();
		vi.mocked(m.qr_share_text_with_note).mockClear();
		shareText(1000, '   ');
		expect(vi.mocked(m.qr_share_text)).toHaveBeenCalled();
		expect(vi.mocked(m.qr_share_text_with_note)).not.toHaveBeenCalled();
	});
});
