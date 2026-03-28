// SPDX-License-Identifier: AGPL-3.0-or-later

import { pgTable, text, boolean, timestamp, integer, primaryKey } from 'drizzle-orm/pg-core';

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
	createdAt: timestamp('created_at').notNull()
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
	pendingQrId: text('pending_qr_id').references(() => pendingQr.id),
	createdAt: timestamp('created_at').notNull()
});

export const pendingQr = pgTable('pending_qr', {
	id: text('id').primaryKey(),
	initiatingUserId: text('initiating_user_id')
		.notNull()
		.references(() => appUsers.id),
	direction: text('direction', { enum: ['send', 'receive'] }).notNull(),
	amount: integer('amount').notNull(),
	note: text('note'),
	createdAt: timestamp('created_at').notNull(),
	expiresAt: timestamp('expires_at').notNull(),
	status: text('status', { enum: ['pending', 'completed', 'declined'] }).notNull()
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
