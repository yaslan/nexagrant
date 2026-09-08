import { test, expect, type Page } from '@playwright/test';
import { encode } from 'next-auth/jwt';
import { prisma } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';

/**
 * TASK-MTSJH8NMAXPRM — publishing a seat change in the plan studio must reach
 * the tenant living on that plan, in a real browser.
 *
 * The defect, measured against this database on 2026-09-08 before the fix: the
 * studio published `pro` v2 with `seats: 10` through the real repository path,
 * `Plan.seats` became 10, the pricing page moved — and
 * `getEntitlements('demo-tenant')` still answered `seats=6`, because it read
 * the compiled `PLAN_GRANTS`. The tenant's billing panel showed `/ 6`.
 *
 * This walks the whole thing with clicks: the operator opens the studio, raises
 * Pro from 6 seats to 10, is shown the blast radius, publishes; then the tenant
 * on Pro reloads its own billing panel and the seat quota reads 10.
 *
 * `10` is the distinguishing figure: `PLAN_GRANTS.pro.seats` is 6 and no plan
 * in the catalogue grants 10 seats, so a panel reading `/ 10` cannot have come
 * from the old path.
 *
 * Everything is put back in `afterAll`: v2 deleted, v1 re-published, the `Plan`
 * projection restored, `Subscription.planVersionId` returned to what it was.
 */

const SHOTS = shotsDir('TASK-MTSJH8NMAXPRM-screenshots');
const COOKIE_NAME = 'authjs.session-token';
const SECRET = process.env.AUTH_SECRET || 'fabrika-secret-key-horizon-europe-2026-super-secure';
const TENANT_ID = 'demo-tenant';
const ADMIN_URL = '/tr/admin/billing/plans';
const BILLING_URL = '/tr/main/settings/billing';

/** What the catalogue grants Pro, and what the studio will publish instead. */
const CATALOGUE_SEATS = 6;
const PUBLISHED_SEATS = 10;

let originalPlan: { seats: number; workspaces: number; aiCreditsMonthly: number; modules: string[] };
let originalPlanVersionId: string | null = null;
let originalSubPlanId = '';

async function signIn(page: Page, baseURL: string, token: Record<string, unknown>) {
  const value = await encode({ token, secret: SECRET, salt: COOKIE_NAME, maxAge: 60 * 60 });
  await page.context().clearCookies();
  await page.context().addCookies([{ name: COOKIE_NAME, value, url: baseURL }]);
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true })
    );
  });
}

const PLATFORM_ADMIN = {
  sub: 'demo-user-admin',
  id: 'demo-user-admin',
  name: 'Platform Admin',
  email: 'admin@yasinaslan.com.tr',
  tenantId: TENANT_ID,
  role: 'SUPER_ADMIN',
  isPlatformAdmin: true,
};

/** The same person without the platform hat — a tenant looking at its own bill. */
const TENANT_OWNER = {
  sub: 'demo-user-admin',
  id: 'demo-user-admin',
  name: 'Demo Owner',
  email: 'admin@yasinaslan.com.tr',
  tenantId: TENANT_ID,
  role: 'TENANT_OWNER',
};

test.describe.configure({ mode: 'serial' });

