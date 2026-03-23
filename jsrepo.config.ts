import { defineConfig } from 'jsrepo';

export default defineConfig({
	repos: ['@ieedan/shadcn-svelte-extras'],
	paths: {
		ui: '$lib/components/ui',
		hook: '$lib/hooks',
		util: '$lib/utils',
		lib: '$lib'
	}
});
