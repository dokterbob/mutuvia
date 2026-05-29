// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	pgTable,
	text,
	boolean,
	timestamp,
	integer,
	primaryKey,
	uniqueIndex
} from 'drizzle-orm/pg-core';

// ── Better Auth managed tables ──
// These are created/managed by Better Auth. We define them here for FK references only.

export const user = pgTable('user', {
	id: text('id').primaryKey(),
	name: text('name'),
	email: text('email'),
	emailVerified: boolean('email_verified').notNull(),
	image: text('image'),
	createdAt: timestamp('created_at').notNull(),
	updatedAt: timestamp('updated_at').notNull(),
	phoneNumber: text('phone_number'),
	phoneNumberVerified: boolean('phone_number_verified')
});

export const session = pgTable('session', {
	id: text('id').primaryKey(),
	expiresAt: timestamp('expires_at').notNull(),
	token: text('token').notNull().unique(),
	createdAt: timestamp('created_at').notNull(),
	updatedAt: timestamp('updated_at').notNull(),
	ipAddress: text('ip_address'),
	userAgent: text('user_agent'),
	userId: text('user_id')
		.notNull()
		.references(() => user.id)
});

export const account = pgTable('account', {
	id: text('id').primaryKey(),
	accountId: text('account_id').notNull(),
	providerId: text('provider_id').notNull(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id),
	accessToken: text('access_token'),
	refreshToken: text('refresh_token'),
	idToken: text('id_token'),
	accessTokenExpiresAt: timestamp('access_token_expires_at'),
	refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
	scope: text('scope'),
	password: text('password'),
	createdAt: timestamp('created_at').notNull(),
	updatedAt: timestamp('updated_at').notNull()
});

export const verification = pgTable('verification', {
	id: text('id').primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: timestamp('expires_at').notNull(),
	createdAt: timestamp('created_at'),
	updatedAt: timestamp('updated_at')
});

// ── Application tables ──

export const appUsers = pgTable('app_users', {
	id: text('id').primaryKey(),
	betterAuthUserId: text('better_auth_user_id')
		.notNull()
		.unique()
		.references(() => user.id),
	displayName: text('display_name').notNull(),
	sendConsentAt: timestamp('send_consent_at'),
	createdAt: timestamp('created_at').notNull(),
	lastSeenVersion: text('last_seen_version')
});

export const paymentRequests = pgTable('payment_requests', {
	id: text('id').primaryKey(),
	initiatingUserId: text('initiating_user_id')
		.notNull()
		.references(() => appUsers.id),
	reusable: boolean('reusable').notNull().default(false),
	direction: text('direction', { enum: ['send', 'receive'] }).notNull(),
	amount: integer('amount'),
	description: text('description'),
	status: text('status', {
		enum: ['active', 'paused', 'completed', 'declined', 'archived']
	})
		.notNull()
		.default('active'),
	initiatorName: text('initiator_name').notNull(),
	createdAt: timestamp('created_at').notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
	expiresAt: timestamp('expires_at'),
	totalReceived: integer('total_received').notNull().default(0),
	paymentCount: integer('payment_count').notNull().default(0)
});

export const transactions = pgTable('transactions', {
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
	createdAt: timestamp('created_at').notNull()
});

export const connections = pgTable(
	'connections',
	{
		userAId: text('user_a_id')
			.notNull()
			.references(() => appUsers.id),
		userBId: text('user_b_id')
			.notNull()
			.references(() => appUsers.id),
		createdAt: timestamp('created_at').notNull()
	},
	(table) => [primaryKey({ columns: [table.userAId, table.userBId] })]
);

export const pushSubscriptions = pgTable(
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
		createdAt: timestamp('created_at').notNull()
	},
	(table) => [uniqueIndex('push_subscriptions_user_endpoint_idx').on(table.userId, table.endpoint)]
);
