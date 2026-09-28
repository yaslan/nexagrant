import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration.
 *
 * There was none, so `pnpm test:e2e` globbed the repository root: it picked up the
 * vitest suites under tests/ , failed to parse them, and reported
 * "Total: 0 tests in 0 files" with exit code 1 — the e2e gate could not pass or fail
 * on its own merits. `testDir` now points at the Playwright specs only.
 */
const PORT = Number(process.env.E2E_PORT ?? 3000);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * Test environment variables for e2e tests. INVOICE_SUPPLIER_* must be set so the
 * invoice export route produces a real document; otherwise tests that assert on
 * HTTP 200 and XML/HTML content will fail (TASK-MTU26XBVZ6H1O).
 *
 * These are test data only — clearly fake values that cannot be mistaken for
 * real taxpayer identity.
 */
/**
 * Session-signing key for the dev server and for the cookies the specs mint
 * (tests/e2e/fixtures/auth-secret.ts). A test-only value, never the key in .env:
 * process.env beats .env in Next, so the server started below verifies with this
 * one. Set E2E_AUTH_SECRET to use another (TASK-MULRTOTG9IKIM).
 */
const E2E_AUTH_SECRET = process.env.E2E_AUTH_SECRET || 'test-e2e-auth-secret-fixture-not-for-any-deployment';
// Workers inherit the runner's environment, so the specs read the same value.
process.env.AUTH_SECRET = E2E_AUTH_SECRET;

const testEnv = {
  AUTH_SECRET: E2E_AUTH_SECRET,
  // The specs sign in through the demo seats; off by default (TASK-MULSCEK4JHK8X).
  DEMO_LOGIN_ENABLED: 'true',
  INVOICE_SUPPLIER_NAME: 'TEST E2E Tedarikçi A.Ş.',
  INVOICE_SUPPLIER_VKN: '1000000000',
  INVOICE_SUPPLIER_TAX_OFFICE: 'TEST VD',
  INVOICE_SUPPLIER_ADDRESS: 'TEST CAD NO:1',
  INVOICE_SUPPLIER_CITY: 'Ankara',
};

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  globalSetup: require.resolve('./tests/e2e/global-setup.ts'),
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      ...process.env,
      ...testEnv,
    },
  },
});
