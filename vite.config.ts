import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import { sentrySvelteKit } from '@sentry/sveltekit';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

function hashFile(path: string): string {
	return createHash('md5').update(readFileSync(path)).digest('hex').slice(0, 8);
}

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
		sveltekit(),
		SvelteKitPWA({
			registerType: 'autoUpdate',
			manifest: {
				name: 'Mutuvia',
				short_name: 'Mutuvia',
				description: 'Mutual credit for your community',
				theme_color: '#2D4A32',
				background_color: '#ffffff',
				display: 'standalone',
				start_url: '/'
			},
			pwaAssets: {
				preset: 'minimal-2023',
				image: 'static/favicon.svg',
				overrideManifestIcons: true
			},
			workbox: {
				globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,woff,woff2}'],
				additionalManifestEntries: [
					{ url: '/offline.html', revision: hashFile('static/offline.html') }
				],
				navigateFallback: '/offline.html',
				navigateFallbackDenylist: [/^\/api\//, /^\/sentry-tunnel/],
				runtimeCaching: [
					{
						urlPattern: /^\/api\//,
						handler: 'NetworkOnly'
					}
				]
			}
		})
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
