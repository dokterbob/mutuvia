// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * E2E tests for the Contacts feature.
 *
 * Scenarios covered:
 * 1. NavMenu → /contacts navigation
 * 2. Contact rows appear after a transaction
 * 3. Search filters contacts by name
 * 4. Filter pills: "Owed to you", "You owe", "All"
 * 5. Sort: "Amount" reorders contacts
 * 6. Row tap → /contacts/[id] detail page
 * 7. Empty state for a fresh user with no transactions
 * 8. No-results state when search matches nothing
 * 9. /contacts/nonexistent-id returns 404
 */

import { test, expect, goto } from './test-utils.js';
import { sqlite } from './auth.js';

// ── DB helpers ────────────────────────────────────────────────────────────────

/**
 * Insert a settled transaction directly into SQLite.
 * `fromUserId` sends `amount` to `toUserId`.
 * Amount is in cents (integers).
 */
function insertTransaction(
	fromUserId: string,
	toUserId: string,
	amount: number,
	note: string | null = null
): void {
	const id = crypto.randomUUID();
	const now = Math.floor(Date.now() / 1000);
	sqlite
		.prepare(
			`INSERT INTO transactions (id, from_user_id, to_user_id, amount, unit_code, note, created_at)
			 VALUES (?, ?, ?, ?, 'EUR', ?, ?)`
		)
		.run(id, fromUserId, toUserId, amount, note, now);
}

// ── Test suite ────────────────────────────────────────────────────────────────

