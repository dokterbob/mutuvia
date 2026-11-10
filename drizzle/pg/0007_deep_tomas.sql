-- `endpoint` is becoming globally unique (was previously unique only per
-- user+endpoint, which let two different users each own a row for the same
-- browser push endpoint). Drop any older duplicate rows first — keeping the
-- most recently created row per endpoint — so the new unique index below
-- can be created without failing on pre-existing data.
DELETE FROM "push_subscriptions" a
USING "push_subscriptions" b
WHERE a."endpoint" = b."endpoint"
	AND (a."created_at" < b."created_at" OR (a."created_at" = b."created_at" AND a."id" < b."id"));--> statement-breakpoint
DROP INDEX "push_subscriptions_user_endpoint_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_idx" ON "push_subscriptions" USING btree ("endpoint");