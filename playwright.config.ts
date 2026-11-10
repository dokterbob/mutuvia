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
			DB_FILE_NAME: E2E_DB_FILE
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
