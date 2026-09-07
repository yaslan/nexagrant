import { test, expect, type Page } from '@playwright/test';

/**
 * TASK-MTQV1JYGMGU6V — the components that carried inline `eslint-disable` exceptions,
 * driven by a real browser after the exceptions were removed.
 *
 * Three React 19 lint errors were suppressed rather than fixed on 2026-09-07: a mount flag
 * set from an effect (ThemeToggle), a `loading` flag raised synchronously inside an effect
 * (the calls list), and an editor buffer copied across by an effect plus a lock expiry read
 * from `Date.now()` during render (the Part B editor). The suppressions are gone and the
 * patterns are actually different now, so what has to be shown is that the *behaviour* the
 * suppressions protected still holds when a person clicks it.
 *
 * The console is watched throughout: a hydration mismatch is the failure mode a wrong fix to
 * `useIsHydrated` would produce, and it is only visible at runtime. Screenshots are taken with
 * `caret: 'initial'` — Playwright's default hides the caret by writing an inline style into the
 * focused input, which React then reports as a mismatch of the harness's own making.
 */

const SHOTS = 'docs/agent-results/TASK-MTQV1JYGMGU6V-screenshots';
const EMAIL = 'admin@yasinaslan.com.tr';
const CALLS_URL = '/tr/main/calls';

/** React reports hydration mismatches and render-phase violations through console.error. */
function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));
  return errors;
}

const consent = (page: Page) =>
  page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true }),
    );
  });

const hydrationNoise = (errors: string[]) =>
  errors.filter((e) =>
    /hydrat|did not match|Text content does not match|Minified React error #(418|423|425)/i.test(e),
  );

test.describe('render-purity refactor — the three formerly suppressed components', () => {
  test('the theme toggle still switches the theme, with no mount effect behind it', async ({
    page,
  }) => {
    const errors = watchConsole(page);
    await consent(page);
    await page.goto('/tr');
    await page.waitForLoadState('networkidle');

    // `useIsHydrated` replaced `useState(false)` + `useEffect(setMounted)`. If it returned the
    // wrong snapshot the toggle would never appear at all, so its visibility is the assertion.
    const toggle = page.getByRole('button', { name: /moda geç/i }).first();
    await expect(toggle).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/01-public-page-light.png`, fullPage: false, caret: 'initial' });

    const before = await page.evaluate(() => document.documentElement.className);
    await toggle.click();
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.className))
      .not.toBe(before);
    await page.screenshot({ path: `${SHOTS}/02-public-page-after-toggle.png`, fullPage: false, caret: 'initial' });

    // And back, because a toggle that only goes one way is a broken toggle.
    await page.getByRole('button', { name: /moda geç/i }).first().click();
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.className))
      .toBe(before);

    expect(hydrationNoise(errors), 'hydration errors on the public page').toEqual([]);
  });

  test('the calls list loads, and changing a filter puts it back into loading', async ({
    page,
  }) => {
    const errors = watchConsole(page);
    await consent(page);
    await page.goto(`/tr/giris?callbackUrl=${encodeURIComponent(CALLS_URL)}`);
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(`**${CALLS_URL}`, { timeout: 30_000 });

    // `loading` is derived from "the query the filters describe" vs "the query the rows came
    // from" now. First paint therefore has to say loading without any effect having run yet.
    const loadingLabel = page.getByText('Canlı veriler yükleniyor...');
    await expect(loadingLabel).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/03-calls-loading.png`, fullPage: false, caret: 'initial' });

    await expect(loadingLabel).toBeHidden({ timeout: 30_000 });
    await page.screenshot({ path: `${SHOTS}/04-calls-loaded.png`, fullPage: false, caret: 'initial' });

    // Changing a filter changes the derived query, so the list must go stale again on its own.
    await page.getByRole('button', { name: 'Ufuk Avrupa (Horizon Europe)', exact: true }).click();
    await expect(loadingLabel).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/05-calls-refiltering.png`, fullPage: false, caret: 'initial' });
    await expect(loadingLabel).toBeHidden({ timeout: 30_000 });
    await page.screenshot({ path: `${SHOTS}/06-calls-filtered.png`, fullPage: false, caret: 'initial' });

    expect(hydrationNoise(errors), 'hydration errors on the calls page').toEqual([]);
  });
});
