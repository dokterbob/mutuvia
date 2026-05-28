ALTER TABLE `pending_qr` RENAME TO `payment_requests`;--> statement-breakpoint
ALTER TABLE `payment_requests` RENAME COLUMN `note` TO `description`;--> statement-breakpoint
-- Table rebuild: add new columns (reusable, updated_at, total_received, payment_count),
-- make `amount` and `expires_at` nullable, and update status default.
-- New columns use safe literal defaults; updated_at is seeded from created_at.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_payment_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`initiating_user_id` text NOT NULL,
	`reusable` integer DEFAULT false NOT NULL,
	`direction` text NOT NULL,
	`amount` integer,
	`description` text,
	`status` text DEFAULT 'active' NOT NULL,
	`initiator_name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer,
	`total_received` integer DEFAULT 0 NOT NULL,
	`payment_count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`initiating_user_id`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_payment_requests`("id", "initiating_user_id", "reusable", "direction", "amount", "description", "status", "initiator_name", "created_at", "updated_at", "expires_at", "total_received", "payment_count") SELECT "id", "initiating_user_id", false, "direction", "amount", "description", "status", "initiator_name", "created_at", "created_at", "expires_at", 0, 0 FROM `payment_requests`;--> statement-breakpoint
DROP TABLE `payment_requests`;--> statement-breakpoint
ALTER TABLE `__new_payment_requests` RENAME TO `payment_requests`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
-- Rename pending_qr_id → payment_request_id on transactions (table rebuild required in SQLite)
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`from_user_id` text NOT NULL,
	`to_user_id` text NOT NULL,
	`amount` integer NOT NULL,
	`unit_code` text NOT NULL,
	`note` text,
	`payment_request_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`from_user_id`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_user_id`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_request_id`) REFERENCES `payment_requests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_transactions`("id", "from_user_id", "to_user_id", "amount", "unit_code", "note", "payment_request_id", "created_at") SELECT "id", "from_user_id", "to_user_id", "amount", "unit_code", "note", "pending_qr_id", "created_at" FROM `transactions`;--> statement-breakpoint
DROP TABLE `transactions`;--> statement-breakpoint
ALTER TABLE `__new_transactions` RENAME TO `transactions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
