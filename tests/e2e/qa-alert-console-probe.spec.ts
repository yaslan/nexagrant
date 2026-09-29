import { test, expect } from '@playwright/test';
import { prisma } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';
import { expectHydrated } from './fixtures/hydration';

/**
 * TASK-MTTUUGKNDGBXK — what the alert console actually shows an operator.
 *
 * READ-ONLY. This spec creates nothing, resolves nothing and deletes nothing:
 * it opens /tr/admin/alerts against whatever the database already holds and
 * measures what a platform admin can see and do. Every assertion below is a
 * measurement written to the console log, not a gate — the point is evidence,
 * so a number that has changed since the last run should be read, not "fixed".
 */

const SHOTS = shotsDir('TASK-MTTUUGKNDGBXK-screenshots');
const ADMIN_EMAIL = 'admin@yasinaslan.com.tr';

test.describe.configure({ mode: 'serial' });

let skipReason = '';

test.beforeAll(async () => {
  // Same guard as purge-failure-alert-console.spec.ts: this probe reads a
  // privileged screen, so a database without the platform admin cannot be
  // measured here and must not turn the shared gate red.
  if (!(await prisma.user.findFirst({ where: { email: ADMIN_EMAIL } }))) {
    skipReason = `no platform admin ${ADMIN_EMAIL} in this database`;
  }
});

