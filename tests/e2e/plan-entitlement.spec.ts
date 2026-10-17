import { test, expect, type Page } from '@playwright/test';
import type { ModuleStatus } from '@prisma/client';

import { prisma } from '../../src/lib/db';
import { PLAN_E2E, seed, rollback } from '../../scripts/seed-plan-e2e';
import { shotsDir } from './fixtures/shots';
import { expectHydrated } from './fixtures/hydration';
import { signInAs } from './fixtures/session';

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
const STATE_SHOTS = shotsDir('TASK-MVC4JEKT5KX5C-screenshots');

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

const ALL_MODULES = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11'] as const;

/** Every module ON in `on`, every other one OFF — one upsert each, no filtered bulk write. */
async function setModules(on: readonly string[]) {
  for (const moduleId of ALL_MODULES) {
    const status: ModuleStatus = on.includes(moduleId) ? 'ON' : 'OFF';
    await prisma.moduleState.upsert({
      where: { tenantId_moduleId: { tenantId: TENANT_ID, moduleId } },
      update: { status },
      create: { tenantId: TENANT_ID, moduleId, status },
    });
  }
}

/** The tenant as one that never bought anything: no subscription row at all. */
async function dropSubscription() {
  await prisma.subscription.delete({ where: { tenantId: TENANT_ID } }).catch(() => undefined);
}

async function upsertPlan(planId: string) {
  await prisma.subscription.upsert({
    where: { tenantId: TENANT_ID },
    update: { planId, status: 'ACTIVE', planVersionId: null },
    create: { tenantId: TENANT_ID, planId, status: 'ACTIVE' },
  });
}

/**
 * The app shell scrolls inside `<main>`, not the document, so a full-page frame
 * stops at the viewport. Grow the viewport to the content instead, then measure
 * horizontal overflow on both the document and `<main>`.
 */
async function frameAt(page: Page, width: number, path: string) {
  await page.setViewportSize({ width, height: 900 });
  await expect(page.getByTestId('modules-summary')).toBeVisible();
  const overflow = await page.evaluate(() => {
    const main = document.querySelector('main');
    return Math.max(
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
      main ? main.scrollWidth - main.clientWidth : 0
    );
  });
  expect(overflow, `horizontal scroll at ${width}px`).toBeLessThanOrEqual(0);
  const height = await page.evaluate(() => {
    const main = document.querySelector('main');
    return main ? Math.ceil(main.getBoundingClientRect().top + main.scrollHeight) : 900;
  });
  await page.setViewportSize({ width, height: Math.min(height, 12_000) });
  await page.screenshot({ path });
}

async function captureState(page: Page, name: string) {
  await frameAt(page, 1280, `${STATE_SHOTS}/${name}-1280.png`);
  await frameAt(page, 375, `${STATE_SHOTS}/${name}-375.png`);
  await page.setViewportSize({ width: 1280, height: 900 });
}

const statusOf = (page: Page, moduleId: string) =>
  page.getByTestId(`module-card-${moduleId}`).getAttribute('data-status');

