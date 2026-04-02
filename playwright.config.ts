import { defineConfig, devices } from '@playwright/test';
import { E2E_DB_FILE, E2E_AUTH_SECRET, E2E_BASE_URL, E2E_QR_JWT_SECRET } from './e2e/config.js';

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
		command: `rm -f ${E2E_DB_FILE} ${E2E_DB_FILE}-wal ${E2E_DB_FILE}-shm && bun run db:migrate && bun run build && bun ./build/index.js`,
		env: {
			E2E: 'true',
			PORT: '5174',
			ORIGIN: E2E_BASE_URL,
			APP_URL: E2E_BASE_URL,
			BETTER_AUTH_SECRET: E2E_AUTH_SECRET,
			DB_FILE_NAME: E2E_DB_FILE,
			QR_JWT_SECRET: E2E_QR_JWT_SECRET
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
				// --no-sandbox is required when running as root inside a Docker container
				launchOptions: process.env.CI ? { args: ['--no-sandbox'] } : {}
			}
		}
	]
});
