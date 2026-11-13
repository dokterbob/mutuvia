-- `endpoint` is becoming globally unique (was previously unique only per
-- user+endpoint, which let two different users each own a row for the same
-- browser push endpoint). Drop any older duplicate rows first so the new
-- unique index below can be created without failing on pre-existing data.
--
-- Each row's `created_at` reflects when that user's browser first
-- registered this endpoint: the handler this PR replaces used
-- onConflictDoNothing(), so a user re-subscribing to an endpoint they
-- already owned never updated its `created_at` (or any other column). Per
-- group of rows sharing an `endpoint`, keep the one with the latest
-- `created_at` — i.e. whichever user most recently (first) registered this
-- physical endpoint — with `id` as a deterministic tie-break when two rows
-- have the exact same `created_at`. (Matches the ordering the SQLite
-- migration applies.)
DELETE FROM "push_subscriptions" a
USING "push_subscriptions" b
WHERE a."endpoint" = b."endpoint"
	AND (a."created_at" < b."created_at" OR (a."created_at" = b."created_at" AND a."id" < b."id"));--> statement-breakpoint
DROP INDEX "push_subscriptions_user_endpoint_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_idx" ON "push_subscriptions" USING btree ("endpoint");