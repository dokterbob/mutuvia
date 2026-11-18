// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	sqliteTable,
	text,
	integer,
	primaryKey,
	uniqueIndex,
	index,
	check
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ── Better Auth managed tables ──
// These are created/managed by Better Auth. We define them here for FK references only.

export const user = sqliteTable(
	'user',
	{
		id: text('id').primaryKey(),
		name: text('name'),
		email: text('email'),
		emailVerified: integer('email_verified', { mode: 'boolean' }).notNull(),
		image: text('image'),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
		phoneNumber: text('phone_number'),
		phoneNumberVerified: integer('phone_number_verified', { mode: 'boolean' })
	},
	(table) => [
		// Backstop against the phone-number pre-claim attack (see auth.ts and
		// auth.test.ts) and against two concurrent email/phone changes landing
		// on the same value (see settings' change-email/change-phone races) —
		// in either case the DB now rejects the write outright instead of
		// silently allowing two users to share a credential.
		//
		// Both columns are nullable and a plain (non-partial, non-expression)
		// unique index is used deliberately: SQLite and PostgreSQL both treat
		// NULL as distinct from every other NULL under a unique constraint, so
		// any number of users with no phone number (NULL) coexist fine — this
		// is the only state we need to tolerate, since every user row always
		// gets a non-null `email` (a real one, or a synthetic placeholder from
		// `makePlaceholderEmail` for phone-first sign-ups — see
		// src/lib/placeholder-email.ts). Case: every write path that sets
		// `email` already lowercases it first (`/sign-in/email-otp`,
		// `/email-otp/change-email`, `makePlaceholderEmail`'s digits-only
		// output) — see schema.pg.ts / the migration for the detection queries
		// to run before applying this to an existing database with
		// case-varying or duplicate data.
		uniqueIndex('user_phone_number_idx').on(table.phoneNumber),
		uniqueIndex('user_email_idx').on(table.email)
	]
);

export const session = sqliteTable('session', {
	id: text('id').primaryKey(),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
	token: text('token').notNull().unique(),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
	ipAddress: text('ip_address'),
	userAgent: text('user_agent'),
	userId: text('user_id')
		.notNull()
		.references(() => user.id)
});

export const account = sqliteTable('account', {
	id: text('id').primaryKey(),
	accountId: text('account_id').notNull(),
	providerId: text('provider_id').notNull(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id),
	accessToken: text('access_token'),
	refreshToken: text('refresh_token'),
	idToken: text('id_token'),
	accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
	refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
	scope: text('scope'),
	password: text('password'),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
});

export const verification = sqliteTable('verification', {
	id: text('id').primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' }),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
});

// Better Auth's own IP-based rate limiter, with `rateLimit.storage: 'database'`
// in auth.ts. Field names (`key`, `count`, `lastRequest`) are dictated by
// Better Auth's internal `getAuthTables()` (@better-auth/core/db/get-tables.mjs)
// and MUST match exactly — the Drizzle adapter accesses them as plain JS
// property names (not through its DB-column mapping), independent of the
// actual SQL column names below. Better Auth does not prune this table
// itself — see the "Rate limit table cleanup" note in the PR description for
// what that means operationally.
export const rateLimit = sqliteTable('rate_limit', {
	id: text('id').primaryKey(),
	key: text('key').notNull().unique(),
	count: integer('count').notNull(),
	lastRequest: integer('last_request').notNull()
});

// ── Application tables ──

export const appUsers = sqliteTable('app_users', {
	id: text('id').primaryKey(),
	betterAuthUserId: text('better_auth_user_id')
		.notNull()
		.unique()
		.references(() => user.id),
	displayName: text('display_name').notNull(),
	sendConsentAt: integer('send_consent_at', { mode: 'timestamp' }),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
	lastSeenVersion: text('last_seen_version')
});