test('the alert console under a 250-row pile', async ({ page }) => {
  test.skip(skipReason !== '', skipReason);

  const dbTotal = await prisma.systemAlert.count();
  const dbOpen = await prisma.systemAlert.count({ where: { resolvedAt: null } });
  console.log(`[probe] DB truth: total=${dbTotal} open=${dbOpen}`);

  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true }),
    );
  });

  const target = '/tr/admin/alerts';
  await page.goto(`/tr/giris?callbackUrl=${encodeURIComponent(target)}`);
  await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(`**${target}`, { timeout: 60_000 });
  // The probe counts rows and then drives the "unresolved only" filter, which is client
  // state. That checkbox hydrated means the console has rendered and can be operated.
  await expectHydrated(page.getByRole('checkbox').first());

  await page.screenshot({ path: `${SHOTS}/01-console-as-found.png`, fullPage: true });

  // --- what the header claims, against what the database holds ---
  const stats = await page.locator('dl div').allInnerTexts();
  console.log(`[probe] header tiles: ${JSON.stringify(stats)}`);

  const renderedRows = await page.locator('table tbody tr').count();
  console.log(`[probe] <tr> in tbody (incl. no expanded detail rows): ${renderedRows}`);

  // --- how much of the screen the one repeated failure occupies ---
  const identityRows = await page
    .locator('table tbody tr td:nth-child(2)', { hasText: 'invoice_buyer_identity_missing' })
    .count();
  console.log(`[probe] rows whose source cell is invoice_buyer_identity_missing: ${identityRows}`);
  console.log(`[probe] share of the visible table: ${((identityRows / Math.max(1, renderedRows)) * 100).toFixed(1)}%`);

  // --- can an operator find the one-off alert in the pile? ---
  const rare = page.locator('table tbody tr', { hasText: 'm10_document_generation_failed' }).first();
  const rareCount = await page
    .locator('table tbody tr td:nth-child(2)', { hasText: 'm10_document_generation_failed' })
    .count();
  console.log(`[probe] m10_document_generation_failed rows on screen: ${rareCount}`);
  if (rareCount > 0) {
    const box = await rare.boundingBox();
    const viewport = page.viewportSize();
    console.log(
      `[probe] that row sits at y=${Math.round(box?.y ?? -1)}px; viewport height=${viewport?.height}px ` +
        `-> ${(box?.y ?? 0) > (viewport?.height ?? 0) ? 'BELOW THE FOLD' : 'above the fold'}`,
    );
    const pageHeight = await page.evaluate(() => document.body.scrollHeight);
    console.log(`[probe] full page height: ${pageHeight}px (${(pageHeight / (viewport?.height ?? 1)).toFixed(1)} screens of scrolling)`);
  }

  // --- the only triage control: "unresolved only" ---
  const before = await page.locator('table tbody tr').count();
  await page.getByRole('checkbox').first().check();
  await page.waitForTimeout(300);
  const after = await page.locator('table tbody tr').count();
  console.log(`[probe] "Yalniz cozulmemisler" checkbox: ${before} rows -> ${after} rows (filtered out ${before - after})`);
  await page.screenshot({ path: `${SHOTS}/02-unresolved-only.png`, fullPage: true });
  await page.getByRole('checkbox').first().uncheck();

  // --- does the source filter offer any weighting? ---
  const options = await page.locator('#source-filter option').allInnerTexts();
  console.log(`[probe] source filter options: ${JSON.stringify(options)}`);

  // --- is there ANY affordance saying the list is capped? ---
  const bodyText = await page.locator('body').innerText();
  const capHints = ['300', 'daha fazla', 'sayfa', 'göster', 'of '].filter((h) => bodyText.includes(h));
  console.log(`[probe] strings on the page hinting at a cap/pagination: ${JSON.stringify(capHints)}`);

  // --- (d) raw error bodies / HTTP codes reaching a user-facing screen ---
  const leaks = [
    'fetch failed',
    '127.0.0.1',
    'localhost:8000',
    'HTTP 401',
    'HTTP 500',
    'HTTP 404',
    'P2011',
    'src/lib/billing/vat-rates.ts',
  ].filter((needle) => bodyText.includes(needle));
  console.log(`[probe] raw technical strings visible WITHOUT expanding any row: ${JSON.stringify(leaks)}`);

  // Expand one row to see what `meta` renders.
  const cordis = page.locator('table tbody tr button', { hasText: 'CORDIS worker unreachable' }).first();
  if (await cordis.count()) {
    await cordis.click();
    await page.waitForTimeout(300);
    const expandedText = await page.locator('body').innerText();
    const metaLeaks = ['127.0.0.1', 'localhost:8000', 'fetch failed', 'alertRepeatCount'].filter((n) =>
      expandedText.includes(n),
    );
    console.log(`[probe] raw strings visible AFTER expanding a row: ${JSON.stringify(metaLeaks)}`);
    await page.screenshot({ path: `${SHOTS}/03-expanded-meta.png`, fullPage: true });
  }

  // --- (c) would a BRAND-NEW alert be visible at all? ---
  // The console orders createdAt desc, so the newest row should be table row 1.
  // Comparing the top rendered row against the newest row in the database
  // answers the question without writing an alert to find out.
  const newest = await prisma.systemAlert.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { source: true, message: true, createdAt: true },
  });
  const topRowSource = await page.locator('table tbody tr').first().locator('td').nth(1).innerText();
  console.log(`[probe] newest alert in DB : ${newest?.source} @ ${newest?.createdAt.toISOString()}`);
  console.log(`[probe] top row on screen  : ${topRowSource.trim()}`);
  console.log(
    `[probe] -> a brand-new alert lands at row 1: ${topRowSource.trim() === newest?.source ? 'YES, visible without scrolling' : 'NO'}`,
  );

  // The page must at least be the console we think it is.
  await expect(page.getByRole('heading', { name: 'Sistem Uyarıları' })).toBeVisible();

  // Nothing was written: prove it.
  const afterTotal = await prisma.systemAlert.count();
  const afterOpen = await prisma.systemAlert.count({ where: { resolvedAt: null } });
  console.log(`[probe] DB after the probe: total=${afterTotal} open=${afterOpen} (was ${dbTotal}/${dbOpen})`);
  expect(afterOpen, 'the probe must not resolve or delete anything').toBe(dbOpen);
});

test.afterAll(async () => {
  await prisma.$disconnect();
});