test.describe('a seat change published in the studio reaches the tenant', () => {
  test.beforeAll(async () => {
    const plan = await prisma.plan.findUnique({ where: { id: 'pro' } });
    if (!plan) throw new Error('no pro plan; run pnpm db:seed');
    originalPlan = {
      seats: plan.seats,
      workspaces: plan.workspaces,
      aiCreditsMonthly: plan.aiCreditsMonthly,
      modules: plan.modules,
    };
    const sub = await prisma.subscription.findUnique({ where: { tenantId: TENANT_ID } });
    if (!sub) throw new Error('demo-tenant has no subscription; run pnpm db:seed');
    originalPlanVersionId = sub.planVersionId ?? null;
    originalSubPlanId = sub.planId;
    if (originalSubPlanId !== 'pro') {
      await prisma.subscription.update({
        where: { tenantId: TENANT_ID },
        data: { planId: 'pro', status: 'ACTIVE' },
      });
    }
    // A draft left open by an earlier run is state, not a reason to fail.
    await prisma.planVersion.deleteMany({ where: { planId: 'pro', status: 'draft' } });
  });

  test.afterAll(async () => {
    await prisma.subscription.updateMany({
      where: { planVersionId: { not: null }, planId: 'pro' },
      data: { planVersionId: null },
    });
    await prisma.planVersion.deleteMany({ where: { planId: 'pro', version: { gt: 1 } } });
    await prisma.planVersion.updateMany({
      where: { planId: 'pro', version: 1 },
      data: { status: 'published' },
    });
    await prisma.plan.update({ where: { id: 'pro' }, data: originalPlan });
    await prisma.subscription.update({
      where: { tenantId: TENANT_ID },
      data: { planId: originalSubPlanId, planVersionId: originalPlanVersionId },
    });
    await prisma.auditEvent.deleteMany({ where: { type: 'plan.version.published', target: { startsWith: 'pro#v' } } });
    await prisma.$disconnect();
  });

  test('the tenant starts on the seat count the catalogue grants', async ({ page, baseURL }) => {
    await signIn(page, baseURL as string, TENANT_OWNER);
    await page.goto(BILLING_URL);
    await expect(page.getByTestId('settings-metric-seats')).toBeVisible();
    await expect(page.getByTestId('settings-metric-seats-total')).toHaveText(`/ ${CATALOGUE_SEATS}`);
    await page
      .getByTestId('settings-metric-seats')
      .screenshot({ path: `${SHOTS}/01-tenant-seats-before.png` });
    await page.screenshot({ path: `${SHOTS}/02-billing-panel-before.png`, fullPage: true });
  });

  test('the operator raises Pro to 10 seats and publishes it', async ({ page, baseURL }) => {
    await signIn(page, baseURL as string, PLATFORM_ADMIN);
    await page.goto(ADMIN_URL);
    await page.getByTestId('plan-row-pro').click();

    await page.getByTestId('create-draft').click();
    await expect(page.getByTestId('draft-editor')).toBeVisible();

    await page.getByTestId('field-seats').fill(String(PUBLISHED_SEATS));
    await page.getByTestId('save-draft').click();
    await expect(page.getByTestId('plan-notice')).toBeVisible();

    // The publish control only appears once the blast radius has been shown.
    await page.getByTestId('check-impact').click();
    await expect(page.getByTestId('impact-panel')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/03-studio-impact.png`, fullPage: true });

    await page.getByTestId('publish-version').click();
    await expect(page.getByTestId('version-status-2')).toHaveText('Yayında');
    await page.screenshot({ path: `${SHOTS}/04-studio-published.png`, fullPage: true });

    // The publish moved the live subscription onto the new version. Read from
    // the database rather than inferred from the screen: this column is the
    // join the whole task is about, and it was never written before.
    const version = await prisma.planVersion.findFirst({
      where: { planId: 'pro', status: 'published' },
      orderBy: { version: 'desc' },
    });
    expect(version?.seats).toBe(PUBLISHED_SEATS);
    const sub = await prisma.subscription.findUnique({ where: { tenantId: TENANT_ID } });
    expect(sub?.planVersionId).toBe(version?.id);
  });

  test('the tenant now has the seat count the studio published', async ({ page, baseURL }) => {
    await signIn(page, baseURL as string, TENANT_OWNER);
    await page.goto(BILLING_URL);
    await expect(page.getByTestId('settings-metric-seats-total')).toHaveText(`/ ${PUBLISHED_SEATS}`);
    await page
      .getByTestId('settings-metric-seats')
      .screenshot({ path: `${SHOTS}/05-tenant-seats-after.png` });
    await page.screenshot({ path: `${SHOTS}/06-billing-panel-after.png`, fullPage: true });

    // Not a blanket change: only the dimension the operator edited moved. A fix
    // that swapped every quota for some other constant would fail here.
    await expect(page.getByTestId('settings-metric-workspaces-total')).toHaveText(
      `/ ${originalPlan.workspaces}`
    );
    await expect(page.getByTestId('settings-metric-credits')).toContainText(
      `/ ${originalPlan.aiCreditsMonthly}`
    );
  });
});
