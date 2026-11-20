import { test, expect, type Page } from '@playwright/test';

import { prisma } from '../../src/lib/db';
import { shotsDir } from './fixtures/shots';
import { expectHydrated } from './fixtures/hydration';
import { signInAs } from './fixtures/session';

/**
 * Reactivating a withdrawn opportunity ("yeniden etkinleştir") — NG-241 Faz 2, on a real browser
 * and database. Withdrawal itself is covered by opportunity-withdraw.spec.ts and is not changed here.
 *
 * Proved here, in Turkish and English:
 *   1. Withdraw (ACTIVE and SUBMITTED) with a reason, then reactivate with a reason: the status
 *      goes back to the status it had before the withdrawal, and the decision log reads both rows.
 *   2. A reactivation without a reason is refused and shown; the row stays WITHDRAWN, no row is written.
 *   3. A stale page (the status changed elsewhere) gets the NOT_WITHDRAWN message, which says to refresh.
 *   4. A MEMBER who does not own the opportunity does not see the reactivate control.
 *   5. An opportunity that is not WITHDRAWN shows no reactivate control.
 */

const SHOTS = shotsDir('NG-241-screenshots');

const F = {
  tenantId: 'reactivate-e2e-tenant',
  workspaceId: 'reactivate-e2e-workspace',
  workspaceSlug: 'reactivate-e2e-ws',
  ownerId: 'reactivate-e2e-owner',
  ownerEmail: 'reactivate-e2e-owner@fabrika.test',
  memberId: 'reactivate-e2e-member',
  memberEmail: 'reactivate-e2e-member@fabrika.test',
  activeOpp: 'reactivate-e2e-active',
  submittedOpp: 'reactivate-e2e-submitted',
  /** Owned by the owner, already WITHDRAWN: the member must not see its reactivate control. */
  foreignWithdrawnOpp: 'reactivate-e2e-foreign-withdrawn',
} as const;

const WITHDRAW_REASON = 'Ortak bulunamadı';
const REACTIVATE_REASON = '  Ortak bulundu, yeniden başvuracağız  ';
const REACTIVATE_REASON_TRIMMED = 'Ortak bulundu, yeniden başvuracağız';

const COPY = {
  tr: {
    locale: 'tr',
    kindReactivated: 'Yeniden etkinleştirildi',
    reasonRequired: 'Yeniden etkinleştirmek için bir gerekçe yazmanız gerekir.',
    notWithdrawn: /durumu değişmiş|durum değişmiş olabilir.*yenileyin/i,
    warning: 'pasife alındı',
  },
  en: {
    locale: 'en',
    kindReactivated: 'Reactivated',
    reasonRequired: 'You must write a reason to reactivate.',
    notWithdrawn: /status may have changed.*refresh/,
    warning: 'set to passive',
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

async function seedFixture() {
  await prisma.tenant.upsert({
    where: { id: F.tenantId },
    update: {},
    create: { id: F.tenantId, name: 'Reactivate E2E', slug: 'reactivate-e2e', country: 'TR', orgType: 'SME' },
  });
  await prisma.workspace.upsert({
    where: { id: F.workspaceId },
    update: {},
    create: { id: F.workspaceId, tenantId: F.tenantId, name: 'Reactivate E2E', slug: F.workspaceSlug },
  });
  for (const [id, email, name] of [
    [F.ownerId, F.ownerEmail, 'Reactivate E2E Owner'],
    [F.memberId, F.memberEmail, 'Reactivate E2E Member'],
  ] as const) {
    await prisma.user.upsert({
      where: { id },
      update: { email, name },
      create: { id, email, name, locale: 'tr' },
    });
  }
  await prisma.moduleState.upsert({
    where: { tenantId_moduleId: { tenantId: F.tenantId, moduleId: 'M5' } },
    update: { status: 'ON' },
    create: { tenantId: F.tenantId, moduleId: 'M5', status: 'ON', changedBy: 'seed-reactivate-e2e' },
  });
  await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId: F.tenantId, userId: F.ownerId } },
    update: { role: 'TENANT_OWNER', workspaceIds: [F.workspaceId] },
    create: { userId: F.ownerId, tenantId: F.tenantId, role: 'TENANT_OWNER', workspaceIds: [F.workspaceId] },
  });
  await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId: F.tenantId, userId: F.memberId } },
    update: { role: 'MEMBER', workspaceIds: [F.workspaceId] },
    create: { userId: F.memberId, tenantId: F.tenantId, role: 'MEMBER', workspaceIds: [F.workspaceId] },
  });

  const opps = [
    { id: F.activeOpp, title: 'Reactivate E2E — ACTIVE', status: 'ACTIVE' as const },
    { id: F.submittedOpp, title: 'Reactivate E2E — SUBMITTED', status: 'SUBMITTED' as const },
    { id: F.foreignWithdrawnOpp, title: 'Reactivate E2E — foreign WITHDRAWN', status: 'WITHDRAWN' as const },
  ];
  for (const o of opps) {
    const data = { title: o.title, status: o.status, deletedAt: null, deletionReason: null };
    await prisma.opportunity.upsert({
      where: { id: o.id },
      update: data,
      create: {
        id: o.id,
        tenantId: F.tenantId,
        workspaceId: F.workspaceId,
        stage: 'G0',
        intendedRole: 'coordinator',
        ownerId: F.ownerId,
        ...data,
      },
    });
  }
  await prisma.decisionLog.deleteMany({ where: { tenantId: F.tenantId } });
  await prisma.auditEvent.deleteMany({
    where: { tenantId: F.tenantId, type: { in: ['opportunity.withdrawn', 'opportunity.reactivated'] } },
  });
}