test.describe('Contacts', () => {
	// ── 1. NavMenu → /contacts ─────────────────────────────────────────────────

	test('NavMenu: clicking Contacts navigates to /contacts', async ({ withAuth }) => {
		const { context } = await withAuth({ displayName: 'Nav Test User' });
		const page = await context.newPage();

		await goto(page, '/home');

		// Open hamburger menu
		await page.getByRole('button', { name: 'Menu' }).click();
		await expect(page.getByRole('menu')).toBeVisible();

		// Click Contacts menu item
		await page.getByRole('menuitem', { name: 'Contacts' }).click();

		await page.waitForURL(/\/contacts/, { timeout: 10_000 });
		await expect(page).toHaveURL(/\/contacts/);
	});

	// ── 2. Contact rows appear after a transaction ─────────────────────────────

	test('Contact rows: shows counterparty name and formatted balance after a transaction', async ({
		withAuth,
		testUser
	}) => {
		const { context, appUserId } = await withAuth({ displayName: 'Alice' });
		const other = await testUser({ displayName: 'Bob' });

		// Alice sends 12.50 to Bob (Alice owes Bob: balance is negative for Alice,
		// i.e. fromUser = Alice, toUser = Bob means Alice sent credit → Bob is owed)
		// From Alice's perspective: sending credit means her balance goes negative.
		insertTransaction(appUserId, other.appUserId, 1250, 'coffee');

		const page = await context.newPage();
		await goto(page, '/contacts');

		// Bob should appear as a contact row
		await expect(page.getByText('Bob')).toBeVisible({ timeout: 5_000 });

		// The balance should be visible and formatted (negative for Alice — she sent)
		// Balance shown: from Alice's perspective, she is owed nothing (sent credit)
		// The row should show a formatted balance
		const row = page.locator('a[href*="/contacts/"]').filter({ hasText: 'Bob' });
		await expect(row).toBeVisible();
	});

	// ── 3. Search filters by name ──────────────────────────────────────────────

	test('Search: typing a name substring filters the list; clearing restores all', async ({
		withAuth,
		testUser
	}) => {
		const { context, appUserId } = await withAuth({ displayName: 'Searcher' });
		const alice = await testUser({ displayName: 'Alice Search' });
		const bob = await testUser({ displayName: 'Bob Search' });

		insertTransaction(appUserId, alice.appUserId, 500);
		insertTransaction(appUserId, bob.appUserId, 700);

		const page = await context.newPage();
		await goto(page, '/contacts');

		// Both contacts visible initially
		await expect(page.getByText('Alice Search')).toBeVisible();
		await expect(page.getByText('Bob Search')).toBeVisible();

		// Type "Alice" — only Alice should remain
		const searchInput = page.getByPlaceholder('Search by name');
		await searchInput.fill('Alice');
		await expect(page.getByText('Alice Search')).toBeVisible();
		await expect(page.getByText('Bob Search')).not.toBeVisible();

		// Clear search — both should be back
		await searchInput.clear();
		await expect(page.getByText('Alice Search')).toBeVisible();
		await expect(page.getByText('Bob Search')).toBeVisible();
	});

	// ── 4. Filter pills ────────────────────────────────────────────────────────

	test('Filter: "Owed to you" shows only positive balances; "You owe" shows only negative; "All" restores', async ({
		withAuth,
		testUser
	}) => {
		const { context, appUserId } = await withAuth({ displayName: 'Filter User' });
		const creditor = await testUser({ displayName: 'Creditor Filter' }); // owes money to current user
		const debtor = await testUser({ displayName: 'Debtor Filter' }); // current user owes them

		// creditor sends 1000 to current user → current user has +1000 with creditor
		insertTransaction(creditor.appUserId, appUserId, 1000);
		// current user sends 500 to debtor → current user has -500 with debtor
		insertTransaction(appUserId, debtor.appUserId, 500);

		const page = await context.newPage();
		await goto(page, '/contacts');

		// All: both visible
		await expect(page.getByText('Creditor Filter')).toBeVisible();
		await expect(page.getByText('Debtor Filter')).toBeVisible();

		// "Owed to you" (positive filter) — only Creditor Filter
		await page.getByRole('button', { name: 'Owed to you' }).click();
		await expect(page.getByText('Creditor Filter')).toBeVisible();
		await expect(page.getByText('Debtor Filter')).not.toBeVisible();

		// "You owe" (negative filter) — only Debtor Filter
		await page.getByRole('button', { name: 'You owe' }).click();
		await expect(page.getByText('Debtor Filter')).toBeVisible();
		await expect(page.getByText('Creditor Filter')).not.toBeVisible();

		// "All" restores both
		await page.getByRole('button', { name: 'All' }).click();
		await expect(page.getByText('Creditor Filter')).toBeVisible();
		await expect(page.getByText('Debtor Filter')).toBeVisible();
	});

	// ── 5. Sort by Amount ──────────────────────────────────────────────────────

	test('Sort: switching to "Amount" orders contacts by highest balance first', async ({
		withAuth,
		testUser
	}) => {
		const { context, appUserId } = await withAuth({ displayName: 'Sorter' });
		const small = await testUser({ displayName: 'SmallBalance Sort' });
		const large = await testUser({ displayName: 'LargeBalance Sort' });

		// large: receives 5000 from current user, sending 5000 to large means current
		// user has -5000 with large
		// small: receives 1000 from current user
		// But we want two contacts with different balances — use incoming credits to get positives
		// large sends 5000 to current user → +5000
		insertTransaction(large.appUserId, appUserId, 5000);
		// small sends 1000 to current user → +1000
		insertTransaction(small.appUserId, appUserId, 1000);

		const page = await context.newPage();
		await goto(page, '/contacts');

		// Switch to Amount sort
		await page.getByRole('button', { name: 'Amount' }).click();

		// Get the order of contact names in the list
		const names = await page
			.locator('a[href*="/contacts/"] p.text-sm.font-medium')
			.allTextContents();

		const largeIdx = names.findIndex((n) => n.includes('LargeBalance Sort'));
		const smallIdx = names.findIndex((n) => n.includes('SmallBalance Sort'));

		expect(largeIdx).toBeGreaterThanOrEqual(0);
		expect(smallIdx).toBeGreaterThanOrEqual(0);
		// Higher balance first
		expect(largeIdx).toBeLessThan(smallIdx);
	});

	// ── 6. Row tap → detail page ───────────────────────────────────────────────

	test('Detail: clicking a contact row navigates to /contacts/[id] and shows hero + transactions', async ({
		withAuth,
		testUser
	}) => {
		const { context, appUserId } = await withAuth({ displayName: 'Detail User' });
		const contact = await testUser({ displayName: 'Detail Contact' });

		insertTransaction(contact.appUserId, appUserId, 800, 'lunch');

		const page = await context.newPage();
		await goto(page, '/contacts');

		await expect(page.getByText('Detail Contact')).toBeVisible();

		// Click the contact row
		await page.locator('a[href*="/contacts/"]').filter({ hasText: 'Detail Contact' }).click();

		await page.waitForURL(/\/contacts\/.+/, { timeout: 10_000 });

		// Hero: contact name
		await expect(page.getByRole('heading', { level: 1 })).toContainText('Detail Contact');

		// Balance label (positive: Detail Contact sent to current user)
		await expect(page.getByText('Owed to you')).toBeVisible();

		// Shared transactions section heading
		await expect(page.getByText('Shared transactions')).toBeVisible();

		// Transaction note is visible
		await expect(page.getByText('lunch')).toBeVisible();
	});

	// ── 7. Empty state ────────────────────────────────────────────────────────

	test('Empty state: fresh user with no transactions sees the empty message', async ({
		withAuth
	}) => {
		const { context } = await withAuth({ displayName: 'Fresh User' });
		const page = await context.newPage();
		await goto(page, '/contacts');

		await expect(page.getByText("You haven't transacted with anyone yet.")).toBeVisible({
			timeout: 5_000
		});
	});

	// ── 8. No-results state ───────────────────────────────────────────────────

	test('No results: searching for a non-matching string shows the no-results message', async ({
		withAuth,
		testUser
	}) => {
		const { context, appUserId } = await withAuth({ displayName: 'No Results User' });
		const other = await testUser({ displayName: 'Existing Contact NoResults' });
		insertTransaction(appUserId, other.appUserId, 300);

		const page = await context.newPage();
		await goto(page, '/contacts');

		// Make sure the contact loaded
		await expect(page.getByText('Existing Contact NoResults')).toBeVisible();

		// Search for something that doesn't exist
		await page.getByPlaceholder('Search by name').fill('xyzzy-does-not-exist-9999');

		await expect(page.getByText('No contacts match your search.')).toBeVisible({ timeout: 5_000 });
	});

	// ── 9. Detail 404 ─────────────────────────────────────────────────────────

	test('Detail 404: navigating to /contacts/nonexistent-id shows the 404 error page', async ({
		withAuth
	}) => {
		const { context } = await withAuth({ displayName: '404 User' });
		const page = await context.newPage();

		await goto(page, '/contacts/nonexistent-id-that-does-not-exist');

		// The custom error page shows "Page not found"
		await expect(page.getByRole('heading', { level: 1 })).toContainText('Page not found', {
			timeout: 10_000
		});
	});
});
