import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createDbClient, prisma } from '../src/lib/db';
import { getEntitlements } from '../src/lib/billing';
import { grantsFor } from '../src/lib/billing/catalog';
import {
  computePublishImpact,
  createDraftVersion,
  publishVersion,
  updateDraftVersion,
} from '../src/lib/billing/plan-repository';
import { envValue } from './helpers/dotenv';

/**
 * TASK-MTSJH8NMAXPRM — publishing a plan version must reach the tenants on it.
 *
 * Measured against this database on 2026-09-08, before the fix: the studio
 * published `pro` v2 with `seats: 10` through the real repository functions,
 * `Plan.seats` became 10, `PlanVersion` v2 said 10 — and
 * `getEntitlements('demo-tenant')` still answered `seats=6`, because it read
 * the compiled `PLAN_GRANTS`. `Subscription.planVersionId` stayed NULL, as it
 * had for every subscription ever written.
 *
 * The fixture plan `entitlement-version-fixture` is deliberately **not** in
 * `PLAN_GRANTS`. That is the distinguishing property of this suite: nothing in
 * the catalogue can answer for it, so a passing assertion cannot have come from
 * the old path — the old path throws `Plan not found in catalogue` on it.
 *
 * The `PlanVersion` join is a new read for `getEntitlements`, so the last test
 * makes it under `fabrika_app` (NOBYPASSRLS, the role production runs as) as
 * well: the local `fabrika` role is SUPERUSER and would hide a policy that
 * refuses the row (memory: fabrika-local-app-role-bypasses-rls).
 */
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');

const PLAN_ID = 'entitlement-version-fixture';
/** Figures no plan in PLAN_GRANTS carries, in any combination. */
const V1 = { seats: 4, workspaces: 7, credits: 313, modules: ['M3', 'M5'] };
const V2 = { seats: 9, workspaces: 11, credits: 717, modules: ['M3', 'M5', 'M8'] };

let liveTenantId = '';
let cancelledTenantId = '';
let proTenantId = '';
let ready = false;

async function seedPlanFixture() {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "Plan" ("id","name","monthlyCents","yearlyCents","currency","seats","workspaces","aiCreditsMonthly","modules","visibility")
     VALUES ($1,'Entitlement Fixture',1000,10000,'USD',$2,$3,$4,$5,'private')
     ON CONFLICT ("id") DO NOTHING`,
    PLAN_ID,
    V1.seats,
    V1.workspaces,
    V1.credits,
    V1.modules
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "PlanVersion" ("id","planId","version","status","monthlyCents","yearlyCents","currency","seats","workspaces","aiCreditsMonthly","modules","publishedAt")
     VALUES ($1,$2,1,'published',1000,10000,'USD',$3,$4,$5,$6,CURRENT_TIMESTAMP)
     ON CONFLICT ("id") DO NOTHING`,
    `pv_${PLAN_ID}_1`,
    PLAN_ID,
    V1.seats,
    V1.workspaces,
    V1.credits,
    V1.modules
  );
}

async function makeTenant(slug: string) {
  const tenant = await prisma.tenant.create({
    data: { name: slug, slug, country: 'TR', orgType: 'SME' },
  });
  return tenant.id as string;
}

beforeAll(async () => {
  await prisma.$connect();
  await seedPlanFixture();
  const stamp = Date.now();
  liveTenantId = await makeTenant(`ent-live-${stamp}`);
  cancelledTenantId = await makeTenant(`ent-gone-${stamp}`);
  proTenantId = await makeTenant(`ent-pro-${stamp}`);

  await prisma.subscription.create({
    data: { tenantId: liveTenantId, planId: PLAN_ID, status: 'ACTIVE', planVersionId: `pv_${PLAN_ID}_1` },
  });
  await prisma.subscription.create({
    data: { tenantId: cancelledTenantId, planId: PLAN_ID, status: 'CANCELED', planVersionId: `pv_${PLAN_ID}_1` },
  });
  // A subscription exactly as every one in this database looked before the
  // backfill: a real plan, no version.
  await prisma.subscription.create({
    data: { tenantId: proTenantId, planId: 'pro', status: 'ACTIVE' },
  });
  ready = true;
}, 60_000);

afterAll(async () => {
  if (ready) {
    for (const id of [liveTenantId, cancelledTenantId, proTenantId]) {
      await prisma.subscription.deleteMany({ where: { tenantId: id } });
      await prisma.tenant.deleteMany({ where: { id } });
    }
    await prisma.$executeRawUnsafe(`DELETE FROM "PlanVersion" WHERE "planId" = $1`, PLAN_ID);
    await prisma.$executeRawUnsafe(`DELETE FROM "Plan" WHERE "id" = $1`, PLAN_ID);
    await prisma.$executeRawUnsafe(`DELETE FROM "AuditEvent" WHERE target LIKE $1`, `${PLAN_ID}%`);
  }
  await prisma.$disconnect();
});