async function rollbackFixture() {
  await prisma.decisionLog.deleteMany({ where: { tenantId: F.tenantId } });
  await prisma.auditEvent.deleteMany({ where: { tenantId: F.tenantId } });
  await prisma.opportunity.deleteMany({ where: { tenantId: F.tenantId } });
  await prisma.moduleState.deleteMany({ where: { tenantId: F.tenantId } });
  await prisma.membership.deleteMany({ where: { tenantId: F.tenantId } });
  await prisma.user.deleteMany({ where: { id: { in: [F.ownerId, F.memberId] } } });
  await prisma.workspace.deleteMany({ where: { id: F.workspaceId } });
  await prisma.tenant.deleteMany({ where: { id: F.tenantId } });
}

async function openDetail(page: Page, copy: Copy, oppId: string, who: 'owner' | 'member' = 'owner') {
  const user =
    who === 'owner'
      ? { id: F.ownerId, email: F.ownerEmail, name: 'Reactivate E2E Owner', role: 'TENANT_OWNER' as const }
      : { id: F.memberId, email: F.memberEmail, name: 'Reactivate E2E Member', role: 'MEMBER' as const };
  await signInAs(page, { ...user, tenantId: F.tenantId });
  await page.goto(`/${copy.locale}/${F.workspaceSlug}/pipeline/${oppId}`);
  const app = page.getByRole('main');
  await expectHydrated(app.getByRole('heading').first());
  return app;
}

/** Withdraws through the UI, as the owner, with a reason. */
async function withdrawThroughUi(page: Page, copy: Copy, oppId: string) {
  const app = await openDetail(page, copy, oppId);
  await app.getByTestId('pipeline-withdraw-open').click();
  await app.getByTestId('pipeline-withdraw-reason').fill(WITHDRAW_REASON);
  await app.getByTestId('pipeline-withdraw-submit').click();
  await expect(app.getByTestId('pipeline-withdrawn-warning')).toContainText(copy.warning, { timeout: 20_000 });
  return app;
}

const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

