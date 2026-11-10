-- `endpoint` is becoming globally unique (was previously unique only per
-- user+endpoint, which let two different users each own a row for the same
-- browser push endpoint). Drop any older duplicate rows first — keeping the
-- most recently created row per endpoint — so the new unique index below
-- can be created without failing on pre-existing data.
DELETE FROM `push_subscriptions`
WHERE `rowid` NOT IN (
	SELECT MAX(`rowid`) FROM `push_subscriptions` GROUP BY `endpoint`
);--> statement-breakpoint
DROP INDEX `push_subscriptions_user_endpoint_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_idx` ON `push_subscriptions` (`endpoint`);