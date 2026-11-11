import adapter from 'svelte-adapter-bun';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
		// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
		// See https://svelte.dev/docs/kit/adapters for more information about adapters.
		adapter: adapter(),
		// @vite-pwa/sveltekit registers the service worker via virtual:pwa-register (hooks.client.ts).
		// Disable SvelteKit's built-in registration to prevent a duplicate inline script that uses
		// a relative path and causes 404s on sub-routes like /onboarding/service-worker.js.
		// See: https://vite-pwa-org.netlify.app/frameworks/sveltekit
		serviceWorker: {
			register: false
		},
		experimental: {
			// Enables src/instrumentation.server.ts for early Sentry init
			instrumentation: { server: true }
		},
		// `auto` mode: nonces for dynamically-rendered pages, hashes for
		// prerendered ones (see the Csp constructor in @sveltejs/kit's
		// runtime/server/page/csp.js — `use_hashes = mode === 'hash' ||
		// (mode === 'auto' && prerender)`). Nothing in this app is
		// prerendered (no `export const prerender` anywhere), so every
		// response gets a fresh per-request nonce, and the policy is always
		// sent as a header, never a <meta> tag (SvelteKit's `get_header`
		// drops `frame-ancestors`/`report-uri`/`sandbox` from the <meta>
		// variant specifically because browsers ignore them there — but
		// since `mode: 'auto'` never uses the <meta> delivery path for a
		// non-prerendered page at all, that's moot here: confirmed via
		// `curl -i` against the built server, see the PR report).
		csp: {
			mode: 'auto',
			directives: {
				'default-src': ['self'],
				// 'wasm-unsafe-eval' is required for the QR scanner's
				// self-hosted zxing-wasm module: CSP3 gates
				// WebAssembly.instantiate/compile under script-src
				// separately from same-origin fetch permissions (which
				// connect-src already covers) — self-hosting the .wasm file
				// does NOT remove the need for this keyword. Verified
				// against the real scanner via a Playwright
				// securitypolicyviolation listener; without it, WASM
				// instantiation is blocked and scanning never starts.
				'script-src': ['self', 'wasm-unsafe-eval'],
				// Plain `style-src` deliberately omits 'unsafe-inline' so
				// SvelteKit nonces Svelte's compiled component <style> tags
				// automatically (Csp#add_style). Inline `style="..."`
				// ATTRIBUTES are the separate `style-src-attr` directive,
				// which nonces/hashes don't cover for attributes set via the
				// DOM `style` property (bits-ui's floating-ui positioning,
				// Svelte's transition/animate directives, and the literal
				// `style="display: contents"` in app.html) — allowing
				// 'unsafe-inline' there only (not on style-src itself) keeps
				// the no-arbitrary-<style>-block guarantee while unblocking
				// those. Verified via Playwright across bits-ui portals
				// (dropdowns, dialogs, popovers) and page transitions.
				'style-src': ['self'],
				'style-src-attr': ['unsafe-inline'],
				'img-src': ['self', 'data:', 'blob:'],
				// Sentry goes through the same-origin /sentry-tunnel, never
				// directly to an ingest host. Web Push subscription delivery
				// is the browser's own PushManager -> push service, not a
				// `fetch()` from page/SW code, so it isn't governed by
				// connect-src at all.
				'connect-src': ['self'],
				'worker-src': ['self'],
				'frame-ancestors': ['none'],
				'base-uri': ['self'],
				'form-action': ['self'],
				'object-src': ['none']
			}
		}
	},
	vitePlugin: {
		dynamicCompileOptions: ({ filename }) =>
			filename.includes('node_modules') ? undefined : { runes: true }
	}
};

export default config;
