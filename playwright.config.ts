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

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm dev --port ${PORT}`,
    url: BASE_URL,
    // A dev server already running locally is reused rather than fighting for the port.
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
