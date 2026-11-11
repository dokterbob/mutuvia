// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Covers the QR expiry preset Select on the /send and /receive create forms:
// picking a non-default preset must change the rendered `qr_expires`
// countdown accordingly, for both a one-time send QR and a reusable receive
// QR (the latter previously always got `expiresAt: null` regardless of what
// was selected).

import { expect, type BrowserContext } from '@playwright/test';
import { test, goto, setupAuthenticatedUser, deleteTestUser } from './test-utils.js';

test.describe('QR expiry preset', () => {
	test('send: picking "1 day" shows a ~1 day countdown, not the 3-day default', async ({
		browser,
		email
	}, testInfo) => {
		const baseURL = testInfo.project.use.baseURL!;
		const ctx: BrowserContext = await browser.newContext({ baseURL });
		await setupAuthenticatedUser(ctx, email('sender'), 'Expiry Sender');
		const page = await ctx.newPage();

		try {
			await goto(page, '/send');

			// First visit → consent step
			await expect(page.getByRole('button', { name: "I understand, let's go" })).toBeVisible();
			await page.getByRole('button', { name: "I understand, let's go" }).click();

			// Amount step
			await expect(page.getByRole('heading', { name: 'Send' })).toBeVisible();
			await page.locator('input[name="amount"]').fill('1.00');

			// Expiry Select — defaults to "3 days" (QR_TTL_SECONDS default).
			// bits-ui's Select.Trigger renders a native <button> (aria-haspopup
			// "listbox", no combobox role), so target it via its data-slot.
			const trigger = page.locator('[data-slot="select-trigger"]');
			await expect(trigger).toHaveText('3 days');
			await trigger.click();
			await expect(page.getByRole('listbox')).toBeVisible();
			await page.getByRole('option', { name: '1 day' }).click();
			await expect(trigger).toHaveText('1 day');

			await page.getByRole('button', { name: 'Generate QR' }).click();

			// QR step — the expiry countdown reflects the chosen preset, not the
			// default. `formatTimeRemaining` recomputes from `expiresAt` every
			// second, and a preset's seconds value sits exactly on a bucket
			// boundary (86400s = the "day" bucket's minimum) — by the time the
			// client renders, a few seconds have always elapsed server round-trip,
			// so the remaining time is just *under* 86400s and renders in the next
			// bucket down: "24 hours", not "1 day". That's the real, deterministic
			// rendering (verified above), not a flaky edge case.
			await expect(page.getByText(/Expires in (about )?(23|24) hours/i)).toBeVisible({
				timeout: 10_000
			});
			await expect(page.getByText(/3 days/i)).not.toBeVisible();
		} finally {
			await ctx.close();
			await deleteTestUser(email('sender'));
		}
	});

	test('receive: a reusable QR with a chosen "1 day" preset shows a ~1 day countdown', async ({
		browser,
		email
	}, testInfo) => {
		const baseURL = testInfo.project.use.baseURL!;
		const ctx: BrowserContext = await browser.newContext({ baseURL });
		await setupAuthenticatedUser(ctx, email('receiver'), 'Expiry Receiver');
		const page = await ctx.newPage();

		try {
			await goto(page, '/receive');
			await expect(page.getByRole('heading', { name: 'Receive' })).toBeVisible();

			// Open "Advanced options" first — the reusable checkbox and the
			// expiry Select both live inside the <details> block, hidden until
			// it's expanded.
			await page.getByText('Advanced options').click();
			await page.getByLabel('Reusable QR code').check();

			// Note: the Select's current value is NOT reset to the reusable
			// default ("Never") just by toggling "reusable" — the component only
			// re-picks a default when the current key becomes invalid for the
			// new option list (see +page.svelte's $effect comment), and "3d" (the
			// one-time default) is still a valid choice in the reusable list.
			const trigger = page.locator('[data-slot="select-trigger"]');
			await trigger.click();
			await expect(page.getByRole('listbox')).toBeVisible();
			await page.getByRole('option', { name: '1 day' }).click();
			await expect(trigger).toHaveText('1 day');

			await page.getByRole('button', { name: 'Generate QR' }).click();

			// QR step — the reusable QR now honours the chosen preset instead of
			// always getting expiresAt: null. See the send test above for why
			// this renders as "24 hours" rather than "1 day".
			await expect(page.getByText(/Expires in (about )?(23|24) hours/i)).toBeVisible({
				timeout: 10_000
			});
		} finally {
			await ctx.close();
			await deleteTestUser(email('receiver'));
		}
	});
});
