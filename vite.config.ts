import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';
import { sentrySvelteKit } from '@sentry/sveltekit';
import { paraglideVitePlugin } from '@inlang/paraglide-js';

export default defineConfig({
	plugins: [
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			strategy: ['cookie', 'preferredLanguage', 'baseLocale']
		}),
		tailwindcss(),
		sentrySvelteKit({
			// Source map upload requires SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT env vars.
			// Disabled automatically when SENTRY_AUTH_TOKEN is not set.
			autoUploadSourceMaps: !!process.env.SENTRY_AUTH_TOKEN
		}),
		sveltekit()
	],
	ssr: {
		external: ['bun:sqlite', 'bun:sql']
	},
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					server: {
						deps: {
							external: ['bun:sqlite']
						}
					}
				}
			}
		]
	}
});
