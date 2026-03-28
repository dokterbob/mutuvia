/**
 * Playwright global setup.
 *
 * DB cleanup now happens in the webServer command (before migration), because
 * globalSetup runs AFTER the webServer is ready — deleting the DB here would
 * wipe the freshly-migrated tables.
 */
export default async function globalSetup() {
	// intentionally empty — DB lifecycle is handled by the webServer command
}
