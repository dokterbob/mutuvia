import type { Page } from '@playwright/test';

/**
 * Navigate to a URL and wait for SvelteKit hydration to complete before
 * returning. Without this, Playwright may interact with server-rendered HTML
 * before client-side components (bits-ui, Svelte stores) have activated,
 * causing clicks on popovers/dropdowns to have no effect.
 *
 * The root +layout.svelte adds `document.body.classList.add('hydrated')` on
 * mount, which signals that hydration is complete.
 */
export async function goto(page: Page, url: string): Promise<void> {
	await page.goto(url);
	await page.locator('body.hydrated').waitFor();
}
