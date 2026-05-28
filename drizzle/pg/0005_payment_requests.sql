ALTER TABLE "pending_qr" RENAME TO "payment_requests";--> statement-breakpoint
ALTER TABLE "payment_requests" RENAME COLUMN "note" TO "description";--> statement-breakpoint
ALTER TABLE "transactions" RENAME COLUMN "pending_qr_id" TO "payment_request_id";--> statement-breakpoint
ALTER TABLE "payment_requests" ADD COLUMN "reusable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD COLUMN "total_received" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD COLUMN "payment_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_requests" ALTER COLUMN "amount" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_requests" ALTER COLUMN "expires_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_requests" ALTER COLUMN "status" SET DEFAULT 'active';--> statement-breakpoint
UPDATE "payment_requests" SET "status" = 'active' WHERE "status" = 'pending';
