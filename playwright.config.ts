import { defineConfig, devices } from '@playwright/test';
import { E2E_DB_FILE, E2E_AUTH_SECRET, E2E_BASE_URL } from './e2e/config.js';

export default defineConfig({
	testDir: './e2e',
	globalSetup: './e2e/global-setup.ts',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: 'html',
	expect: { timeout: 10_000 },
	use: {
		baseURL: E2E_BASE_URL,
		trace: 'on-first-retry'
	},
	webServer: {
		// NODE_ENV=test is set only on the final `bun ./build/index.js`
		// (the server start), NOT via `env` below (which would apply to the
		// whole command, including `bun run build`) — setting NODE_ENV
		// during the build changes Vite's own build mode and breaks client
		// hydration (see commit history). This built server is still
		// production-shaped (no real OTP channel, a non-secret
		// BETTER_AUTH_SECRET), so validateConfig() (src/lib/config.ts) must
		// be told at runtime that it's not production — leaving NODE_ENV
		// unset would now fail closed and refuse to start (by design; see
		// config.isProduction).
		command: `rm -f ${E2E_DB_FILE} ${E2E_DB_FILE}-wal ${E2E_DB_FILE}-shm && bun run db:migrate && bun run build && NODE_ENV=test bun ./build/index.js`,
		env: {
			E2E: 'true',
			PORT: '5174',
			ORIGIN: E2E_BASE_URL,
			APP_URL: E2E_BASE_URL,
			BETTER_AUTH_SECRET: E2E_AUTH_SECRET,
			DB_FILE_NAME: E2E_DB_FILE,
			// Deterministic tests, not an accidental production footgun: see
			// config.rateLimitEnabled's own doc comment — this flag is only
			// ever honoured when NODE_ENV is development/test (set above,
			// runtime-only, on the server-start segment of `command`, same
			// reasoning as the comment there), so it can never silently
			// disable rate limiting on a real deployment. Without it, Better
			// Auth's rate limiter (3 sign-ins per 10s on `/sign-in/*`, plus
			// the stricter OTP-send/verify customRules in auth.ts) would make
			// this suite — many parallel workers repeatedly signing in from
			// one test-runner address — flaky by design, not by bug. This env
			// var is read only at runtime (by src/lib/config.ts, consulted
			// once when auth.ts loads as the server starts), never during
			// `bun run build`, so it's safe here unlike NODE_ENV above.
			RATE_LIMIT_DISABLE_FOR_TESTING: 'true',
			// Same reasoning, for the independent per-destination OTP send
			// throttle (otp-throttle.ts): several E2E files (e.g.
			// settings-credentials.test.ts) deliberately reuse one
			// fixture-derived email/phone across several sequential test
			// cases, which legitimately exceeds the throttle's real-world
			// thresholds well before the file finishes.
			OTP_THROTTLE_DISABLE_FOR_TESTING: 'true'
		},
		stdout: 'pipe',
		stderr: 'pipe',
		timeout: 180_000,
		gracefulShutdown: { signal: 'SIGINT', timeout: 3000 },
		wait: {
			stdout: /Listening/
		}
	},
	projects: [
		{
			name: 'chromium',
			use: {
				...devices['Desktop Chrome'],
				// --no-sandbox is required when Chromium runs as root (e.g. inside a Docker container)
				launchOptions:
					typeof process.getuid === 'function' && process.getuid() === 0
						? { args: ['--no-sandbox'] }
						: undefined
			}
		}
	]
});
