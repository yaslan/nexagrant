import { test, expect } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import { GATE_E2E, seed, rollback } from '../../scripts/seed-gate-e2e';
import { shotsDir } from './fixtures/shots';

/**
 * Marketplace listings — tenant isolation in a real browser.
 *
 * TASK-MTVTQTJIQ5SDB: `MarketplaceListing` has a NON-NULL `tenantId` and a
 * `tenant_isolation` policy (prisma/rls.sql:13), and writes always went through
 * `withTenant` — but the page read it with a bare
 * `prisma.marketplaceListing.findMany({ orderBy })`: no wrapper, and no `where`
 * clause of any kind. On the role the app actually connects as (`fabrika`,
 * SUPERUSER + BYPASSRLS) that returned every tenant's listings.
 *
 * tests/marketplace-listing-tenant-scope.live.test.ts proves the fix at the
 * query boundary over both database roles. This file is the other half: that
 * the rendered page a signed-in user actually sees contains tenant A's listing
 * and does not contain tenant B's.
 *
 * The absence assertion is made against `body.innerText`, not the raw HTML.
 * next-intl embeds the whole message catalogue in every page's HTML, so a
 * `toContain` over the markup can match a string that is never displayed.
 *
 * The fixture is the two-tenant one from `scripts/seed-gate-e2e.ts`, reused
 * rather than duplicated; the two listings are this file's own rows and are the
 * only ones it deletes.
 */

const SHOTS = shotsDir('TASK-MTVTQTJIQ5SDB-screenshots');
const MARKETPLACE_URL = `/tr/${GATE_E2E.workspaceSlug}/marketplace`;

const LISTING_A = 'mp-e2e-listing-a';
const LISTING_B = 'mp-e2e-listing-b';
const TITLE_A = 'Tenant A ilani — gorunmeli';
const TITLE_B = 'Tenant B ilani — ASLA gorunmemeli';

test.describe.configure({ mode: 'serial' });

test.describe('Marketplace — tenant isolation', () => {
  test.beforeAll(async () => {
    await seed();

    for (const [id, tenantId, title] of [
      [LISTING_A, GATE_E2E.tenantId, TITLE_A],
      [LISTING_B, GATE_E2E.otherTenantId, TITLE_B],
    ] as const) {
      await prisma.marketplaceListing.upsert({
        where: { id },
        update: { tenantId, title, status: 'active' },
        create: {
          id,
          tenantId,
          kind: 'consultancy',
          title,
          description: `TASK-MTVTQTJIQ5SDB fixture for ${tenantId}`,
          price: '€1',
          status: 'active',
        },
      });
    }
  });

  test.afterAll(async () => {
    await prisma.marketplaceListing.deleteMany({ where: { id: { in: [LISTING_A, LISTING_B] } } });
    if (process.env.GATE_E2E_KEEP !== '1') await rollback();
    await prisma.$disconnect();
  });

  test("shows tenant A its own listing and never tenant B's", async ({ page }) => {
    // The cookie consent renders as a full-screen `inset-0` alertdialog and
    // intercepts pointer events; a recorded consent is the state a returning
    // user is already in.
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
    await expect(main.getByText(TITLE_A)).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: `${SHOTS}/01-marketplace-tenant-a.png`, fullPage: true });

    // The counterfactual: a page that rendered nothing at all would satisfy the
    // absence assertion on its own, so A's own row is asserted present above.
    const shown = await page.evaluate(() => document.body.innerText);
    expect(shown).toContain(TITLE_A);
    expect(shown).not.toContain(TITLE_B);

    // And the fixture really is in the database under the other tenant — without
    // this, "B is absent" could just mean "B was never seeded".
    const b = await prisma.marketplaceListing.findUnique({ where: { id: LISTING_B } });
    expect(b, 'tenant B fixture must exist for this test to mean anything').not.toBeNull();
    expect(b!.tenantId).toBe(GATE_E2E.otherTenantId);
  });
});
