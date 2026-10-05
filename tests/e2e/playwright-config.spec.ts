import { expect, test } from '@playwright/test';
import config from '../../playwright.config';

test.describe('playwright.config.ts', () => {
  test('disables reuseExistingServer to prevent stale dev server from breaking tests', () => {
    // reuseExistingServer must be false, not !process.env.CI, to ensure a fresh
    // server with test env (INVOICE_SUPPLIER_*) is always launched for e2e tests.
    // When true, a pre-existing dev server from another process is reused, but
    // its env is not updated with test data — causing false negatives (503 errors).
    const webServer = config.webServer as { reuseExistingServer?: boolean; env?: Record<string, string> } | undefined;
    expect(webServer?.reuseExistingServer).toBe(false);
  });

  test('provides test env variables to the dev server', () => {
    const webServer = config.webServer as { reuseExistingServer?: boolean; env?: Record<string, string> } | undefined;
    const testEnv = webServer?.env;
    expect(testEnv).toHaveProperty('INVOICE_SUPPLIER_NAME');
    expect(testEnv).toHaveProperty('INVOICE_SUPPLIER_VKN');
    expect(testEnv).toHaveProperty('INVOICE_SUPPLIER_TAX_OFFICE');
    expect(testEnv).toHaveProperty('INVOICE_SUPPLIER_ADDRESS');
    expect(testEnv).toHaveProperty('INVOICE_SUPPLIER_CITY');
  });
});
