import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: 'html',
	expect: { timeout: 10_000 },
	use: {
		baseURL: 'http://localhost:5173',
		trace: 'on-first-retry'
	},
	webServer: {
		command: 'bun run db:migrate && bun run dev',
		env: { E2E: 'true', BETTER_AUTH_URL: 'http://localhost:5173' },
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
