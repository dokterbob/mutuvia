# Testing Guide

## Two Layers

| Layer | Location                             | When to use                                                 |
| ----- | ------------------------------------ | ----------------------------------------------------------- |
| Unit  | `foo.test.ts` co-located with source | Pure logic, mocked dependencies — the default for new tests |
| E2E   | `e2e/`                               | Full user flows against a real built app on port 5174       |

Start with a unit test. Reach for E2E only when you need to verify UI behaviour across the full stack.

## Running Tests

```sh
bun run test                          # all unit tests (vitest)
bun --bun vitest run --coverage       # unit tests + Istanbul coverage report
bun run test:e2e                      # E2E tests (starts dev server automatically)
```

Coverage baseline is stored in `coverage-baseline.txt` (~31% statements).

## Unit Tests (Vitest)

### File naming

- `foo.test.ts` — server/node environment (default)
- `foo.svelte.test.ts` — jsdom environment (client project, for Svelte component tests)

Vitest uses two named projects configured in `vite.config.ts`: `server` (node) and `client` (jsdom). The file suffix controls which project picks up the file.

### The `describe`/`test` pattern

Use `describe` for grouping; `test` for individual cases. Keep nesting to two levels max. `describe` blocks own all setup via `beforeEach`/`beforeAll`; individual `test()` calls contain only the action and assertion.

```ts
import { describe, test, expect, beforeEach } from 'vitest';

describe('formatAmount', () => {
	beforeEach(() => {
		// shared setup lives here
	});

	test('formats a positive integer amount', () => {
		expect(formatAmount(1000)).toMatch(/€\s*10\.00/);
	});

	test('formats zero', () => {
		expect(formatAmount(0)).toMatch(/€\s*0\.00/);
	});
});
```

### Gotchas

**Coverage provider — Istanbul, not V8.** Bun does not support V8's `node:inspector`, so coverage is configured with `provider: 'istanbul'` in `vite.config.ts`. The run command must include the `--bun` flag so Bun's native modules resolve:

```sh
bun --bun vitest run --coverage
```

**Paraglide must exist before type-checking.** `src/lib/paraglide/` is gitignored and generated at dev/build time. Run `bun run dev` or `bun run build` once on a fresh clone before running `svelte-check` directly.

**`vi.hoisted` for module-level mocks.** When mocking modules that are imported before test setup runs (e.g. `$lib/config`), hoist mock factories with `vi.hoisted()` and call `vi.mock()` before the real import.

## E2E Tests (Playwright)

**Always use subagents when writing or editing E2E tests** — Playwright test files are context-heavy and burn tokens quickly in the main conversation.

### Key patterns

**`goto()` instead of `page.goto()`** — Import from `e2e/test-utils.ts`. It waits for `body.hydrated` after navigation, ensuring bits-ui components are active before assertions.

```ts
import { test, goto } from './test-utils.js';

test('home page loads', async ({ page }) => {
	await goto(page, '/home');
	// safe to interact with bits-ui components now
});
```

**`email` fixture for parallel-safe addresses** — Each test file gets unique email addresses derived from its filename. Never export shared email constants.

```ts
test('onboarding', async ({ page, email }) => {
	const addr = email('user'); // → "e2e-onboarding-user@test.example"
});
```

**`setupAuthenticatedUser()` for fast auth** — Programmatically creates a user and injects session cookies into a browser context. Use this in all tests that don't specifically test the onboarding flow itself.

```ts
test.beforeEach(async ({ context, email }) => {
	await setupAuthenticatedUser(context, email('alice'), 'Alice');
});
```

**`test.describe.serial()` for ordered flows** — Use when steps depend on state created by earlier steps (e.g. send/receive flow that needs a QR created in step 1).

**bits-ui portals** — After clicking a trigger, wait for the portal to mount before asserting on its contents:

```ts
await page.getByRole('button', { name: 'Open menu' }).click();
await expect(page.getByRole('menu')).toBeVisible();
```

Do **not** add `reducedMotion: 'reduce'` to `playwright.config.ts` — it breaks bits-ui portal mounting.
