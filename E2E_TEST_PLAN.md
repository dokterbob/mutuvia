# E2E Test Plan — shadcn-svelte-extras Components

> Playwright-based end-to-end tests for CopyButton, LanguageSwitcher, and PhoneInput.
> Dev server: `bun run dev` → `http://localhost:5173`

---

## Setup

### Install Playwright
```bash
bunx playwright install --with-deps chromium
```

### Config file
Create `playwright.config.ts` at the project root:
```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:5173',
  },
  webServer: {
    command: 'bun run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
```

### Directory
All test files go in `e2e/`.

---

## Test 1 — LanguageSwitcher (`/onboarding`)

**File**: `e2e/language-switcher.test.ts`
**Auth required**: No — onboarding layout is public
**Component**: `src/lib/components/ui/language-switcher/`
**Used in**: `src/routes/onboarding/+layout.svelte`

### Selectors
```ts
// Globe icon trigger button — has aria-label "Change language"
const trigger = page.getByRole('button', { name: 'Change language' });

// Dropdown radio items (inside a popover/menu)
const englishOption  = page.getByRole('radio', { name: 'English' });
const portugueseOption = page.getByRole('radio', { name: 'Português' });
const dutchOption    = page.getByRole('radio', { name: 'Nederlands' });
```

### Test cases

#### 1a. Renders trigger
```ts
await page.goto('/onboarding');
await expect(page.getByRole('button', { name: 'Change language' })).toBeVisible();
```

#### 1b. Opens dropdown with all 3 languages
```ts
await page.getByRole('button', { name: 'Change language' }).click();
await expect(page.getByRole('radio', { name: 'English' })).toBeVisible();
await expect(page.getByRole('radio', { name: 'Português' })).toBeVisible();
await expect(page.getByRole('radio', { name: 'Nederlands' })).toBeVisible();
```

#### 1c. Switching to Portuguese updates page text
```ts
// Navigate to a page with known translated content
await page.goto('/onboarding/consent');
await page.getByRole('button', { name: 'Change language' }).click();
await page.getByRole('radio', { name: 'Português' }).click();

// Check a translated string (verify against src/lib/i18n/pt.ts)
// e.g. consent.cta in PT
await expect(page.getByRole('button', { name: /continuar/i })).toBeVisible();
```

#### 1d. Switching to Dutch updates page text
```ts
await page.getByRole('button', { name: 'Change language' }).click();
await page.getByRole('radio', { name: 'Nederlands' }).click();
// Check a Dutch string from src/lib/i18n/nl.ts
```

#### 1e. Dropdown closes after selection
```ts
await page.getByRole('button', { name: 'Change language' }).click();
await page.getByRole('radio', { name: 'English' }).click();
await expect(page.getByRole('radio', { name: 'English' })).not.toBeVisible();
```

### i18n string reference
See `src/lib/i18n/en.ts`, `pt.ts`, `nl.ts` for exact key→string mappings.
Use `consent.cta`, `phone.cta`, `verified.title` etc. as anchor strings for assertions.

---

## Test 2 — PhoneInput (`/onboarding/phone`)

**File**: `e2e/phone-input.test.ts`
**Auth required**: No
**Component**: `src/lib/components/ui/phone-input/`
**Page**: `src/routes/onboarding/phone/+page.svelte`

### Selectors
```ts
// Country selector button — contains flag image, no text label
const countryBtn = page.locator('[data-slot="phone-input"]')
  .locator('..') // parent wrapper div
  .getByRole('button');
// OR simpler: first button in the phone input area
const countryBtn = page.getByRole('button').filter({ has: page.locator('img') }).first();

// Country search input inside the popover
const countrySearch = page.getByPlaceholder('Search country...');

// Phone number text input
const phoneInput = page.locator('input[type="tel"]');

// Submit button
const submitBtn = page.getByRole('button', { name: 'Send code' });

// "or" divider (visible when no number entered)
const orDivider = page.getByText('or');

// Email fallback button (visible when no number entered)
const emailBtn = page.getByRole('button', { name: /continue with email/i });
```

### Test cases

#### 2a. Initial render — PT flag, empty input, "or" divider visible, submit disabled
```ts
await page.goto('/onboarding/phone');
await expect(page.locator('input[type="tel"]')).toBeVisible();
await expect(page.getByText('or')).toBeVisible();
await expect(page.getByRole('button', { name: /continue with email/i })).toBeVisible();
await expect(page.getByRole('button', { name: 'Send code' })).toBeDisabled();
```

#### 2b. Country selector opens popover with searchable list
```ts
// Click country button (PT flag)
const countryBtn = page.locator('input[type="tel"]').locator('..').getByRole('button');
await countryBtn.click();
await expect(page.getByPlaceholder('Search country...')).toBeVisible();
// Verify a few countries are listed
await expect(page.getByRole('option', { name: /Netherlands/ })).toBeVisible();
await expect(page.getByRole('option', { name: /Portugal/ })).toBeVisible();
```

#### 2c. Search filters country list
```ts
await page.getByPlaceholder('Search country...').fill('nether');
await expect(page.getByRole('option', { name: /Netherlands \(Nederland\)/ })).toBeVisible();
await expect(page.getByRole('option', { name: /Portugal/ })).not.toBeVisible();
```

#### 2d. Selecting a country closes popover and updates flag
```ts
await page.getByRole('option', { name: /Netherlands \(Nederland\)/ }).click();
await expect(page.getByPlaceholder('Search country...')).not.toBeVisible();
// Country changed → TelInput country = NL, flag updates
// (hard to assert flag image without inspecting src, but popover closed = success)
```

