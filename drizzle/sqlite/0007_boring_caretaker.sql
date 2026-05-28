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
INSERT INTO `__new_payment_requests`("id", "initiating_user_id", "reusable", "direction", "amount", "description", "status", "initiator_name", "created_at", "updated_at", "expires_at", "total_received", "payment_count") SELECT "id", "initiating_user_id", "reusable", "direction", "amount", "description", "status", "initiator_name", "created_at", "updated_at", "expires_at", "total_received", "payment_count" FROM `payment_requests`;--> statement-breakpoint
DROP TABLE `payment_requests`;--> statement-breakpoint
ALTER TABLE `__new_payment_requests` RENAME TO `payment_requests`;--> statement-breakpoint
PRAGMA foreign_keys=ON;