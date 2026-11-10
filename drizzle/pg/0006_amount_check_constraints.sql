ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_amount_positive_check" CHECK ("payment_requests"."amount" IS NULL OR "payment_requests"."amount" > 0);--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_amount_positive_check" CHECK ("transactions"."amount" > 0);--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_not_self_payment_check" CHECK ("transactions"."from_user_id" <> "transactions"."to_user_id");--> statement-breakpoint
-- Pre-existing drift fix, unrelated to the CHECK constraints above: migration
-- 0005 renamed the `pending_qr_id` COLUMN to `payment_request_id` (and the
-- `pending_qr` table to `payment_requests`), but PostgreSQL does not rename
-- dependent constraints when you rename the column/table they reference. So
-- on a database built through this migration history, the FK constraint on
-- transactions.payment_request_id is still named
-- `transactions_pending_qr_id_pending_qr_id_fk`, while drizzle-kit's naming
-- convention (and this migration's generated snapshot) now expects
-- `transactions_payment_request_id_payment_requests_id_fk`. Renamed here,
-- idempotently, so the snapshot matches reality and `drizzle-kit generate`
-- stops proposing this rename on every future schema change. Guarded both
-- ways because a database created via `db:push:pg` (schema push, no
-- migration history) may already have the new name and never had the old one.
DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'transactions_pending_qr_id_pending_qr_id_fk'
	) AND NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'transactions_payment_request_id_payment_requests_id_fk'
	) THEN
		ALTER TABLE "transactions" RENAME CONSTRAINT "transactions_pending_qr_id_pending_qr_id_fk" TO "transactions_payment_request_id_payment_requests_id_fk";
	END IF;
END $$;
