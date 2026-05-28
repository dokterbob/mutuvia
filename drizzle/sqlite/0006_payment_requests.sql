-- Rename table
ALTER TABLE `pending_qr` RENAME TO `payment_requests`;

-- Add new columns (all additive)
ALTER TABLE `payment_requests` ADD `reusable` integer NOT NULL DEFAULT 0;
ALTER TABLE `payment_requests` ADD `updated_at` integer NOT NULL DEFAULT (unixepoch());
ALTER TABLE `payment_requests` ADD `total_received` integer NOT NULL DEFAULT 0;
ALTER TABLE `payment_requests` ADD `payment_count` integer NOT NULL DEFAULT 0;

-- Rename note → description (SQLite requires table rebuild)
-- Step 1: create new table with correct schema
CREATE TABLE `payment_requests_new` (
  `id` text PRIMARY KEY NOT NULL,
  `initiating_user_id` text NOT NULL REFERENCES `app_users`(`id`),
  `reusable` integer NOT NULL DEFAULT 0,
  `direction` text NOT NULL,
  `amount` integer,
  `description` text,
  `status` text NOT NULL DEFAULT 'active',
  `initiator_name` text NOT NULL DEFAULT '',
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL DEFAULT (unixepoch()),
  `expires_at` integer,
  `total_received` integer NOT NULL DEFAULT 0,
  `payment_count` integer NOT NULL DEFAULT 0
);

-- Step 2: copy data, renaming note → description, 'pending' → 'active', making expires_at nullable
INSERT INTO `payment_requests_new`
  SELECT `id`, `initiating_user_id`, 0, `direction`, `amount`, `note`,
         CASE WHEN `status` = 'pending' THEN 'active' ELSE `status` END,
         `initiator_name`, `created_at`, `created_at`, `expires_at`, 0, 0
  FROM `payment_requests`;

-- Step 3: drop old, rename new
DROP TABLE `payment_requests`;
ALTER TABLE `payment_requests_new` RENAME TO `payment_requests`;

-- Rename FK column on transactions (also requires table rebuild in SQLite)
CREATE TABLE `transactions_new` (
  `id` text PRIMARY KEY NOT NULL,
  `from_user_id` text NOT NULL REFERENCES `app_users`(`id`),
  `to_user_id` text NOT NULL REFERENCES `app_users`(`id`),
  `amount` integer NOT NULL,
  `unit_code` text NOT NULL,
  `note` text,
  `payment_request_id` text REFERENCES `payment_requests`(`id`),
  `created_at` integer NOT NULL
);

INSERT INTO `transactions_new`
  SELECT `id`, `from_user_id`, `to_user_id`, `amount`, `unit_code`, `note`, `pending_qr_id`, `created_at`
  FROM `transactions`;

DROP TABLE `transactions`;
ALTER TABLE `transactions_new` RENAME TO `transactions`;
