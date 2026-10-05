/**
 * The key the specs sign their session cookies with.
 *
 * It must be the same key the dev server verifies with, and playwright.config.ts
 * gives both sides one test-only value (overridable with E2E_AUTH_SECRET). The
 * specs used to fall back to a literal that was also the app's own fallback and
 * the local .env value, so a cookie minted in a test was valid wherever that key
 * was in use (TASK-MULRTOTG9IKIM). There is no fallback now: a run without a key
 * fails here instead of minting cookies nobody can verify.
 */
export function e2eAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET is not set for the e2e run; playwright.config.ts should set it.');
  }
  return secret;
}
