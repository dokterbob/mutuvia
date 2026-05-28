ALTER TABLE "payment_requests" ALTER COLUMN "status" SET DEFAULT 'active';--> statement-breakpoint
ALTER TABLE "payment_requests" ALTER COLUMN "reusable" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "payment_requests" ALTER COLUMN "updated_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "payment_requests" ALTER COLUMN "total_received" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "payment_requests" ALTER COLUMN "payment_count" SET DEFAULT 0;