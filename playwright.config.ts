import { defineConfig, devices } from '@playwright/test';
import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// The runner reads the same .env that `next dev` reads. Without it, the runner's
// own DB clients fall back to src/lib/db.ts's CI default (port 5432), which is not
// the local database. A value already in the environment wins, so CI, which sets
// DATABASE_URL itself and has no .env, is unchanged.
loadDotenv({ quiet: true });

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

/**
 * The web server never closes an idle keep-alive connection (FO-199). The specs'
 * API calls share one keep-alive agent in the worker; Node's server closed an idle
 * socket after ~6 s, and a call sent at that moment failed with `read ECONNRESET`
 * (signInAs, GET /api/auth/session). `next dev` has no --keepAliveTimeout flag, so
 * a preload sets it. Why and how measured: tests/e2e/support/server-keep-alive.mjs.
 */
// A file:// URL, so --import takes it on Windows too (a bare C:\ path is read as a URL scheme).
const KEEP_ALIVE_PRELOAD = pathToFileURL(path.join(__dirname, 'tests/e2e/support/server-keep-alive.mjs')).href;
const WEB_SERVER_NODE_OPTIONS = [process.env.NODE_OPTIONS, `--import ${JSON.stringify(KEEP_ALIVE_PRELOAD)}`]
  .filter(Boolean)
  .join(' ');

// Set E2E_DATABASE_URL to process.env.DATABASE_URL so both runner and webServer see it
if (process.env.E2E_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.E2E_DATABASE_URL;
}

// Mail for the e2e web server, the same mailpit service CI runs (ci.yml, e2e step).
// Without SMTP the invite cooldown answers (`recently_sent`, `role_change_blocked`)
// never happen. This belongs to the e2e run only: the vitest step in the gate runs
// without SMTP, and a live test there asserts the no-SMTP invite response.
// Local: `docker compose` provides fabrika-mailpit on 1025/8025.
const E2E_SMTP = { SMTP_HOST: 'localhost', SMTP_PORT: '1025' };
process.env.E2E_MAILPIT_URL ??= 'http://localhost:8025';

const testEnv = {
  AUTH_SECRET: E2E_AUTH_SECRET,
  ...E2E_SMTP,
  // Mail links are built from this (src/lib/app-url.ts); without it the invite and
  // expert-prereg mails are not sent. CI sets it in ci.yml, but a worktree with no
  // .env had none, so the mail specs failed there (FO-131). Under `start` a
  // production server refuses loopback here by design, as ci.yml notes.
  NEXT_PUBLIC_APP_URL: BASE_URL,
  // E2E database URL — defaults to .env DATABASE_URL if not overridden via E2E_DATABASE_URL.
  DATABASE_URL: process.env.DATABASE_URL,
  // The specs sign in through the demo seats; off by default (TASK-MULSCEK4JHK8X).
  ...(E2E_WEB_SERVER === 'dev' ? { DEMO_LOGIN_ENABLED: 'true' } : {}),
  // The Google button renders only with a client id (src/lib/auth.ts), and
  // tests/e2e/auth.spec.ts clicks it. CI's e2e step sets these same placeholders;
  // a worktree built from .env.example has them blank (TASK-MVBFDSUSE5QCY). A
  // real pair in .env still wins.
  AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID || 'ci-placeholder-id.apps.googleusercontent.com',
  AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET || 'ci-placeholder-google-secret',
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
      NODE_OPTIONS: WEB_SERVER_NODE_OPTIONS,
      // Blank LLM keys in dev E2E so tests use template fallback, not real API calls
      // (matches CI behavior; reduces cost, ensures deterministic failures like CI).
      // Opt-in live tests (e.g. E2E_LIVE_EMBED=1) can override OPENAI_API_KEY if needed.
      ANTHROPIC_API_KEY: '',
      OPENAI_API_KEY: process.env.E2E_LIVE_EMBED === '1' ? process.env.OPENAI_API_KEY : '',
    } as Record<string, string>,
  },
});
