import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import { sentrySvelteKit } from '@sentry/sveltekit';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import type { ViteDevServer } from 'vite';

// In dev, populate APP_URL from Vite's resolved URLs so that mobile testing
// (--host) works without manual config. Prefer the network (LAN) URL.
const devUrlPlugin = {
	name: 'dev-url',
	configureServer(server: ViteDevServer) {
		server.httpServer?.once('listening', () => {
			if (!process.env.APP_URL) {
				const url = server.resolvedUrls?.network[0] ?? server.resolvedUrls?.local[0];
				if (url) {
					process.env.APP_URL = url.replace(/\/$/, '');
					console.log(`\n  APP_URL → ${process.env.APP_URL}\n`);
				}
			}
		});
	}
};

export default defineConfig({
	plugins: [
		devUrlPlugin,
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
				resolve: {
					conditions: ['browser']
				},
				test: {
					name: 'client',
					environment: 'jsdom',
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**'],
					setupFiles: ['src/lib/test-setup.ts']
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
