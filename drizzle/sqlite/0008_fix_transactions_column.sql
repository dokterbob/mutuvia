-- Corrective migration: rename pending_qr_id → payment_request_id on transactions.
-- Migration 0006 was missing -->statement-breakpoint markers so only its first
-- statement (ALTER TABLE RENAME) ran; the transactions table rebuild was silently
-- skipped. This migration finishes that work on all affected databases.
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
