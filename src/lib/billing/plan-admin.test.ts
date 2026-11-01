/**
 * The rules the admin plan screen exists to enforce, tested against the real
 * database rather than a mock — the whole reason this task exists is that a
 * hand-written `any` Prisma override let a call to a table that did not exist
 * type-check clean. A mocked delegate would reproduce exactly that blindness.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '@/lib/db';
import {
  createDraftVersion,
  updateDraftVersion,
  publishVersion,
  discardDraftVersion,
  computePublishImpact,
  listPlansForAdmin,
  listVersionHistory,
  archivePlan,
  deletePlan,
  setPlanVisibility,
  assignPlanToTenant,
  unassignPlanFromTenant,
  countLiveSubscriptions,
  PublishedVersionImmutableError,
  ImpactNotAcknowledgedError,
  ModuleNotGrantedError,
  PlanInUseError,
} from './plan-repository';
import { requireId } from '../../../tests/helpers/teardown-guard';
import { skipUnlessSeeded } from '../../../tests/helpers/seed';

const suffix = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('plan admin write layer', () => {
  /** Saving a module bullet checks it against ModuleCatalog, which only `pnpm db:seed` fills. */
  async function needsModuleCatalog(ctx: { skip: (note?: string) => void }) {
    const known = await prisma.moduleCatalog.count({ where: { id: 'M6' } });
    skipUnlessSeeded(ctx, 'plan admin write layer', known > 0, 'ModuleCatalog has no M6 row');
  }

  let planId: string;
  let tenantId: string;

  beforeEach(async () => {
    planId = `padm-${suffix()}`;
    const tenant = await prisma.tenant.create({
      data: { name: 'Plan Admin Tenant', slug: `padm-${suffix()}`, country: 'TR', orgType: 'SME' },
    });
    tenantId = tenant.id;

    await prisma.plan.create({
      data: {
        id: planId,
        name: 'Admin Test Plan',
        monthlyCents: 10000,
        yearlyCents: 100000,
        currency: 'USD',
        seats: 10,
        workspaces: 3,
        aiCreditsMonthly: 500,
        modules: ['M1', 'M3', 'M6'],
        visibility: 'public',
      },
    });
    await prisma.planVersion.create({
      data: {
        planId,
        version: 1,
        status: 'published',
        monthlyCents: 10000,
        yearlyCents: 100000,
        currency: 'USD',
        seats: 10,
        workspaces: 3,
        aiCreditsMonthly: 500,
        modules: ['M1', 'M3', 'M6'],
        publishedAt: new Date(),
        features: { create: [{ order: 1, kind: 'module', moduleId: 'M6', textTr: 'Lens', textEn: 'Lens' }] },
      },
    });
  });

  afterEach(async () => {
    await prisma.auditEvent.deleteMany({ where: { target: { startsWith: requireId(planId, 'planId') } } });
    await prisma.auditEvent.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } });
    await prisma.subscription.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } });
    await prisma.planAssignment.deleteMany({ where: { planId: requireId(planId, 'planId') } });
    await prisma.planVersion.deleteMany({ where: { planId: requireId(planId, 'planId') } });
    await prisma.plan.deleteMany({ where: { id: requireId(planId, 'planId') } });
    await prisma.tenant.deleteMany({ where: { id: requireId(tenantId, 'tenantId') } });
  });

  // ── (b) a published version is immutable; editing makes a new version ──

  it('refuses to edit a published version', async () => {
    const [live] = await listVersionHistory(planId);
    expect(live?.status).toBe('published');

    await expect(
      updateDraftVersion(
        live!.id,
        {
          monthlyCents: 1,
          yearlyCents: 1,
          currency: 'USD',
          seats: 1,
          workspaces: 1,
          aiCreditsMonthly: 1,
          modules: ['M1'],
        },
        []
      )
    ).rejects.toBeInstanceOf(PublishedVersionImmutableError);

    // and nothing moved
    const after = await prisma.planVersion.findUnique({ where: { id: live!.id } });
    expect(after?.monthlyCents).toBe(10000);
    expect(after?.seats).toBe(10);
  });

  it('refuses to publish over an already published version', async () => {
    const [live] = await listVersionHistory(planId);
    await expect(publishVersion(live!.id, 'u1', 0)).rejects.toBeInstanceOf(PublishedVersionImmutableError);
  });

  it('editing a published plan creates a new draft version, seeded from the live one', async () => {
    const draft = await createDraftVersion(planId);
    expect(draft.status).toBe('draft');
    expect(draft.version).toBe(2);
    expect(draft.monthlyCents).toBe(10000);
    expect(draft.features.map((f) => f.moduleId)).toEqual(['M6']);

    // the published version is untouched
    const history = await listVersionHistory(planId);
    expect(history.find((v) => v.version === 1)?.status).toBe('published');
  });

  it('does not stack a second draft for the same plan', async () => {
    const first = await createDraftVersion(planId);
    const second = await createDraftVersion(planId);
    expect(second.id).toBe(first.id);
    const drafts = (await listVersionHistory(planId)).filter((v) => v.status === 'draft');
    expect(drafts).toHaveLength(1);
  });

  it('publishing archives the previous version and keeps it readable', async (ctx) => {
    await needsModuleCatalog(ctx);
    const draft = await createDraftVersion(planId);
    await publishVersion(draft.id, 'admin-1', 0);

    const history = await listVersionHistory(planId);
    expect(history.find((v) => v.version === 2)?.status).toBe('published');
    expect(history.find((v) => v.version === 1)?.status).toBe('archived');
    expect(history.find((v) => v.version === 1)?.monthlyCents).toBe(10000);
  });

  // ── (c) the publish gate: N must be measured and echoed back ──

  it('counts the live tenants a lowering change hits', async () => {
    await prisma.subscription.create({
      data: { tenantId, planId, status: 'ACTIVE' },
    });

    const draft = await createDraftVersion(planId);
    await updateDraftVersion(
      draft.id,
      {
        monthlyCents: 10000,
        yearlyCents: 100000,
        currency: 'USD',
        seats: 3, // was 10
        workspaces: 3,
        aiCreditsMonthly: 500,
        modules: ['M1', 'M3'], // M6 removed
      },
      []
    );

    const impact = await computePublishImpact(draft.id);
    expect(impact.liveTenantCount).toBe(1);
    expect(impact.loweredTenantCount).toBe(1);
    expect(impact.lowered).toContain('seats');
    expect(impact.lowered).toContain('modules');
    expect(impact.removedModules).toEqual(['M6']);
  });

  it('reports zero lowered tenants when nothing shrinks', async () => {
    await prisma.subscription.create({ data: { tenantId, planId, status: 'ACTIVE' } });
    const draft = await createDraftVersion(planId);
    await updateDraftVersion(
      draft.id,
      {
        monthlyCents: 10000,
        yearlyCents: 100000,
        currency: 'USD',
        seats: 20, // raised
        workspaces: 3,
        aiCreditsMonthly: 500,
        modules: ['M1', 'M3', 'M6'],
      },
      []
    );
    const impact = await computePublishImpact(draft.id);
    expect(impact.liveTenantCount).toBe(1);
    expect(impact.loweredTenantCount).toBe(0);
    expect(impact.lowered).toEqual([]);
  });

  it('refuses a publish whose acknowledged tenant count does not match the measurement', async () => {
    await prisma.subscription.create({ data: { tenantId, planId, status: 'ACTIVE' } });
    const draft = await createDraftVersion(planId);
    await updateDraftVersion(
      draft.id,
      {
        monthlyCents: 10000,
        yearlyCents: 100000,
        currency: 'USD',
        seats: 2,
        workspaces: 3,
        aiCreditsMonthly: 500,
        modules: ['M1', 'M3', 'M6'],
      },
      []
    );

    // 0 is what an un-checked screen would send.
    await expect(publishVersion(draft.id, 'admin-1', 0)).rejects.toBeInstanceOf(ImpactNotAcknowledgedError);

    // still a draft — nothing shipped
    expect((await prisma.planVersion.findUnique({ where: { id: draft.id } }))?.status).toBe('draft');

    // with the measured number it goes through
    const impact = await computePublishImpact(draft.id);
    await publishVersion(draft.id, 'admin-1', impact.loweredTenantCount);
    expect((await prisma.planVersion.findUnique({ where: { id: draft.id } }))?.status).toBe('published');
  });

  // ── (d) card bullets stay inside the module grant ──

  it('refuses a card bullet naming a module the version does not grant', async () => {
    const draft = await createDraftVersion(planId);
    await expect(
      updateDraftVersion(
        draft.id,
        {
          monthlyCents: 10000,
          yearlyCents: 100000,
          currency: 'USD',
          seats: 10,
          workspaces: 3,
          aiCreditsMonthly: 500,
          modules: ['M1', 'M3'], // M6 not granted
        },
        [{ order: 1, kind: 'module', moduleId: 'M6' }]
      )
    ).rejects.toBeInstanceOf(ModuleNotGrantedError);
  });

  it('refuses a card bullet naming a module that is not in ModuleCatalog', async () => {
    const draft = await createDraftVersion(planId);
    await expect(
      updateDraftVersion(
        draft.id,
        {
          monthlyCents: 10000,
          yearlyCents: 100000,
          currency: 'USD',
          seats: 10,
          workspaces: 3,
          aiCreditsMonthly: 500,
          modules: ['M1', 'M99'],
        },
        [{ order: 1, kind: 'module', moduleId: 'M99' }]
      )
    ).rejects.toBeInstanceOf(ModuleNotGrantedError);
  });

  it('accepts a card bullet inside the grant', async (ctx) => {
    await needsModuleCatalog(ctx);
    const draft = await createDraftVersion(planId);
    const saved = await updateDraftVersion(
      draft.id,
      {
        monthlyCents: 10000,
        yearlyCents: 100000,
        currency: 'USD',
        seats: 10,
        workspaces: 3,
        aiCreditsMonthly: 500,
        modules: ['M1', 'M3', 'M6'],
      },
      [
        { order: 1, kind: 'module', moduleId: 'M6' },
        { order: 2, kind: 'text', textTr: 'Öncelikli destek', textEn: 'Priority support' },
      ]
    );
    expect(saved.features).toHaveLength(2);
    expect(saved.features[0]?.moduleId).toBe('M6');
  });

  it('refuses an ungranted bullet at publish time too, not only on save', async () => {
    const draft = await createDraftVersion(planId);
    // Write the bad row past the save-time check, straight into the table.
    await prisma.planFeature.deleteMany({ where: { planVersionId: requireId(draft.id, 'draft.id') } });
    await prisma.planVersion.update({ where: { id: draft.id }, data: { modules: ['M1'] } });
    await prisma.planFeature.create({
      data: { planVersionId: draft.id, order: 1, kind: 'module', moduleId: 'M6' },
    });

    await expect(publishVersion(draft.id, 'admin-1', 0)).rejects.toBeInstanceOf(ModuleNotGrantedError);
  });

  // ── (e) a plan in use is archived, never deleted ──

  it('refuses to delete a plan with a live subscription', async () => {
    await prisma.subscription.create({ data: { tenantId, planId, status: 'ACTIVE' } });
    expect(await countLiveSubscriptions(planId)).toBe(1);
    await expect(deletePlan(planId, 'admin-1')).rejects.toBeInstanceOf(PlanInUseError);
    expect(await prisma.plan.findUnique({ where: { id: planId } })).not.toBeNull();
  });

  it('archives a plan in use instead, leaving the subscription intact', async () => {
    await prisma.subscription.create({ data: { tenantId, planId, status: 'ACTIVE' } });
    await archivePlan(planId, 'admin-1');
    expect((await prisma.plan.findUnique({ where: { id: planId } }))?.visibility).toBe('archived');
    expect(await prisma.subscription.findUnique({ where: { tenantId } })).not.toBeNull();
  });

  it('deletes a plan nobody is on', async () => {
    await deletePlan(planId, 'admin-1');
    expect(await prisma.plan.findUnique({ where: { id: planId } })).toBeNull();
  });

  it('a cancelled subscription does not block deletion', async () => {
    await prisma.subscription.create({ data: { tenantId, planId, status: 'CANCELED' } });
    expect(await countLiveSubscriptions(planId)).toBe(0);
  });

  // TASK-MTUI9R0FOOY2J: the shared dev DB was found with exactly this shape —
  // `Subscription.planId` said one plan, `planVersionId` (a different concept,
  // the entitlement-terms version — src/lib/billing/entitlement-source.ts) still
  // pointed at another plan's version, because a test helper
  // (tests/e2e/plan-entitlement.spec.ts `setPlan()`) writes `planId` alone. The
  // guard counts by `planId`, which is the field every write path (Stripe
  // subscription-sync, iyzico, `getEntitlements`, `publishVersion`'s
  // subscription move) treats as "the plan this subscription is on" — these two
  // tests lock that it stays correct even when `planVersionId` disagrees, rather
  // than the guard being switched to key off `planVersionId` (which is nullable
  // and lags by design on a plan change with no published version, and would
  // have gotten this exact case backwards).
  it('refuses to delete a plan with a live subscription even when that subscription\'s planVersionId points at a different, empty plan', async () => {
    const emptyPlanId = `padm-empty-${suffix()}`;
    await prisma.plan.create({
      data: {
        id: emptyPlanId,
        name: 'Empty Plan',
        monthlyCents: 5000,
        yearlyCents: 50000,
        currency: 'USD',
        seats: 5,
        workspaces: 1,
        aiCreditsMonthly: 100,
        modules: ['M1'],
        visibility: 'public',
      },
    });
    const emptyVersion = await prisma.planVersion.create({
      data: {
        planId: emptyPlanId,
        version: 1,
        status: 'published',
        monthlyCents: 5000,
        yearlyCents: 50000,
        currency: 'USD',
        seats: 5,
        workspaces: 1,
        aiCreditsMonthly: 100,
        modules: ['M1'],
        publishedAt: new Date(),
      },
    });

    try {
      // Live on `planId`, but planVersionId misleadingly points at emptyPlanId's version.
      await prisma.subscription.create({
        data: { tenantId, planId, status: 'ACTIVE', planVersionId: emptyVersion.id },
      });

      expect(await countLiveSubscriptions(planId)).toBe(1);
      expect(await countLiveSubscriptions(emptyPlanId)).toBe(0);

      await expect(deletePlan(planId, 'admin-1')).rejects.toBeInstanceOf(PlanInUseError);
      expect(await prisma.plan.findUnique({ where: { id: planId } })).not.toBeNull();

      // the actually-empty plan stays safely deletable
      await deletePlan(emptyPlanId, 'admin-1');
      expect(await prisma.plan.findUnique({ where: { id: emptyPlanId } })).toBeNull();
    } finally {
      // The version must go first: PlanVersion.planId is ON DELETE RESTRICT, so a
      // plan delete alone fails here and leaves both rows behind. Those rows then
      // make every later `pnpm db:seed` fail on its retired-plan cleanup.
      await prisma.planVersion.deleteMany({ where: { planId: emptyPlanId } });
      await prisma.plan.deleteMany({ where: { id: emptyPlanId } });
    }
  });

  it('deletes an empty plan even when another tenant\'s stale planVersionId points at one of its versions', async () => {
    const liveTenant = await prisma.tenant.create({
      data: { name: 'Other Live Tenant', slug: `padm-other-${suffix()}`, country: 'TR', orgType: 'SME' },
    });
    const liveOtherPlanId = `padm-other-${suffix()}`;
    await prisma.plan.create({
      data: {
        id: liveOtherPlanId,
        name: 'Other Live Plan',
        monthlyCents: 5000,
        yearlyCents: 50000,
        currency: 'USD',
        seats: 5,
        workspaces: 1,
        aiCreditsMonthly: 100,
        modules: ['M1'],
        visibility: 'public',
      },
    });

    try {
      const [ourVersion] = await listVersionHistory(planId);

      // Live subscription on a DIFFERENT plan, but its planVersionId still points
      // at our (about-to-be-deleted) plan's published version — the shape a
      // planId-only write leaves behind.
      await prisma.subscription.create({
        data: {
          tenantId: liveTenant.id,
          planId: liveOtherPlanId,
          status: 'ACTIVE',
          planVersionId: ourVersion!.id,
        },
      });

      expect(await countLiveSubscriptions(planId)).toBe(0);

      await deletePlan(planId, 'admin-1');
      expect(await prisma.plan.findUnique({ where: { id: planId } })).toBeNull();

      // history isn't broken: the stray subscription is untouched, only its
      // dangling version pointer is nulled by the FK — the delete never blocked on it.
      const strayNow = await prisma.subscription.findUnique({ where: { tenantId: liveTenant.id } });
      expect(strayNow?.planId).toBe(liveOtherPlanId);
      expect(strayNow?.planVersionId).toBeNull();
    } finally {
      await prisma.subscription.deleteMany({ where: { tenantId: requireId(liveTenant.id, 'liveTenant.id') } });
      await prisma.plan.deleteMany({ where: { id: liveOtherPlanId } });
      await prisma.tenant.deleteMany({ where: { id: requireId(liveTenant.id, 'liveTenant.id') } });
    }
  });

  // ── (f) every publish writes an audit record with before/after ──

  it('writes an audit record carrying who, when and before/after', async () => {
    const draft = await createDraftVersion(planId);
    await updateDraftVersion(
      draft.id,
      {
        monthlyCents: 12000,
        yearlyCents: 120000,
        currency: 'USD',
        seats: 12,
        workspaces: 3,
        aiCreditsMonthly: 500,
        modules: ['M1', 'M3', 'M6'],
      },
      []
    );
    await publishVersion(draft.id, 'admin-42', 0);

    const event = await prisma.auditEvent.findFirst({
      where: { type: 'plan.version.published', target: `${planId}#v2` },
      orderBy: { createdAt: 'desc' },
    });
    expect(event).not.toBeNull();
    expect(event?.actorId).toBe('admin-42');
    expect(event?.createdAt).toBeInstanceOf(Date);
    const data = event?.data as Record<string, unknown>;
    expect((data.before as Record<string, unknown>).monthlyCents).toBe(10000);
    expect((data.after as Record<string, unknown>).monthlyCents).toBe(12000);
    expect((data.after as Record<string, unknown>).seats).toBe(12);
  });

  it('mirrors the published body onto the Plan projection', async () => {
    const draft = await createDraftVersion(planId);
    await updateDraftVersion(
      draft.id,
      {
        monthlyCents: 15000,
        yearlyCents: 150000,
        currency: 'USD',
        seats: 15,
        workspaces: 4,
        aiCreditsMonthly: 900,
        modules: ['M1', 'M3', 'M6'],
      },
      []
    );
    await publishVersion(draft.id, 'admin-1', 0);
    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    expect(plan?.monthlyCents).toBe(15000);
    expect(plan?.seats).toBe(15);
  });

  // ── (g) private plans and tenant assignment ──

  it('assigns a private plan to a tenant, shows it in the admin list and audits it', async () => {
    await setPlanVisibility(planId, 'private', 'admin-1');
    await assignPlanToTenant(planId, tenantId, 'admin-1', 'pilot deal');

    const rows = await listPlansForAdmin();
    const row = rows.find((p) => p.id === planId);
    expect(row?.visibility).toBe('private');
    expect(row?.assignments.map((a) => a.tenantId)).toContain(tenantId);
    expect(row?.assignments[0]?.note).toBe('pilot deal');

    const event = await prisma.auditEvent.findFirst({
      where: { type: 'plan.assigned', target: planId },
    });
    expect(event?.tenantId).toBe(tenantId);
  });

  it('assigning twice does not duplicate the row', async () => {
    await assignPlanToTenant(planId, tenantId, 'admin-1', 'first');
    await assignPlanToTenant(planId, tenantId, 'admin-1', 'second');
    const rows = await prisma.planAssignment.findMany({ where: { planId, tenantId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.note).toBe('second');
  });

  it('unassigning removes the tenant from the plan', async () => {
    await assignPlanToTenant(planId, tenantId, 'admin-1', null);
    await unassignPlanFromTenant(planId, tenantId, 'admin-1');
    expect(await prisma.planAssignment.findMany({ where: { planId, tenantId } })).toHaveLength(0);
  });

  // ── list + discard ──

  it('lists drafts alongside published versions with a live-subscription count', async () => {
    await prisma.subscription.create({ data: { tenantId, planId, status: 'TRIALING' } });
    await createDraftVersion(planId);
    const row = (await listPlansForAdmin()).find((p) => p.id === planId);
    expect(row?.liveSubscriptions).toBe(1);
    expect(row?.versions.map((v) => v.status).sort()).toEqual(['draft', 'published']);
  });

  it('discards a draft but refuses to discard a published version', async () => {
    const draft = await createDraftVersion(planId);
    await discardDraftVersion(draft.id);
    expect(await prisma.planVersion.findUnique({ where: { id: draft.id } })).toBeNull();

    const [live] = await listVersionHistory(planId);
    await expect(discardDraftVersion(live!.id)).rejects.toBeInstanceOf(PublishedVersionImmutableError);
  });
});
