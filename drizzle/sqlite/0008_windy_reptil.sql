-- `endpoint` is becoming globally unique (was previously unique only per
-- user+endpoint, which let two different users each own a row for the same
-- browser push endpoint). Drop any older duplicate rows first so the new
-- unique index below can be created without failing on pre-existing data.
--
-- Each row's `created_at` reflects when that user's browser first
-- registered this endpoint: the handler this PR replaces used
-- onConflictDoNothing(), so a user re-subscribing to an endpoint they
-- already owned never updated its `created_at` (or any other column).
-- Per group of rows sharing an `endpoint`, keep the one with the latest
-- `created_at` — i.e. whichever user most recently (first) registered this
-- physical endpoint — with `id` as a deterministic tie-break when two rows
-- have the exact same `created_at`. This must NOT be `rowid`: this table
-- has no `INTEGER PRIMARY KEY`, so SQLite can and does reuse a deleted
-- row's rowid for a later insert (push-sender.ts and the subscribe cap both
-- delete rows over the table's lifetime) — insertion order and rowid order
-- can diverge, so `MAX(rowid)` is not a safe proxy for "most recent" here.
-- (Matches the ordering `DELETE ... USING` applies in the PG migration.)
DELETE FROM `push_subscriptions`
WHERE `id` NOT IN (
	SELECT a.`id` FROM `push_subscriptions` AS a
	WHERE NOT EXISTS (
		SELECT 1 FROM `push_subscriptions` AS b
		WHERE b.`endpoint` = a.`endpoint`
			AND (
				b.`created_at` > a.`created_at`
				OR (b.`created_at` = a.`created_at` AND b.`id` > a.`id`)
			)
	)
);--> statement-breakpoint
DROP INDEX `push_subscriptions_user_endpoint_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_idx` ON `push_subscriptions` (`endpoint`);