import { test, expect } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import { GATE_E2E, seed, rollback } from '../../scripts/seed-gate-e2e';
import { shotsDir } from './fixtures/shots';

/**
 * Marketplace — an empty marketplace is not a stocked one.
 *
 * TASK-MTVUQ775Y9YIL. The page carried a "Fallback demo listings if DB is
 * unseeded/offline" block: when the read came back with no rows it substituted
 * three invented listings (`list-demo-1..3`, priced €1,800 / €4,500 / €2,200)
 * and one invented API key (`key-demo-1`, prefix `fp_live_9a8b`). Zero rows is
 * exactly what a NOBYPASSRLS role returns when the tenant scope was not set
 * (measured in `src/modules/marketplace/server/listings.ts`), so the failure
 * mode that block covered up was tenant isolation breaking — and it covered it
 * up with priced offers a user could act on.
 *
 * This file is the browser half: a signed-in tenant with nothing in the table
 * sees the empty state and none of that copy, and the same tenant with a real
 * row sees the row and no empty state. The failure branches (a read that
 * throws, and the retry link) are driven in tests/marketplace-page-states.test.ts,
 * which is where they can be forced without breaking a shared database.
 */

const SHOTS = shotsDir('TASK-MTVUQ775Y9YIL-screenshots');
const MARKETPLACE_URL = `/tr/${GATE_E2E.workspaceSlug}/marketplace`;

const REAL_LISTING = 'mp-demo-fallback-real';
const REAL_TITLE = 'Gercek ilan — veritabanindan';

/** The exact strings the removed fallback used to print. */
const DEMO_COPY = [
  'Horizon Europe Proposal Coaching',
  'EV Solid-State Battery Thermal Sensor License',
  'Cleanroom ISO 5 Pilot Batch Fabrication',
  'ERP Enterprise Integration Key',
  'fp_live_9a8b',
  '€1,800 / Proposal',
  '€4,500 / License',
  '€2,200 / Day',
];

test.describe.configure({ mode: 'serial' });

test.describe('Marketplace — no fabricated listings', () => {
  test.beforeAll(async () => {
    await seed();
    // The fixture tenant is created and dropped by this run; emptying its two
    // marketplace tables is what makes "empty" mean empty. Only this tenant's
    // rows are touched.
    const removedListings = await prisma.marketplaceListing.deleteMany({
      where: { tenantId: GATE_E2E.tenantId },
    });
    const removedKeys = await prisma.apiKey.deleteMany({ where: { tenantId: GATE_E2E.tenantId } });
    console.log(
      `[TASK-MTVUQ775Y9YIL] fixture tenant emptied: listings=${removedListings.count} apiKeys=${removedKeys.count}`,
    );
  });

  test.afterAll(async () => {
    await prisma.marketplaceListing.deleteMany({ where: { id: REAL_LISTING } });
    if (process.env.GATE_E2E_KEEP !== '1') await rollback();
    await prisma.$disconnect();
  });

  test('an empty tenant gets the empty state, not three priced offers', async ({ page }) => {
    // The cookie consent is a full-screen `inset-0` alertdialog and swallows clicks.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'fabrika_cookie_consent',
        JSON.stringify({ necessary: true, analytics: true, marketing: true }),
      );
    });

    await page.goto(`/tr/giris?callbackUrl=${encodeURIComponent(MARKETPLACE_URL)}`);
    await page.locator('input[type="email"]').fill(GATE_E2E.email);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(`**${MARKETPLACE_URL}`, { timeout: 30_000 });

    const main = page.locator('main');
    await expect(main.getByText('Henüz ilan yok')).toBeVisible({ timeout: 30_000 });
    await expect(main.getByText('Henüz API anahtarı yok')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/01-empty-state.png`, fullPage: true });

    // Asserted over innerText, not the markup: next-intl ships the whole
    // catalogue inside every page, so `not.toContain` over HTML would pass for
    // text that is on screen and fail for text that is not.
    const shown = await page.evaluate(() => document.body.innerText);
    for (const copy of DEMO_COPY) expect(shown, `fabricated copy on screen: ${copy}`).not.toContain(copy);

    // And the database really is empty for this tenant — without this the
    // absence above could just mean the page rendered nothing.
    const rows = await prisma.marketplaceListing.count({ where: { tenantId: GATE_E2E.tenantId } });
    expect(rows, 'the fixture tenant must have no listings for this test to mean anything').toBe(0);
  });

  test('a real row replaces the empty state', async ({ page }) => {
    await prisma.marketplaceListing.create({
      data: {
        id: REAL_LISTING,
        tenantId: GATE_E2E.tenantId,
        kind: 'consultancy',
        title: REAL_TITLE,
        description: 'TASK-MTVUQ775Y9YIL fixture',
        price: '€1',
        status: 'active',
      },
    });

    await page.addInitScript(() => {
      window.localStorage.setItem(
        'fabrika_cookie_consent',
        JSON.stringify({ necessary: true, analytics: true, marketing: true }),
      );
    });
    await page.goto(`/tr/giris?callbackUrl=${encodeURIComponent(MARKETPLACE_URL)}`);
    await page.locator('input[type="email"]').fill(GATE_E2E.email);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(`**${MARKETPLACE_URL}`, { timeout: 30_000 });

    const main = page.locator('main');
    await expect(main.getByText(REAL_TITLE)).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: `${SHOTS}/02-real-listing.png`, fullPage: true });

    const shown = await page.evaluate(() => document.body.innerText);
    expect(shown).toContain(REAL_TITLE);
    expect(shown).not.toContain('Henüz ilan yok');
    for (const copy of DEMO_COPY) expect(shown, `fabricated copy on screen: ${copy}`).not.toContain(copy);
  });
});
