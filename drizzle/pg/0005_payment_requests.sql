-- Rename table
ALTER TABLE "pending_qr" RENAME TO "payment_requests";

-- Add new columns
ALTER TABLE "payment_requests" ADD COLUMN "reusable" boolean NOT NULL DEFAULT false;
ALTER TABLE "payment_requests" ADD COLUMN "updated_at" timestamp NOT NULL DEFAULT now();
ALTER TABLE "payment_requests" ADD COLUMN "total_received" integer NOT NULL DEFAULT 0;
ALTER TABLE "payment_requests" ADD COLUMN "payment_count" integer NOT NULL DEFAULT 0;

-- Rename note → description
ALTER TABLE "payment_requests" RENAME COLUMN "note" TO "description";

-- Make amount nullable (was NOT NULL)
ALTER TABLE "payment_requests" ALTER COLUMN "amount" DROP NOT NULL;

-- Make expires_at nullable (was NOT NULL)
ALTER TABLE "payment_requests" ALTER COLUMN "expires_at" DROP NOT NULL;

-- Rename status values: 'pending' → 'active'
-- First expand the enum to include both old and new values
ALTER TABLE "payment_requests" ALTER COLUMN "status" TYPE text;
UPDATE "payment_requests" SET "status" = 'active' WHERE "status" = 'pending';
-- Note: Drizzle uses text with enum in PG, no actual ENUM type

-- Rename FK column on transactions
ALTER TABLE "transactions" RENAME COLUMN "pending_qr_id" TO "payment_request_id";

-- Update FK constraint name if needed (PG may auto-name it)
-- The FK still references payment_requests(id) — PG follows the rename automatically
