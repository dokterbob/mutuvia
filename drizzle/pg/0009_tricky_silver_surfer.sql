CREATE TABLE "otp_throttle" (
	"id" text PRIMARY KEY NOT NULL,
	"destination" text NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE INDEX "otp_throttle_destination_idx" ON "otp_throttle" USING btree ("destination","created_at");