test.describe('Reactivating a withdrawn opportunity', () => {
  test.beforeAll(async () => {
    await seedFixture();
  });

  test.beforeEach(async () => {
    await seedFixture();
  });

  test.afterAll(async () => {
    if (process.env.REACTIVATE_E2E_KEEP !== '1') await rollbackFixture();
    await prisma.$disconnect();
  });

  for (const copy of [COPY.tr, COPY.en]) {
    test.describe(`[${copy.locale}]`, () => {
      test('ACTIVE: withdraw, then reactivate with a reason; the status goes back to ACTIVE and the log shows both rows', async ({ page }) => {
        const app = await withdrawThroughUi(page, copy, F.activeOpp);
        await expect(app.getByTestId('pipeline-reactivate-open')).toBeVisible();
        await shot(page, `${copy.locale}-01-active-withdrawn`);

        await app.getByTestId('pipeline-reactivate-open').click();
        await app.getByTestId('pipeline-reactivate-reason').fill(REACTIVATE_REASON);
        await app.getByTestId('pipeline-reactivate-submit').click();

        // No reload: the status and the log update on the same page.
        await expect(app.getByTestId('pipeline-withdrawn-warning')).toHaveCount(0, { timeout: 20_000 });
        await expect(app.getByTestId('pipeline-withdraw-open')).toBeVisible();
        await expect(app.getByTestId('pipeline-decision-log')).toContainText(copy.kindReactivated);
        await expect(app.getByTestId('pipeline-decision-log')).toContainText(REACTIVATE_REASON_TRIMMED);
        await shot(page, `${copy.locale}-02-active-reactivated`);

        const opp = await prisma.opportunity.findUniqueOrThrow({ where: { id: F.activeOpp }, select: { status: true } });
        expect(opp.status).toBe('ACTIVE');
        const rows = await prisma.decisionLog.findMany({
          where: { tenantId: F.tenantId, opportunityId: F.activeOpp },
          orderBy: { decidedAt: 'asc' },
          select: { kind: true, reason: true, decidedById: true },
        });
        expect(rows).toEqual([
          { kind: 'WITHDRAW', reason: WITHDRAW_REASON, decidedById: F.ownerId },
          { kind: 'REACTIVATE', reason: REACTIVATE_REASON_TRIMMED, decidedById: F.ownerId },
        ]);
      });

      test('SUBMITTED: withdraw, then reactivate; the status goes back to SUBMITTED, not ACTIVE', async ({ page }) => {
        const app = await withdrawThroughUi(page, copy, F.submittedOpp);
        await app.getByTestId('pipeline-reactivate-open').click();
        await app.getByTestId('pipeline-reactivate-reason').fill(REACTIVATE_REASON);
        await app.getByTestId('pipeline-reactivate-submit').click();

        await expect(app.getByTestId('pipeline-withdrawn-warning')).toHaveCount(0, { timeout: 20_000 });
        await expect(app.getByTestId('pipeline-decision-log')).toContainText(copy.kindReactivated);

        const opp = await prisma.opportunity.findUniqueOrThrow({ where: { id: F.submittedOpp }, select: { status: true } });
        expect(opp.status).toBe('SUBMITTED');
        await shot(page, `${copy.locale}-03-submitted-reactivated`);
      });

      test('without a reason the server refuses, the refusal is shown, and the row stays WITHDRAWN', async ({ page }) => {
        const app = await withdrawThroughUi(page, copy, F.activeOpp);
        await app.getByTestId('pipeline-reactivate-open').click();
        await app.getByTestId('pipeline-reactivate-submit').click();

        const error = app.getByTestId('pipeline-reactivate-error');
        await expect(error).toBeVisible({ timeout: 20_000 });
        await expect(error).toHaveText(copy.reasonRequired);
        await expect(error).toHaveAttribute('role', 'alert');
        await shot(page, `${copy.locale}-04-reactivate-refused-without-reason`);

        const opp = await prisma.opportunity.findUniqueOrThrow({ where: { id: F.activeOpp }, select: { status: true } });
        expect(opp.status).toBe('WITHDRAWN');
        expect(
          await prisma.decisionLog.count({ where: { tenantId: F.tenantId, opportunityId: F.activeOpp, kind: 'REACTIVATE' } }),
        ).toBe(0);
      });

      test('a stale page is told to refresh when the status changed elsewhere (NOT_WITHDRAWN)', async ({ page }) => {
        const app = await withdrawThroughUi(page, copy, F.activeOpp);
        // Another session reactivates it while this page still shows WITHDRAWN.
        await prisma.opportunity.update({ where: { id: F.activeOpp }, data: { status: 'ACTIVE' } });

        await app.getByTestId('pipeline-reactivate-open').click();
        await app.getByTestId('pipeline-reactivate-reason').fill(REACTIVATE_REASON);
        await app.getByTestId('pipeline-reactivate-submit').click();

        const error = app.getByTestId('pipeline-reactivate-error');
        await expect(error).toBeVisible({ timeout: 20_000 });
        await expect(error).toHaveText(copy.notWithdrawn);
      });

      test('a MEMBER who does not own the opportunity sees no reactivate control', async ({ page }) => {
        const app = await openDetail(page, copy, F.foreignWithdrawnOpp, 'member');
        await expect(app.getByTestId('pipeline-withdrawn-warning')).toBeVisible();
        await expect(app.getByTestId('pipeline-reactivate-open')).toHaveCount(0);
      });

      test('an opportunity that is not WITHDRAWN shows no reactivate control', async ({ page }) => {
        const app = await openDetail(page, copy, F.activeOpp);
        await expect(app.getByTestId('pipeline-withdraw-open')).toBeVisible();
        await expect(app.getByTestId('pipeline-reactivate-open')).toHaveCount(0);
      });
    });
  }
});
