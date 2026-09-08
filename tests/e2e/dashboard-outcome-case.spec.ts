import { test, expect, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';

import { prisma } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';

/**
 * TASK-MTQTYXC0NUT0B — the dashboard's outcome-based KPI read 0 % where the data said 20 %.
 *
 * `Proposal.outcome` is a free `String?`; every writer stores snake_case, and the KPI read it
 * back with SCREAMING_CASE literals. The filter matched nothing, nothing threw, and the export
 * printed a confident 0 %. This spec drives the real endpoint with a real signed-in session and
 * checks the figure against the same count taken straight from the database.
 *
 * The count is taken, not remembered. The first version of this spec asserted the literal
 * `5` / `20.0 %` that the demo tenant held the day it was written; two more opportunities were
 * later created in `demo-workspace` and the spec went red on a KPI that was reporting correctly
 * (14.3 % of 7). A memorised constant tests the seed data, not the case rule — so the numerator
 * and denominator are read from Postgres here, with the outcome vocabulary spelled out locally
 * rather than imported, so the spec still states the rule instead of agreeing with the code
 * under test.
 */

const SHOTS = shotsDir('TASK-MTQTYXC0NUT0B-screenshots');
const EXPORT_PATH = '/api/dashboard/export-csv';
const SIGN_IN_AS = 'alice@fabrika.test';

/** Just enough of a loaded opportunity to count the two figures the CSV reports. */
interface OutcomeRow {
  proposal: { outcome: string | null } | null;
}

/** Whatever the KPI's `Başarı Oranı` counts, written out rather than imported. */
const ABOVE_THRESHOLD = new Set(['funded', 'reserve', 'above_threshold']);
const clearedThreshold = (outcome: string | null | undefined) =>
  ABOVE_THRESHOLD.has((outcome ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_'));

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_DAYS = 30;

/**
 * The window the export covers, restated from src/modules/m5/server/range.ts rather than
 * imported: two `YYYY-MM-DD` local dates, `to` inclusive to the last millisecond, and a
 * 30-day default when either is missing or malformed.
 */
function resolveWindow(from: string, to: string): { from: Date; rangeEnd: Date } {
  const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
  const now = new Date();
  const toDate = isDate(to)
    ? new Date(`${to}T00:00:00`)
    : new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const parsedFrom = isDate(from) ? new Date(`${from}T00:00:00`) : null;
  const fromDate =
    parsedFrom && parsedFrom <= toDate
      ? parsedFrom
      : new Date(toDate.getTime() - DEFAULT_RANGE_DAYS * DAY_MS);
  return { from: fromDate, rangeEnd: new Date(toDate.getTime() + DAY_MS - 1) };
}

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
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

test('the panel export reports the above-threshold rate the database actually holds', async ({ page }) => {
  await acceptCookies(page);
  await signIn(page, SIGN_IN_AS, '/tr/main/panel');

  // A real click onto the tab that offers the export.
  const exportTab = page.getByRole('tab', { name: 'Dışa Aktar' });
  await exportTab.click();
  await expect(exportTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#dashboard-panel-export')).toBeVisible();
  // The tab underline is a colour transition; screenshotting straight after the click catches
  // it half-way and makes the evidence look like the wrong tab is selected.
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/01-export-tab.png`, fullPage: true });

  // What the database says, for the same tenant and the same window the page is showing.
  const url = new URL(page.url());
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  const window = resolveWindow(from, to);

  const signedInAs = await prisma.user.findUnique({
    where: { email: SIGN_IN_AS },
    include: { memberships: { select: { tenantId: true } } },
  });
  const tenantId = signedInAs?.memberships[0]?.tenantId;
  expect(tenantId, `${SIGN_IN_AS} must belong to a tenant; run pnpm db:seed`).toBeTruthy();

  // `prisma generate` does not run in this repo, so the row shape is stated rather than
  // inferred — the same reason src/lib/dashboard/fetch-metrics.ts declares `OppWithRelations`.
  const rows: OutcomeRow[] = await prisma.opportunity.findMany({
    where: {
      tenantId,
      deletedAt: null,
      createdAt: { gte: window.from, lte: window.rangeEnd },
    },
    include: { proposal: { select: { outcome: true } } },
  });
  const total = rows.length;
  const above = rows.filter((row) => clearedThreshold(row.proposal?.outcome)).length;

  // Without these the assertions below could be satisfied by an empty tenant, and "0 of 0"
  // is exactly the reading the bug produced. The fixture must carry a proposal that cleared
  // the threshold for this spec to mean anything.
  expect(total, 'no opportunities in the window — nothing to measure').toBeGreaterThan(0);
  expect(
    above,
    'no above-threshold proposal in the window — the 0 % regression could not be seen',
  ).toBeGreaterThan(0);

  const expectedRate = ((above / total) * 100).toFixed(1);

  // The export endpoint, called with the session the browser is holding.
  const response = await page.request.get(
    `${EXPORT_PATH}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
  expect(response.status()).toBe(200);

  const csv = await response.text();
  writeFileSync(`${SHOTS}/dashboard-metrics.csv`, csv, 'utf-8');
  console.log(
    `\n--- database says ${above}/${total} = ${expectedRate} % above threshold ---\n` +
      `--- CSV returned by the live endpoint ---\n${csv}\n---\n`,
  );

  expect(csv).toContain(`Toplam Teklif,${total},adet`);
  expect(csv).toContain(`Başarı Oranı,${expectedRate},%`);
  // The regression itself: a populated numerator reported as nothing.
  expect(csv).not.toContain('Başarı Oranı,0.0,%');
});