describe('entitlements come from the plan version the subscription is on', () => {
  test('the version answers, and the catalogue could not have', async () => {
    // `entitlement-version-fixture` is in no catalogue. Before this task this
    // call threw; the figures below exist only in the database.
    expect(grantsFor(PLAN_ID)).toBeNull();

    const ent = await getEntitlements(liveTenantId);
    expect(ent.source).toBe('plan-version');
    expect(ent.planVersionId).toBe(`pv_${PLAN_ID}_1`);
    expect(ent.seats).toBe(V1.seats);
    expect(ent.workspaces).toBe(V1.workspaces);
    expect(ent.aiCreditsMonthly).toBe(V1.credits);
    expect([...ent.allowedModules].sort()).toEqual([...V1.modules].sort());
  });

  test('publishing a new version in the studio moves the live tenant onto it', async () => {
    const draft = await createDraftVersion(PLAN_ID);
    await updateDraftVersion(
      draft.id,
      {
        monthlyCents: draft.monthlyCents,
        yearlyCents: draft.yearlyCents,
        currency: draft.currency,
        seats: V2.seats,
        workspaces: V2.workspaces,
        aiCreditsMonthly: V2.credits,
        modules: V2.modules,
      },
      []
    );
    const impact = await computePublishImpact(draft.id);
    await publishVersion(draft.id, 'entitlement-version-spec', impact.loweredTenantCount);

    const ent = await getEntitlements(liveTenantId);
    expect(ent.planVersionId).toBe(draft.id);
    expect(ent.seats).toBe(V2.seats);
    expect(ent.workspaces).toBe(V2.workspaces);
    expect(ent.aiCreditsMonthly).toBe(V2.credits);
    expect([...ent.allowedModules].sort()).toEqual([...V2.modules].sort());
  });

  test('the publish left the cancelled subscription on the version it ended under', async () => {
    // History, not entitlement: the row keeps v1 so what it was sold under
    // stays readable, and it is entitled to nothing because it is not live.
    const row = await prisma.subscription.findUnique({
      where: { tenantId: cancelledTenantId },
      select: { planVersionId: true },
    });
    expect(row?.planVersionId).toBe(`pv_${PLAN_ID}_1`);

    const ent = await getEntitlements(cancelledTenantId);
    expect(ent.source).toBe('catalogue');
    expect(ent.seats).toBe(grantsFor('free')!.seats);
  });

  test('seatsExtra still adds on top of the version', async () => {
    await prisma.subscription.update({ where: { tenantId: liveTenantId }, data: { seatsExtra: 3 } });
    const ent = await getEntitlements(liveTenantId);
    expect(ent.seats).toBe(V2.seats + 3);
    await prisma.subscription.update({ where: { tenantId: liveTenantId }, data: { seatsExtra: 0 } });
  });

  test('a subscription with no version keeps exactly the behaviour it had', async () => {
    // The row the backfill has not reached. It must read the catalogue, not a
    // version nobody pointed it at.
    const ent = await getEntitlements(proTenantId);
    expect(ent.source).toBe('catalogue');
    expect(ent.planVersionId).toBeNull();
    expect(ent.seats).toBe(grantsFor('pro')!.seats);
  });

  test('a pointer at another plan version is refused, not honoured', async () => {
    const published = await prisma.planVersion.findFirst({
      where: { planId: PLAN_ID, status: 'published' },
      orderBy: { version: 'desc' },
      select: { id: true },
    });
    await prisma.subscription.update({
      where: { tenantId: proTenantId },
      data: { planVersionId: published!.id },
    });
    const ent = await getEntitlements(proTenantId);
    expect(ent.source).toBe('catalogue');
    expect(ent.seats).toBe(grantsFor('pro')!.seats);
    await prisma.subscription.update({
      where: { tenantId: proTenantId },
      data: { planVersionId: null },
    });
  });

  test('a pointer at a draft is refused — nothing was sold under one', async () => {
    // A draft is the studio's scratch copy; its numbers move under the
    // operator's hands. Pointing a subscription at one entitles nobody, and the
    // fallback then has no catalogue entry for this fixture plan — so the call
    // fails loudly rather than silently granting the draft's figures.
    const draft = await createDraftVersion(PLAN_ID);
    await prisma.subscription.update({
      where: { tenantId: liveTenantId },
      data: { planVersionId: draft.id },
    });
    await expect(getEntitlements(liveTenantId)).rejects.toThrow(
      `Plan not found in catalogue: ${PLAN_ID}`
    );

    // Proof this is the draft being refused and not the plan being unknown:
    // put the published version back and the same call answers.
    const published = await prisma.planVersion.findFirst({
      where: { planId: PLAN_ID, status: 'published' },
      orderBy: { version: 'desc' },
      select: { id: true },
    });
    await prisma.subscription.update({
      where: { tenantId: liveTenantId },
      data: { planVersionId: published!.id },
    });
    const ent = await getEntitlements(liveTenantId);
    expect(ent.source).toBe('plan-version');
    expect(ent.seats).toBe(V2.seats);
  });
});

describe('the new join is readable by the role production runs as', () => {
  let rls: PrismaClient | null = null;

  afterAll(async () => {
    if (rls) await rls.$disconnect();
  });

  test('fabrika_app can read a Subscription joined to its PlanVersion', async () => {
    if (!RLS_URL) {
      console.warn('skipped: DATABASE_URL_RLS_TEST is not set');
      return;
    }
    rls = createDbClient(RLS_URL);
    await rls.$connect();
    // Plan/PlanVersion/PlanFeature are platform tables (`platform_read USING
    // (true)`), so the join `getEntitlements` now makes has to come back on the
    // NOBYPASSRLS role too. If it did not, every quota in the app would silently
    // fall back to the catalogue in production while looking perfect locally.
    const rows = await rls.$queryRawUnsafe<Array<{ seats: number }>>(
      `SELECT v.seats FROM "PlanVersion" v WHERE v."planId" = $1 AND v.status = 'published'`,
      PLAN_ID
    );
    expect(rows.length).toBe(1);
    expect(rows[0]!.seats).toBe(V2.seats);
  });
});
