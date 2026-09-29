import { test, expect, type Page } from '@playwright/test';
import type { ModuleStatus } from '@prisma/client';

import { prisma } from '../../src/lib/db';
import { PLAN_E2E, seed, rollback } from '../../scripts/seed-plan-e2e';
import { shotsDir } from './fixtures/shots';
import { expectHydrated } from './fixtures/hydration';

/**
 * Plan gating against the USD catalogue — TASK-MTR6QIE05ZKNH.
 *
 * Until the EUR ladder was retired, authorisation ran on plan ids
 * (`free/starter/team/business/enterprise`) that no customer could buy, so
 * "which plan opens M6" was answered by a table nobody was selling from. This
 * walks the real settings page, in a real browser, on a real subscription row:
 * a Basic tenant must see Evaluator Lens locked, an Ultra tenant must not.
 *
 * The subscription is flipped in the database between the two passes — the
 * product has no UI for changing your own plan.
 *
 * The tenant being flipped is this suite's own — `PLAN_E2E.lens` from
 * scripts/seed-plan-e2e.ts — and is dropped again afterwards. It used to be
 * `demo-tenant`, read in `beforeAll` and restored in `afterAll`. That restore was
 * correct and still the wrong tenant to borrow: agents run their specs against
 * separate dev servers but one Postgres, so any spec reading `demo-tenant`'s plan
 * while this suite held it on `basic` failed for a reason written in a file it does
 * not import. `m10-audit-identity` and `module-plan-gate` moved out under
 * TASK-MTS9C07AQ6DNO; this spec was the one left behind (TASK-MTUI9ZBK7W4JY).
 */

const SHOTS = shotsDir('TASK-MTR6QIE05ZKNH-screenshots');
const LENS = PLAN_E2E.lens;
const TENANT_ID = LENS.tenantId;
const MODULES_URL = `/tr/${LENS.workspaceSlug}/settings/modules`;

/**
 * `planVersionId` is cleared along with the plan, so entitlement is answered by the
 * catalogue — which is this spec's subject. The fixture seats the tenant on `basic`
 * with `pv_basic_1` attached; leaving that pointer in place while `planId` moves to
 * `ultra` would leave the row self-contradictory, and `getEntitlements` would log a
 * refused-version warning on every check before falling back to the catalogue anyway.
 * The version path has its own spec (`plan-entitlement-from-version.spec.ts`).
 */
async function setPlan(planId: string) {
  await prisma.subscription.update({
    where: { tenantId: TENANT_ID },
    data: { planId, status: 'ACTIVE', planVersionId: null },
  });
}

/** M6 has to start OFF, or the card renders "active" and never shows the gate. */
async function setM6(status: ModuleStatus) {
  await prisma.moduleState.upsert({
    where: { tenantId_moduleId: { tenantId: TENANT_ID, moduleId: 'M6' } },
    update: { status },
    create: { tenantId: TENANT_ID, moduleId: 'M6', status },
  });
}

async function signIn(page: Page) {
  // The cookie banner is a full-screen alertdialog and swallows the click on the
  // sign-in button; a recorded consent is the state a returning user is in.
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true }),
    );
  });
  await page.goto(`/tr/giris?callbackUrl=${encodeURIComponent(MODULES_URL)}`);
  // Managing modules is Tenant Owner only, and the fixture seats its user as one.
  await page.locator('input[type="email"]').fill(LENS.email);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(`**${MODULES_URL}`, { timeout: 30_000 });
  // Callers assert on a locator next; that auto-wait is the synchronisation.
}

/** The card for one module, located by its id badge. */
function moduleCard(page: Page, moduleId: string) {
  return page
    .getByRole('main')
    .locator('div.rounded-2xl')
    .filter({ has: page.locator('span.font-mono', { hasText: new RegExp(`^${moduleId}$`) }) })
    .first();
}

test.describe('plan entitlement — the catalogue decides what a plan opens', () => {
  test.beforeAll(async () => {
    // Re-seeding also puts the plan back to `basic` after a previous run left it on
    // whatever its last test set — the seed's `update` clause states the plan rather
    // than leaving it alone, for exactly this.
    await seed();
  });

  test.afterAll(async () => {
    // Nothing to restore: the tenant is the fixture, so it is removed rather than
    // put back. PLAN_E2E_KEEP=1 leaves it for inspection.
    if (process.env.PLAN_E2E_KEEP !== '1') await rollback();
    await prisma.$disconnect();
  });

  test('Basic cannot reach M6 and Ultra can', async ({ page }) => {
    await setM6('OFF');

    // ── Basic: Evaluator Lens is locked, and the reason given is the plan.
    await setPlan('basic');
    await signIn(page);

    await expect(page.getByRole('main')).toContainText('Mevcut Abonelik Paketi');
    await expect(page.getByRole('main')).toContainText('Basic');

    const m6Basic = moduleCard(page, 'M6');
    await expect(m6Basic).toContainText('Evaluator Lens');
    await expect(m6Basic).toContainText('Kilitli');
    await expect(m6Basic).toContainText('Plan yükseltmesi gerektirir');
    // The card lists the plans that do open it, straight from the catalogue.
    await expect(m6Basic).toContainText('ultra');
    // No way in: the enable button is replaced by an upgrade link.
    await expect(m6Basic.getByRole('button', { name: 'Etkinleştir' })).toHaveCount(0);
    await expect(m6Basic.getByRole('link', { name: 'Planı Yükselt' })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/01-basic-page.png`, fullPage: true });
    await m6Basic.scrollIntoViewIfNeeded();
    await m6Basic.screenshot({ path: `${SHOTS}/01-basic-m6-locked.png` });

    // M3 is on Basic, so the lock is about the plan and not about the page.
    await expect(moduleCard(page, 'M3')).not.toContainText('Kilitli');

    // ── Ultra: the same card, the same session, and it actually turns on.
    await setPlan('ultra');
    await page.reload();

    await expect(page.getByRole('main')).toContainText('Ultra');

    const m6Ultra = moduleCard(page, 'M6');
    await expect(m6Ultra).not.toContainText('Kilitli');
    const enable = m6Ultra.getByRole('button', { name: 'Etkinleştir' });
    await expectHydrated(enable);
    await enable.click();
    await expect(m6Ultra).toContainText('Kullanıma hazır', { timeout: 20_000 });
    await page.screenshot({ path: `${SHOTS}/02-ultra-page.png`, fullPage: true });
    await m6Ultra.scrollIntoViewIfNeeded();
    await m6Ultra.screenshot({ path: `${SHOTS}/02-ultra-m6-open.png` });

    // The click reached the database, not just the React state.
    const saved = await prisma.moduleState.findUnique({
      where: { tenantId_moduleId: { tenantId: TENANT_ID, moduleId: 'M6' } },
    });
    expect(saved?.status).not.toBe('OFF');
  });
});
