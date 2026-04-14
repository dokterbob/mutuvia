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
		}
	},
	vitePlugin: {
		dynamicCompileOptions: ({ filename }) =>
			filename.includes('node_modules') ? undefined : { runes: true }
	}
};

export default config;
