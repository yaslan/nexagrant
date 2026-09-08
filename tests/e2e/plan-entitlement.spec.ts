import { test, expect, type Page } from '@playwright/test';
import type { ModuleStatus } from '@prisma/client';

import { prisma } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';

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
 * product has no UI for changing your own plan — and restored afterwards.
 */

const SHOTS = shotsDir('TASK-MTR6QIE05ZKNH-screenshots');
const TENANT_ID = 'demo-tenant';
const MODULES_URL = '/tr/main/settings/modules';

let originalPlanId: string;
let originalM6Status: ModuleStatus | null = null;

async function setPlan(planId: string) {
  await prisma.subscription.update({
    where: { tenantId: TENANT_ID },
    data: { planId, status: 'ACTIVE' },
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
  // Managing modules is Tenant Owner only, so the demo owner seat signs in.
  await page.locator('input[type="email"]').fill('admin@yasinaslan.com.tr');
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(`**${MODULES_URL}`, { timeout: 30_000 });
  await page.waitForLoadState('networkidle');
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
    const sub = await prisma.subscription.findUnique({ where: { tenantId: TENANT_ID } });
    if (!sub) throw new Error('demo-tenant has no subscription; run pnpm db:seed');
    originalPlanId = sub.planId;
    const state = await prisma.moduleState.findUnique({
      where: { tenantId_moduleId: { tenantId: TENANT_ID, moduleId: 'M6' } },
    });
    originalM6Status = (state?.status as ModuleStatus) ?? null;
  });

  test.afterAll(async () => {
    await setPlan(originalPlanId);
    if (originalM6Status) await setM6(originalM6Status);
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
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('main')).toContainText('Ultra');

    const m6Ultra = moduleCard(page, 'M6');
    await expect(m6Ultra).not.toContainText('Kilitli');
    await m6Ultra.getByRole('button', { name: 'Etkinleştir' }).click();
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
