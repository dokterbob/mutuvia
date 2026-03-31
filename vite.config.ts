import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import { sentrySvelteKit } from '@sentry/sveltekit';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { ViteDevServer } from 'vite';

function hashFile(path: string): string {
	return createHash('md5').update(readFileSync(path)).digest('hex').slice(0, 8);
}

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
		sveltekit(),
		SvelteKitPWA({
			registerType: 'autoUpdate',
			strategies: 'injectManifest',
			srcDir: 'src',
			filename: 'service-worker.ts',
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
			injectManifest: {
				globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,woff,woff2}'],
				// @vite-pwa/sveltekit globs relative to the project root, so every
				// matched path starts with "client/". The bun adapter serves those
				// files at "/" (without the prefix), so we must strip it here.
				modifyURLPrefix: { 'client/': '' },
				additionalManifestEntries: [
					{ url: '/offline.html', revision: hashFile('static/offline.html') }
				],
				// pwaAssets injects icons into manifest.webmanifest, producing entries
				// that duplicate those from the glob after the prefix is stripped.
				// Workbox throws add-to-cache-list-conflicting-entries on duplicates.
				// Deduplicate by URL, keeping the last (pwaAssets-modified) entry.
				manifestTransforms: [
					(manifest) => {
						const byUrl = new Map(manifest.map((e) => [e.url, e]));
						return { manifest: [...byUrl.values()], warnings: [] };
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