async function signIn(page: Page) {
  // Managing modules is Tenant Owner only, and the fixture seats its user as one.
  // A minted session for that user (scripts/seed-plan-e2e.ts owns its User + Membership,
  // `rollback` removes them), not the demo sign-in form, so the spec runs against
  // `next start` too (TASK-MUSBCXP9RKS3D). signInAs also records the cookie consent.
  await signInAs(page, { id: LENS.userId, email: LENS.email, tenantId: LENS.tenantId, role: LENS.role });
  await page.goto(MODULES_URL);
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
    await expect(m6Basic).toContainText('Hakem Gözü');
    await expect(m6Basic).toContainText('Evaluator Lens');
    await expect(m6Basic).toContainText('Planınıza dahil değil');
    // The card lists the plans that do open it, straight from the catalogue.
    await expect(m6Basic).toContainText('Ultra');
    // No way in: neither switch is offered, only an upgrade link (LOCKED, FO-39).
    await expect(m6Basic.getByRole('button', { name: 'Aç' })).toHaveCount(0);
    await expect(m6Basic.getByRole('button', { name: 'Kapat' })).toHaveCount(0);
    await expect(m6Basic.getByRole('link', { name: 'Planı Yükselt' })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/01-basic-page.png`, fullPage: true });
    await m6Basic.scrollIntoViewIfNeeded();
    await m6Basic.screenshot({ path: `${SHOTS}/01-basic-m6-locked.png` });

    // M3 is on Basic, so the lock is about the plan and not about the page.
    await expect(moduleCard(page, 'M3')).not.toContainText('Planınıza dahil değil');

    // ── Ultra: the same card, the same session, and it actually turns on.
    await setPlan('ultra');
    await page.reload();

    await expect(page.getByRole('main')).toContainText('Ultra');

    const m6Ultra = moduleCard(page, 'M6');
    await expect(m6Ultra).toContainText('Planınıza dahil, açılabilir');
    const enable = m6Ultra.getByRole('button', { name: 'Aç' });
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
  // FO-39 (TASK-MVC4JEKT5KX5C): the four card states on real subscription rows.
  test('Discover without a subscription: no ORPHANED card, Discover listed on its modules', async ({ page }) => {
    await dropSubscription();
    await setModules(['M3']);
    await signIn(page);

    await expect(page.getByRole('main')).toContainText('Discover');
    await expect(page.getByRole('main')).toContainText('Aboneliğiniz yok');
    for (const id of ALL_MODULES) expect(await statusOf(page, id)).not.toBe('ORPHANED');
    expect(await statusOf(page, 'M3')).toBe('ACTIVE');
    expect(await statusOf(page, 'M5')).toBe('AVAILABLE');
    expect(await statusOf(page, 'M6')).toBe('LOCKED');
    await expect(page.getByTestId('module-card-M5').getByTestId('module-plans')).toContainText('Discover');
    // LOCKED: an upgrade link and no switch.
    const m6 = page.getByTestId('module-card-M6');
    await expect(m6.getByRole('button')).toHaveCount(0);
    await expect(m6.getByRole('link', { name: 'Planı Yükselt' })).toBeVisible();
    await expect(page.getByTestId('pipeline-coverage')).toContainText('/5 aşama');
    await captureState(page, '01-discover');
  });

  test('Pro: ACTIVE cards offer Kapat, AVAILABLE cards Aç; sidebar unlocks Onay Merkezi with M5', async ({ page }) => {
    await upsertPlan('pro');
    await setModules(['M1', 'M2', 'M3', 'M5']);
    await signIn(page);

    await expect(page.getByRole('main')).toContainText('Pro');
    expect(await statusOf(page, 'M1')).toBe('ACTIVE');
    expect(await statusOf(page, 'M4')).toBe('AVAILABLE');
    expect(await statusOf(page, 'M7')).toBe('LOCKED');
    await expect(page.getByTestId('module-card-M1').getByRole('button', { name: 'Kapat' })).toBeVisible();
    await expect(page.getByTestId('module-card-M4').getByRole('button', { name: 'Aç' })).toBeVisible();
    await expect(page.getByTestId('category-summary-core')).toContainText('4');
    await expect(page.getByTestId('sidebar-nav-approvals').filter({ visible: true }).first()).not.toHaveAttribute(
      'data-locked',
      'true'
    );
    await captureState(page, '02-pro');
  });

  test('downgrade Pro → Basic: M1 and M6 are ORPHANED with both offers, and Kapat switches M6 off', async ({ page }) => {
    await upsertPlan('basic');
    await setModules(['M1', 'M2', 'M3', 'M5', 'M6']);
    await signIn(page);

    await expect(page.getByRole('main')).toContainText('Basic');
    expect(await statusOf(page, 'M1')).toBe('ORPHANED');
    expect(await statusOf(page, 'M6')).toBe('ORPHANED');
    const m6 = page.getByTestId('module-card-M6');
    await expect(m6).toContainText('Plan dışında kaldı — kullanılamaz');
    await expect(m6.getByRole('link', { name: 'Planı Yükselt' })).toBeVisible();
    const off = m6.getByRole('button', { name: 'Kapat' });
    await expect(off).toBeVisible();
    // M1 is outside Basic, so its feature entry in the sidebar is locked.
    await expect(page.locator('[data-testid="sidebar-nav-apiKeys"][data-locked="true"]').first()).toBeAttached();
    await captureState(page, '03-downgrade-orphaned');

    await expectHydrated(off);
    await off.click();
    await expect(m6).toHaveAttribute('data-status', 'LOCKED', { timeout: 20_000 });
    const saved = await prisma.moduleState.findUnique({
      where: { tenantId_moduleId: { tenantId: TENANT_ID, moduleId: 'M6' } },
    });
    expect(saved?.status).toBe('OFF');
    await page.reload();
    expect(await statusOf(page, 'M6')).toBe('LOCKED');
  });
});
