CREATE UNIQUE INDEX "user_phone_number_idx" ON "user" USING btree ("phone_number");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_idx" ON "user" USING btree ("email");