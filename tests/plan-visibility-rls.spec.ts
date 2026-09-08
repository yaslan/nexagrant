import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createDbClient, prisma, withTenantOn } from '../src/lib/db';
import { envValue } from './helpers/dotenv';

/**
 * TASK-MTRJ32BZBY2AI — a private plan must reach the tenant it was assigned to,
 * and nobody else.
 *
 * The reason this suite exists separately from the repository's own tests: those
 * run on the default `fabrika` role, which is SUPERUSER and therefore exempt
 * from every policy. Measured on 2026-09-08, `plansVisibleToTenant` read
 * PlanAssignment on the bare singleton; on that role it looked perfect, and on
 * the app role `fabrika_app` (NOBYPASSRLS — what production runs as) the
 * assignment read returned zero rows and the tenant's own private plan
 * disappeared. `where: { tenantId }` does not survive a policy that compares
 * tenantId against an unset `app.tenant_id`.
 *
 * So the real function is imported against a client bound to the NOBYPASSRLS
 * role. Take the `withTenant` wrapper back out of the repository and the first
 * assertion below goes red.
 */
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');

const PLAN_ID = 'rls-private-plan-fixture';
const VERSION_ID = 'pv_rls_private_fixture_1';

describe('private plan visibility under the role that enforces RLS', () => {
  let rls: PrismaClient;
  let tenantA_Id: string;
  let tenantB_Id: string;
  let plansVisibleToTenant: (tenantId: string) => Promise<Array<{ plan: { id: string } }>>;
  let ready = false;

  beforeAll(async () => {
    if (!RLS_URL) {
      console.warn('private plan RLS test skipped: DATABASE_URL_RLS_TEST is not set.');
      return;
    }
    try {
      await prisma.$connect();
      rls = createDbClient(RLS_URL);
      await rls.$connect();

      const stamp = Date.now();
      const a = await prisma.tenant.create({
        data: { name: 'Plan Tenant A', slug: `plan-a-${stamp}`, country: 'TR', orgType: 'SME' },
      });
      const b = await prisma.tenant.create({
        data: { name: 'Plan Tenant B', slug: `plan-b-${stamp}`, country: 'TR', orgType: 'SME' },
      });
      tenantA_Id = a.id;
      tenantB_Id = b.id;

      // Platform rows: written with the privileged client, as the platform does.
      await prisma.$executeRawUnsafe(
        `INSERT INTO "Plan" ("id","name","monthlyCents","yearlyCents","currency","seats","workspaces","aiCreditsMonthly","modules","visibility")
         VALUES ($1,'RLS Private Fixture',9900,99000,'USD',9,4,900,'{M1}','private')
         ON CONFLICT ("id") DO UPDATE SET "visibility" = 'private'`,
        PLAN_ID
      );
      await prisma.$executeRawUnsafe(
        `INSERT INTO "PlanVersion" ("id","planId","version","status","monthlyCents","yearlyCents","currency","seats","workspaces","aiCreditsMonthly","modules","publishedAt")
         VALUES ($1,$2,1,'published',9900,99000,'USD',9,4,900,'{M1}',CURRENT_TIMESTAMP)
         ON CONFLICT ("id") DO NOTHING`,
        VERSION_ID,
        PLAN_ID
      );
      await prisma.$executeRawUnsafe(
        `INSERT INTO "PlanAssignment" ("id","planId","tenantId","assignedBy","updatedAt")
         VALUES ($1,$2,$3,'rls-fixture',CURRENT_TIMESTAMP)`,
        `pa_rls_${stamp}`,
        PLAN_ID,
        tenantA_Id
      );

      // The real repository, over a client that is subject to the policies.
      vi.resetModules();
      vi.doMock('@/lib/db', () => ({
        prisma: rls,
        withTenant: <T,>(tenantId: string, cb: (tx: unknown) => Promise<T>) =>
          withTenantOn(rls, tenantId, cb as never),
        withTenantOn,
        createDbClient,
      }));
      ({ plansVisibleToTenant } = await import('@/lib/billing/plan-repository'));
      ready = true;
    } catch (e) {
      console.warn(
        `private plan RLS test skipped: ${e instanceof Error ? e.message : String(e)}`
      );
      ready = false;
    }
  });

  afterAll(async () => {
    try {
      await prisma.$executeRawUnsafe(`DELETE FROM "PlanAssignment" WHERE "planId" = $1`, PLAN_ID);
      await prisma.$executeRawUnsafe(`DELETE FROM "PlanVersion" WHERE "planId" = $1`, PLAN_ID);
      await prisma.$executeRawUnsafe(`DELETE FROM "Plan" WHERE "id" = $1`, PLAN_ID);
      if (tenantA_Id && tenantB_Id) {
        await prisma.tenant.deleteMany({ where: { id: { in: [tenantA_Id, tenantB_Id] } } });
      }
    } catch {
      // ignore cleanup error
    }
    vi.doUnmock('@/lib/db');
    vi.resetModules();
    await rls?.$disconnect().catch(() => {});
    await prisma.$disconnect().catch(() => {});
  });

  test('the connection under test is genuinely subject to RLS', async (ctx) => {
    if (!ready) return ctx.skip();
    const [role] = await rls.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
      SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user
    `;
    expect(role!.rolsuper).toBe(false);
    expect(role!.rolbypassrls).toBe(false);
  });

  test('the assigned tenant still sees its private plan', async (ctx) => {
    if (!ready) return ctx.skip();
    const visible = await plansVisibleToTenant(tenantA_Id);
    expect(visible.map((row) => row.plan.id)).toContain(PLAN_ID);
  });

  test('a tenant it was not assigned to does not see it', async (ctx) => {
    if (!ready) return ctx.skip();
    const visible = await plansVisibleToTenant(tenantB_Id);
    expect(visible.map((row) => row.plan.id)).not.toContain(PLAN_ID);
    // Not vacuous: B still sees the public catalogue.
    expect(visible.length).toBeGreaterThan(0);
  });

  test('the assignment row itself never crosses the tenant boundary', async (ctx) => {
    if (!ready) return ctx.skip();
    await withTenantOn(rls, tenantA_Id, async (tx) => {
      expect(await tx.planAssignment.findMany()).toHaveLength(1);
    });
    await withTenantOn(rls, tenantB_Id, async (tx) => {
      expect(await tx.planAssignment.findMany()).toHaveLength(0);
      expect(await tx.planAssignment.findMany({ where: { planId: PLAN_ID } })).toHaveLength(0);
    });
  });

  test('a tenant connection cannot write the platform catalogue', async (ctx) => {
    if (!ready) return ctx.skip();
    // platform_no_insert is WITH CHECK (false): the catalogue is the platform's.
    await expect(
      withTenantOn(rls, tenantB_Id, (tx) =>
        tx.$executeRawUnsafe(
          `INSERT INTO "Plan" ("id","name","monthlyCents","yearlyCents","currency","seats","workspaces","aiCreditsMonthly","modules")
           VALUES ('rls-smuggled-plan','Smuggled',1,1,'USD',1,1,1,'{}')`
        )
      )
    ).rejects.toThrow(/row-level security/i);

    // platform_no_update is USING (false): the row is not even visible to UPDATE,
    // so the statement succeeds against zero rows rather than raising.
    const changed = await withTenantOn(rls, tenantB_Id, (tx) =>
      tx.$executeRawUnsafe(`UPDATE "PlanVersion" SET "seats" = 999 WHERE "id" = $1`, VERSION_ID)
    );
    expect(changed).toBe(0);
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT "seats" FROM "PlanVersion" WHERE "id" = $1`,
      VERSION_ID
    )) as Array<{ seats: number }>;
    expect(rows[0]!.seats).toBe(9);
  });
});
