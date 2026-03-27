import { defineConfig, devices } from '@playwright/test';

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
		baseURL: 'http://localhost:5174',
		trace: 'on-first-retry'
	},
	webServer: {
		command: 'bun run db:migrate && bun run dev -- --port 5174',
		env: {
			E2E: 'true',
			APP_URL: 'http://localhost:5174',
			BETTER_AUTH_URL: 'http://localhost:5174',
			BETTER_AUTH_SECRET: 'e2e-test-only-better-auth-secret-not-for-production!!',
			DB_FILE_NAME: 'test.db',
			QR_JWT_SECRET: 'e2e-test-only-secret-do-not-use-in-production!!'
		},
		stdout: 'pipe',
		stderr: 'pipe',
		timeout: 120_000,
		gracefulShutdown: { signal: 'SIGINT', timeout: 3000 },
		wait: {
			stdout: /ready in/
		}
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});
