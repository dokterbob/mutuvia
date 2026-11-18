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
	FOREIGN KEY (`initiating_user_id`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payment_requests_amount_positive_check" CHECK("amount" IS NULL OR "amount" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_payment_requests`("id", "initiating_user_id", "reusable", "direction", "amount", "description", "status", "initiator_name", "created_at", "updated_at", "expires_at", "total_received", "payment_count") SELECT "id", "initiating_user_id", "reusable", "direction", "amount", "description", "status", "initiator_name", "created_at", "updated_at", "expires_at", "total_received", "payment_count" FROM `payment_requests`;--> statement-breakpoint
DROP TABLE `payment_requests`;--> statement-breakpoint
ALTER TABLE `__new_payment_requests` RENAME TO `payment_requests`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
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
	FOREIGN KEY (`payment_request_id`) REFERENCES `payment_requests`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "transactions_amount_positive_check" CHECK("amount" > 0),
	CONSTRAINT "transactions_not_self_payment_check" CHECK("from_user_id" <> "to_user_id")
);
--> statement-breakpoint
INSERT INTO `__new_transactions`("id", "from_user_id", "to_user_id", "amount", "unit_code", "note", "payment_request_id", "created_at") SELECT "id", "from_user_id", "to_user_id", "amount", "unit_code", "note", "payment_request_id", "created_at" FROM `transactions`;--> statement-breakpoint
DROP TABLE `transactions`;--> statement-breakpoint
ALTER TABLE `__new_transactions` RENAME TO `transactions`;