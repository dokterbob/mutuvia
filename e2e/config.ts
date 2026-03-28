// Shared constants used by both playwright.config.ts (webServer env) and
// e2e/auth.ts (test-side auth instance). Centralising them here prevents
// the two from drifting apart.

export const E2E_DB_FILE = 'test.db';
export const E2E_AUTH_SECRET = 'e2e-test-only-better-auth-secret-not-for-production!!';
export const E2E_BASE_URL = 'http://localhost:5174';
export const E2E_QR_JWT_SECRET = 'e2e-test-only-secret-do-not-use-in-production!!';
