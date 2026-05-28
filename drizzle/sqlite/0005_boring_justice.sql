-- DEFAULT '' is a migration-only safety net for any existing rows.
-- SQLite does not support ALTER COLUMN ... DROP DEFAULT, so the DB-level default
-- remains, but the Drizzle schema (notNull, no .$defaultFn) ensures all
-- application inserts supply this value explicitly.
ALTER TABLE `pending_qr` ADD `initiator_name` text NOT NULL DEFAULT '';