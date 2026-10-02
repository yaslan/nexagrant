import { defineConfig, devices } from '@playwright/test';
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd(), true);

/**
 * Database the dev server and the specs use (TASK-MUPVLWSIPC5WU). E2E_DATABASE_URL,
 * when set, replaces DATABASE_URL for this run, so the suite can use its own
 * database instead of the shared dev one. process.env beats .env in Next, so the
 * server started below connects to it too. Prepare that database with the CI
 * steps (ci.yml "Prepare database"); tests/e2e/global-setup.ts checks it.
 */
if (process.env.E2E_DATABASE_URL) process.env.DATABASE_URL = process.env.E2E_DATABASE_URL;

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

/**
 * Which server the specs run against (TASK-MULXYMNTUELIK): `dev` (default, locally and
 * on every CI push) or `start`, a `next start` of an existing `next build` output
 * (CI builds it first; `workflow_dispatch` input `e2e_server` in ci.yml).
 *
 * `start` cannot carry DEMO_LOGIN_ENABLED: a production build refuses to boot with it
 * (src/lib/demo-login.ts assertDemoLoginAllowed, called from src/instrumentation.ts),
 * so under `start` the specs that sign in through the demo seats fail by design.
 * That lock is deliberate and is not bypassed here.
 */
const E2E_WEB_SERVER = process.env.E2E_WEB_SERVER === 'start' ? 'start' : 'dev';

const testEnv = {
  AUTH_SECRET: E2E_AUTH_SECRET,
  // The specs sign in through the demo seats; off by default (TASK-MULSCEK4JHK8X).
  ...(E2E_WEB_SERVER === 'dev' ? { DEMO_LOGIN_ENABLED: 'true' } : {}),
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
  // The HTML report is what CI uploads on failure (ci.yml); locally `list` is enough.
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  globalSetup: require.resolve('./tests/e2e/global-setup.ts'),
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: E2E_WEB_SERVER === 'start' ? `pnpm start --port ${PORT}` : `pnpm dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      ...process.env,
      ...testEnv,
    },
  },
});
