import { test, expect, type Page } from '@playwright/test';
import type { ModuleStatus } from '@prisma/client';

import { prisma } from '../../src/lib/db';
import { PLAN_E2E, seed, rollback } from '../../scripts/seed-plan-e2e';
import { shotsDir } from './fixtures/shots';
import { signInAs } from './fixtures/session';

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
 * UI for changing your own plan.
 *
 * The tenant being flipped is this suite's own — `PLAN_E2E.flip` from
 * scripts/seed-plan-e2e.ts — and is dropped again afterwards. It used to be
 * `demo-tenant`, restored to its original plan in `afterAll`. That restore was
 * correct and still the wrong tenant to use: agents run their specs against
 * separate dev servers but one Postgres, so any spec reading `demo-tenant`'s
 * plan during this suite saw `pro` or `ultra` depending on timing, and failed
 * for a reason written in a file it does not import. A plan that is the subject
 * of the test belongs to the test.
 */

const SHOTS = shotsDir('TASK-MTQZ8MVAU3J7I-screenshots');
const FLIP = PLAN_E2E.flip;
const TENANT_ID = FLIP.tenantId;
/** M10 (Follow-up Documents): granted by `ultra` only, per PLAN_GRANTS. */
const M10_URL = `/tr/${FLIP.workspaceSlug}/opportunities/${FLIP.opportunityId}/documents`;

async function setPlan(planId: string) {
  await prisma.subscription.update({
    where: { tenantId: TENANT_ID },
    data: { planId, status: 'ACTIVE' },
  });
}

async function setM10(status: ModuleStatus) {
  await prisma.moduleState.upsert({
    where: { tenantId_moduleId: { tenantId: TENANT_ID, moduleId: 'M10' } },
    update: { status },
    create: { tenantId: TENANT_ID, moduleId: 'M10', status },
  });
}

async function signIn(page: Page, target: string) {
  // A minted session for the user `seed()` wrote (scripts/seed-plan-e2e.ts owns its
  // User + Membership, `rollback` removes them), not the demo sign-in form, so the spec
  // runs against `next start` too (TASK-MUSBCXP9RKS3D). signInAs also records the
  // cookie consent: the banner is a full-screen alertdialog that swallows clicks.
  await signInAs(page, { id: FLIP.userId, email: FLIP.email, tenantId: FLIP.tenantId, role: FLIP.role });
  await page.goto(target);
  await page.waitForURL(`**/opportunities/${FLIP.opportunityId}/documents`, { timeout: 60_000 });
  // No network-idle wait: a dev server never goes quiet for the 500 ms
  // it waits for, so it is a race. Every caller asserts on `main` next, and Playwright's
  // auto-waiting is the synchronisation.
}

test.describe('module gate — an ON module outside the plan is still refused', () => {
  test.beforeAll(async () => {
    // Re-seeding also puts the plan back to `pro` after a previous run left it on
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