export const paymentRequests = sqliteTable(
	'payment_requests',
	{
		id: text('id').primaryKey(),
		initiatingUserId: text('initiating_user_id')
			.notNull()
			.references(() => appUsers.id),
		reusable: integer('reusable', { mode: 'boolean' }).notNull().default(false),
		direction: text('direction', { enum: ['send', 'receive'] }).notNull(),
		amount: integer('amount'),
		description: text('description'),
		status: text('status', {
			enum: ['active', 'paused', 'completed', 'declined', 'archived']
		})
			.notNull()
			.default('active'),
		initiatorName: text('initiator_name').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
		expiresAt: integer('expires_at', { mode: 'timestamp' }),
		totalReceived: integer('total_received').notNull().default(0),
		paymentCount: integer('payment_count').notNull().default(0)
	},
	() => [
		// amount is nullable (an "open amount" reusable request has none), but
		// when set it must be a positive sanity-bounded value — same invariant
		// enforced in application code by parseAmount().
		//
		// Deliberately unqualified column names (not `table.amount`, which
		// Drizzle renders table-qualified): SQLite can't ALTER TABLE ADD
		// CONSTRAINT, so any future migration touching this table goes through
		// a rebuild (CREATE __new_X, copy, DROP, RENAME). A qualified reference
		// bakes the table's *temporary* rebuild name into the stored CHECK
		// clause, and SQLite's RENAME TO then fails to resolve it afterwards
		// ("no such column: __new_payment_requests.amount").
		check('payment_requests_amount_positive_check', sql`"amount" IS NULL OR "amount" > 0`)
	]
);

export const transactions = sqliteTable(
	'transactions',
	{
		id: text('id').primaryKey(),
		fromUserId: text('from_user_id')
			.notNull()
			.references(() => appUsers.id),
		toUserId: text('to_user_id')
			.notNull()
			.references(() => appUsers.id),
		amount: integer('amount').notNull(),
		unitCode: text('unit_code').notNull(),
		note: text('note'),
		paymentRequestId: text('payment_request_id').references(() => paymentRequests.id),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
	},
	() => [
		// See the comment on payment_requests' check() above for why these use
		// bare, unqualified column names.
		check('transactions_amount_positive_check', sql`"amount" > 0`),
		check('transactions_not_self_payment_check', sql`"from_user_id" <> "to_user_id"`)
	]
);

export const connections = sqliteTable(
	'connections',
	{
		userAId: text('user_a_id')
			.notNull()
			.references(() => appUsers.id),
		userBId: text('user_b_id')
			.notNull()
			.references(() => appUsers.id),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [primaryKey({ columns: [table.userAId, table.userBId] })]
);

export const pushSubscriptions = sqliteTable(
	'push_subscriptions',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => appUsers.id, { onDelete: 'cascade' }),
		endpoint: text('endpoint').notNull(),
		p256dh: text('p256dh').notNull(),
		auth: text('auth').notNull(),
		userAgent: text('user_agent'),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
	},
	// `endpoint` alone (not userId+endpoint) is unique: a shared browser can only
	// ever have one owner for a given push endpoint. Subscribing re-assigns
	// ownership to the subscribing user (see src/routes/api/push/subscribe/+server.ts).
	(table) => [uniqueIndex('push_subscriptions_endpoint_idx').on(table.endpoint)]
);

// Per-destination OTP send throttle — independent of client IP (see
// src/lib/server/otp-throttle.ts for the atomic check-and-record logic).
// One row per OTP actually sent to `destination` (a normalized E.164 phone
// number or lowercased email). An append-only log rather than a counter
// because we enforce two independent windows at once (e.g. 3/10min AND
// 10/day) — a single counter+lastRequest row (Better Auth's own rateLimit
// shape) can't represent that. Rows older than the longer window are pruned
// opportunistically on each check, so this table stays bounded.
export const otpThrottle = sqliteTable(
	'otp_throttle',
	{
		id: text('id').primaryKey(),
		destination: text('destination').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [index('otp_throttle_destination_idx').on(table.destination, table.createdAt)]
);
