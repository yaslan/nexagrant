import { test, expect, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';

/**
 * TASK-MTQTYXC0NUT0B — the dashboard's outcome-based KPI read 0 % where the data said 20 %.
 *
 * `Proposal.outcome` is a free `String?`; every writer stores snake_case, and the KPI read it
 * back with SCREAMING_CASE literals. The filter matched nothing, nothing threw, and the export
 * printed a confident 0 %. This spec drives the real endpoint with a real signed-in session and
 * checks the figure against the same count taken straight from the database.
 */

const SHOTS = 'docs/agent-results/TASK-MTQTYXC0NUT0B-screenshots';
const EXPORT_PATH = '/api/dashboard/export-csv';

/** The cookie banner is a full-screen alertdialog and swallows every click. */
async function acceptCookies(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true }),
    );
  });
}

async function signIn(page: Page, email: string, target: string) {
  await page.goto(`/tr/giris?callbackUrl=${encodeURIComponent(target)}`);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(`**${target}`, { timeout: 30_000 });
  await page.waitForLoadState('networkidle');
}

test('the panel export reports the above-threshold rate the database actually holds', async ({ page }) => {
  await acceptCookies(page);
  await signIn(page, 'alice@fabrika.test', '/tr/main/panel');

  // A real click onto the tab that offers the export.
  const exportTab = page.getByRole('tab', { name: 'Dışa Aktar' });
  await exportTab.click();
  await expect(exportTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#dashboard-panel-export')).toBeVisible();
  // The tab underline is a colour transition; screenshotting straight after the click catches
  // it half-way and makes the evidence look like the wrong tab is selected.
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/01-export-tab.png`, fullPage: true });

  // The export endpoint, called with the session the browser is holding.
  const url = new URL(page.url());
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  const response = await page.request.get(
    `${EXPORT_PATH}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
  expect(response.status()).toBe(200);

  const csv = await response.text();
  writeFileSync(`${SHOTS}/dashboard-metrics.csv`, csv, 'utf-8');
  console.log('\n--- CSV returned by the live endpoint ---\n' + csv + '\n---\n');

  // 5 opportunities, 1 of them above threshold (demo-proposal-3, outcome "above_threshold").
  expect(csv).toContain('Toplam Teklif,5,adet');
  expect(csv).toContain('Başarı Oranı,20.0,%');
  expect(csv).not.toContain('Başarı Oranı,0.0,%');
});
