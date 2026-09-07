import { test, expect, type Page } from '@playwright/test';

import { prisma } from '../../src/lib/db';

/**
 * The plan half of the module gate, in a real browser — TASK-MTQZ8MVAU3J7I.
 *
 * `tests/e2e/plan-entitlement.spec.ts` covers the *settings* page: a plan that
 * does not include a module must not let you switch it on. This covers the case
 * that page cannot reach — a `ModuleState` row that is already `ON` while the
 * plan does not include the module, which is how the demo tenant actually sat
 * (plan `pro`, M10 `ON`) and which opened every M10 page and action for free.
 *
 * Same session, same URL, same `ModuleState` row throughout: only the
 * subscription's `planId` moves, so anything that changes is the plan gate and
 * nothing else. The plan is flipped in the database because the product has no
 * UI for changing your own plan, and restored afterwards.
 */

const SHOTS = 'docs/agent-results/TASK-MTQZ8MVAU3J7I-screenshots';
const TENANT_ID = 'demo-tenant';
/** M10 (Follow-up Documents): granted by `ultra` only, per PLAN_GRANTS. */
const M10_URL = '/tr/main/opportunities/demo-opp-1/documents';

let originalPlanId: string;
let originalM10Status: string | null = null;

async function setPlan(planId: string) {
  await prisma.subscription.update({
    where: { tenantId: TENANT_ID },
    data: { planId, status: 'ACTIVE' },
  });
}

async function setM10(status: string) {
  await prisma.moduleState.upsert({
    where: { tenantId_moduleId: { tenantId: TENANT_ID, moduleId: 'M10' } },
    update: { status },
    create: { tenantId: TENANT_ID, moduleId: 'M10', status },
  });
}

async function signIn(page: Page, target: string) {
  // The cookie banner is a full-screen alertdialog and swallows the click on the
  // sign-in button; a recorded consent is the state a returning user is in.
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'fabrika_cookie_consent',
      JSON.stringify({ necessary: true, analytics: true, marketing: true }),
    );
  });
  await page.goto(`/tr/giris?callbackUrl=${encodeURIComponent(target)}`);
  await page.locator('input[type="email"]').fill('admin@yasinaslan.com.tr');
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(`**/opportunities/demo-opp-1/documents`, { timeout: 60_000 });
  await page.waitForLoadState('networkidle');
}

test.describe('module gate — an ON module outside the plan is still refused', () => {
  test.beforeAll(async () => {
    const sub = await prisma.subscription.findUnique({ where: { tenantId: TENANT_ID } });
    if (!sub) throw new Error('demo-tenant has no subscription; run pnpm db:seed');
    originalPlanId = sub.planId;
    const state = await prisma.moduleState.findUnique({
      where: { tenantId_moduleId: { tenantId: TENANT_ID, moduleId: 'M10' } },
    });
    originalM10Status = state?.status ?? null;
  });

  test.afterAll(async () => {
    await setPlan(originalPlanId);
    if (originalM10Status) await setM10(originalM10Status);
    await prisma.$disconnect();
  });

  test('Pro is locked out of M10 and Ultra is let in — with the module ON both times', async ({
    page,
  }) => {
    // The state the bug lived in: the row says ON, the plan does not sell it.
    await setM10('ON');
    await setPlan('pro');

    await signIn(page, M10_URL);

    const main = page.getByRole('main');
    await expect(main).toContainText('Bu modül şu anda kullanılamıyor');
    // The reason names the plan, not the switch: "turned off for your workspace"
    // would invite the owner to go and turn on something the tenant does not own.
    await expect(main).toContainText('aboneliğinizin kapsamı dışında');
    // The plan that does sell it is read from PLAN_GRANTS, not typed into copy.
    await expect(main).toContainText('Ultra');
    // Nothing behind the gate rendered.
    await expect(main).not.toContainText('Takip Belgeleri');
    await expect(main.getByRole('button', { name: /TÜBİTAK/ })).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/e2e-01-pro-m10-locked.png`, fullPage: true });

    // The row really is ON — the refusal is the plan's, not the status's.
    const state = await prisma.moduleState.findUnique({
      where: { tenantId_moduleId: { tenantId: TENANT_ID, moduleId: 'M10' } },
    });
    expect(state?.status).toBe('ON');

    // ── Ultra includes M10. Same session, same URL, same row: the page opens.
    await setPlan('ultra');
    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(main).toContainText('Takip Belgeleri');
    await expect(main).not.toContainText('aboneliğinizin kapsamı dışında');
    await page.screenshot({ path: `${SHOTS}/e2e-02-ultra-m10-open.png`, fullPage: true });
  });

  test('an OFF module the plan does include is still refused', async ({ page }) => {
    // Status keeps its own say: entitlement is a second gate, not a replacement.
    await setPlan('ultra');
    await setM10('OFF');

    await signIn(page, M10_URL);

    const main = page.getByRole('main');
    await expect(main).toContainText('Bu modül şu anda kullanılamıyor');
    await expect(main).toContainText('kiracınızda kapalı');
    await expect(main).not.toContainText('aboneliğinizin kapsamı dışında');
    await page.screenshot({ path: `${SHOTS}/e2e-03-ultra-m10-off.png`, fullPage: true });
  });
});