#### 2e. Valid NL number enables submit and hides "or" divider
```ts
await page.locator('input[type="tel"]').fill('612345678');
// Wait for reactivity
await expect(page.getByRole('button', { name: 'Send code' })).toBeEnabled();
await expect(page.getByText('or')).not.toBeVisible();
await expect(page.getByRole('button', { name: /continue with email/i })).not.toBeVisible();
```

#### 2f. Partial/invalid number keeps submit disabled
```ts
await page.goto('/onboarding/phone');
await page.locator('input[type="tel"]').fill('123'); // too short
await expect(page.getByRole('button', { name: 'Send code' })).toBeDisabled();
```

#### 2g. Default PT number works
```ts
await page.goto('/onboarding/phone');
// PT mobile numbers start with 9, 9 digits total
await page.locator('input[type="tel"]').fill('912345678');
await expect(page.getByRole('button', { name: 'Send code' })).toBeEnabled();
```

### Known quirks
- TelInput is a **Svelte 4** component wrapped in a Svelte 5 component.
  `bind:` directives don't propagate child→parent; use `on:updateValue` events instead.
  This is already fixed in `phone-input.svelte` — if value binding breaks again, check that fix.
- The container `<div class="flex place-items-center">` must NOT have margin classes
  applied directly to the `<input>` inside. Use wrapper classes only.
- Alignment root cause: browser UA sets `margin-bottom: 8px` on `<input>` elements.
  Fixed with `mb-0` on the TelInput class.

---

## Test 3 — CopyButton (`/send`, `/receive`)

**File**: `e2e/copy-button.test.ts`
**Auth required**: YES — `/send` and `/receive` are behind auth
**Component**: `src/lib/components/ui/copy-button/`
**Hook**: `src/lib/hooks/use-clipboard.svelte.ts`

### Auth setup

Option A — seed + cookie injection:
```ts
// In test setup, seed the DB and inject session cookie
// bun run db:seed creates 3 users, check src/lib/server/auth.ts for cookie name
// Cookie name is likely: better-auth.session_token

test.beforeEach(async ({ page }) => {
  // Inject a valid session cookie for the seeded test user
  await page.context().addCookies([{
    name: 'better-auth.session_token',
    value: '<seeded-session-token>',
    domain: 'localhost',
    path: '/',
  }]);
});
```

Option B — skip if no auth helper:
```ts
test.skip(true, 'Requires auth — implement session seeding first');
```

### Selectors
```ts
// CopyButton renders as a button with "Copy link" text + copy icon
const copyBtn = page.getByRole('button', { name: /copy link/i });
```

### Test cases

#### 3a. CopyButton visible after generating QR
```ts
await page.goto('/send');
// Enter an amount and submit to generate a QR code
await page.getByRole('spinbutton').fill('10'); // amount input
await page.getByRole('button', { name: /generate/i }).click();
// CopyButton should appear
await expect(page.getByRole('button', { name: /copy link/i })).toBeVisible();
```

#### 3b. Clicking CopyButton shows check icon briefly
```ts
await copyBtn.click();
// UseClipboard sets copied=true → CopyButton shows CheckIcon
// The button should still be visible (not disabled) after click
await expect(copyBtn).toBeVisible();
// After ~2s, reverts to copy icon
await page.waitForTimeout(2100);
await expect(copyBtn).toBeVisible(); // still there
```

#### 3c. CopyButton on receive page
```ts
await page.goto('/receive');
// Receive page generates QR automatically
await expect(page.getByRole('button', { name: /copy link/i })).toBeVisible();
```

### Notes on CopyButton internals
- Uses `UseClipboard` class from `src/lib/hooks/use-clipboard.svelte.ts`
- `copied` state drives icon swap (copy icon → check icon → back after timeout)
- `text` prop = the QR URL to copy
- The button renders as: `<CopyButton text={qrUrl} variant="outline">Copy link</CopyButton>`

---

## Test 4 — Icon spot-check (smoke test)

**File**: `e2e/icons.test.ts`
**Auth required**: No (for onboarding pages)

These are quick sanity checks that Lucide icons render (i.e., SVG elements are present).

```ts
const checks = [
  { url: '/onboarding',         desc: 'globe icon on language switcher' },
  { url: '/onboarding/consent', desc: 'arrow icons on buttons' },
  { url: '/onboarding/phone',   desc: 'arrow icons + chevrons-up-down on country selector' },
  { url: '/onboarding/verified',desc: 'check icon in green circle' },
];

for (const { url, desc } of checks) {
  test(`icons render on ${url}`, async ({ page }) => {
    await page.goto(url);
    // At least one SVG icon should be present
    await expect(page.locator('svg').first()).toBeVisible();
  });
}
```

---

## Recommended test run order

1. `language-switcher.test.ts` — no auth, fast, high confidence
2. `phone-input.test.ts` — no auth, exercises complex Svelte 4/5 interop
3. `icons.test.ts` — quick smoke, no auth
4. `copy-button.test.ts` — requires auth setup first

---

## Running tests

```bash
# Run all e2e tests
bunx playwright test

# Run a specific file
bunx playwright test e2e/phone-input.test.ts

# Run with UI (headed)
bunx playwright test --ui

# Run with trace on failure
bunx playwright test --trace=on-first-retry
```
