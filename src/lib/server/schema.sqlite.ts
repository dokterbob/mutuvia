// SPDX-License-Identifier: AGPL-3.0-or-later

import { sqliteTable, text, integer, primaryKey, uniqueIndex } from 'drizzle-orm/sqlite-core';

// ── Better Auth managed tables ──
// These are created/managed by Better Auth. We define them here for FK references only.

export const user = sqliteTable('user', {
	id: text('id').primaryKey(),
	name: text('name'),
	email: text('email'),
	emailVerified: integer('email_verified', { mode: 'boolean' }).notNull(),
	image: text('image'),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
	phoneNumber: text('phone_number'),
	phoneNumberVerified: integer('phone_number_verified', { mode: 'boolean' })
});

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

export const transactions = sqliteTable('transactions', {
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
	pendingQrId: text('pending_qr_id').references(() => pendingQr.id),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

export const pendingQr = sqliteTable('pending_qr', {
	id: text('id').primaryKey(),
	initiatingUserId: text('initiating_user_id')
		.notNull()
		.references(() => appUsers.id),
	direction: text('direction', { enum: ['send', 'receive'] }).notNull(),
	amount: integer('amount').notNull(),
	note: text('note'),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
	status: text('status', { enum: ['pending', 'completed', 'declined'] }).notNull()
});

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
	(table) => [uniqueIndex('push_subscriptions_user_endpoint_idx').on(table.userId, table.endpoint)]
);
