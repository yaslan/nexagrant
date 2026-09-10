import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createDbClient, withTenantOn } from '@/lib/db';
import { envValue } from './helpers/dotenv';

/**
 * TASK-MTVR9T834EPUC — slice 2 of the tenant-bypass inventory
 * (TASK-MTSZ0AL4QP2CT §3.8 bucket H, §5 slice 2): the workspace / pipeline /
 * dashboard surface, where `tenantId` was already in the `where` clause and the
 * only thing missing was the `withTenant` wrapper.
 *
 * Why a hand-written `where: { tenantId }` is not the thing under test.
 * ---------------------------------------------------------------------
 * A test that seeds two tenants, calls the loader as tenant A over the `prisma`
 * singleton and asserts B's rows are absent passes **both before and after**
 * this slice — the `where` clause already excluded them. It would be a green
 * that measures nothing, which is precisely how these calls stayed unwrapped
 * through an audit.
 *
 * What the wrapper actually buys is the other half of the guarantee: the
 * `set_config('app.tenant_id', …)` that makes Postgres' own `tenant_isolation`
 * policies apply. Locally the `prisma` singleton is the `fabrika` role —
 * SUPERUSER, BYPASSRLS — so RLS is inert on it and *any* shape looks correct.
 * So every assertion in this file runs over DATABASE_URL_RLS_TEST (role
 * `fabrika_app`, NOBYPASSRLS): the same role `pnpm rls:verify` measures with,
 * and the shape the application is meant to run as.
 *
 * Over that role the test is genuinely red-first, and in the *positive*
 * direction: unwrapped code opens no tenant scope, so `app.tenant_id` is unset,
 * so the policies match nothing and the loader returns **zero of its own
 * tenant's rows**. The dashboard reads empty and the write is refused outright
 * (SQLSTATE 42501). Recorded red before the change, green after — see the task
 * report §2.1.
 *
 * The cross-tenant arm is the counterfactual: without it, a loader that simply
 * returned nothing at all would satisfy every "B is absent" assertion here.
 *
 * `.live` because it needs the Postgres in docker-compose plus the app role;
 * the file skips itself when either is missing rather than reddening the gate
 * on a machine that has no database to measure.
 */

const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');

/**
 * Fixtures are written and verified over their own privileged connection, never
 * over the module-level `prisma` — this file mocks `@/lib/db`, so an import of
 * that singleton here would resolve to the RLS-subject client and the seeds
 * themselves would be refused by the very policies under test.
 */
const admin: PrismaClient | undefined = ADMIN_URL ? createDbClient(ADMIN_URL) : undefined;

const dbReachable =
  RLS_URL !== undefined &&
  admin !== undefined &&
  (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));

if (!dbReachable) {
  console.warn(
    'pipeline-surface tenant-scope test skipped: needs Postgres and ' +
      'DATABASE_URL_RLS_TEST (`docker compose up -d` then `pnpm db:rls-role`).'
  );
}

/**
 * The RLS-subject client every call under test runs over.
 *
 * Held in a `vi.hoisted` box because `vi.mock` is lifted above every `const` in
 * the file; the factory below reads the box lazily, after it is filled.
 */
const box = vi.hoisted(() => ({ client: undefined as PrismaClient | undefined }));
const rls: PrismaClient | undefined = dbReachable ? createDbClient(RLS_URL!) : undefined;
box.client = rls;

/** Privileged handle, for seeding and for reading rows back past the policies. */
const db = (): PrismaClient => admin!;

/**
 * `@/lib/db` rebound so the modules under test reach Postgres as `fabrika_app`
 * instead of as the BYPASSRLS singleton — the injection point these files do
 * not otherwise have, since they import `prisma` and `withTenant` directly.
 *
 * Both exports are redirected, and that pairing is the whole measurement: code
 * that still calls `prisma.…` lands on an unscoped RLS connection (red), code
 * that calls `withTenant` opens a real scope on the same connection (green).
 */
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    get prisma() {
      return box.client ?? actual.prisma;
    },
    withTenant: <T>(tenantId: string, cb: (tx: never) => Promise<T>): Promise<T> =>
      withTenantOn(box.client ?? actual.prisma, tenantId, cb as never),
  };
});

const { fetchDashboardMetrics } = await import('@/lib/dashboard/fetch-metrics');
const { submitFeedback } = await import('@/lib/feedback/submit');

/** Every row this file creates carries it, so cleanup can never over-reach. */
const RUN = `tvr9t8-${Date.now()}`;

interface Fixture {
  tenantId: string;
  workspaceId: string;
  opportunityId: string;
}

/** Fixtures are written with the privileged singleton; only the code under test uses `rls`. */
async function makeTenant(label: string): Promise<Fixture> {
  const tenant = await db().tenant.create({
    data: { name: `Tenant ${label} ${RUN}`, slug: `${RUN}-${label}`, country: 'TR', orgType: 'SME' },
  });
  const workspace = await db().workspace.create({
    data: { tenantId: tenant.id, name: `WS ${label}`, slug: `${RUN}-${label}-ws` },
  });
  const opportunity = await db().opportunity.create({
    data: {
      tenantId: tenant.id,
      workspaceId: workspace.id,
      title: `Opp ${label} ${RUN}`,
      stage: 'G2',
      status: 'ACTIVE',
      g0Score: label === 'a' ? 80 : 20,
    },
  });
  await db().moduleState.create({
    data: { tenantId: tenant.id, moduleId: `m-${label}-${RUN}`.slice(0, 40), status: 'ON' },
  });
  return { tenantId: tenant.id, workspaceId: workspace.id, opportunityId: opportunity.id };
}

describe.skipIf(!dbReachable)('workspace/pipeline/dashboard surface over the RLS role', () => {
  let a: Fixture;
  let b: Fixture;

  beforeAll(async () => {
    a = await makeTenant('a');
    b = await makeTenant('b');
  });

  afterAll(async () => {
    await db().feedback.deleteMany({ where: { tenantId: { in: [a?.tenantId, b?.tenantId] } } });
    await db().opportunity.deleteMany({ where: { tenantId: { in: [a?.tenantId, b?.tenantId] } } });
    await db().moduleState.deleteMany({ where: { tenantId: { in: [a?.tenantId, b?.tenantId] } } });
    await db().workspace.deleteMany({ where: { tenantId: { in: [a?.tenantId, b?.tenantId] } } });
    await db().tenant.deleteMany({ where: { id: { in: [a?.tenantId, b?.tenantId] } } });
    await rls?.$disconnect();
    await admin?.$disconnect();
  });

  /**
   * Guards every other assertion in the file. A probe role that silently
   * bypassed the policies would turn all of them into false greens.
   */
  it('measures over a role the policies actually apply to', async () => {
    const rows = await rls!.$queryRaw<Array<{ bypass: boolean; who: string }>>`
      SELECT current_user AS who,
             (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass`;
    expect(rows[0]?.bypass).toBe(false);
  });

  describe('fetchDashboardMetrics', () => {
    /**
     * The red-first assertion. Unwrapped, this returns 0 — not because the
     * `where` clause is wrong but because no tenant scope was ever opened, so
     * the policy matches nothing and the tenant's own dashboard reads empty.
     */
    it('returns the calling tenant its own rows', async () => {
      const metrics = await fetchDashboardMetrics({ tenantId: a.tenantId });

      expect(metrics.totalOpps).toBe(1);
      expect(metrics.opportunities[0]?.id).toBe(a.opportunityId);
      expect(metrics.activeModules).toBe(1);
    });

    /**
     * The counterfactual. Without it, a loader that returned nothing at all
     * would satisfy the cross-tenant assertion below.
     */
    it("never shows one tenant another tenant's opportunity", async () => {
      const metrics = await fetchDashboardMetrics({ tenantId: a.tenantId });

      const ids = metrics.opportunities.map((o) => o.id);
      expect(ids).not.toContain(b.opportunityId);
      expect(metrics.avgIsabet).toBe(80);
    });
  });

  describe('submitFeedback', () => {
    /**
     * The write half. `Feedback.tenant_isolation` carries WITH CHECK as well as
     * USING, so an insert with no scope open is refused by Postgres (42501)
     * rather than misfiled — unwrapped, this rejects instead of returning an id.
     */
    it('persists a report under the reporting tenant and stamps it back', async () => {
      const result = await submitFeedback({
        tenantId: a.tenantId,
        category: 'BUG',
        impact: 'MINOR',
        title: `probe ${RUN}`,
        body: 'tenant scope probe',
      });

      expect(result.id).toBeTruthy();

      // Asked of the database, past the model layer and past the return value:
      // the row exists, and it is filed under A rather than under nobody.
      const rows = await db().$queryRaw<Array<{ tenantId: string; alertStatus: string | null }>>`
        SELECT "tenantId", "alertStatus" FROM "Feedback" WHERE id = ${result.id}`;
      expect(rows).toHaveLength(1);
      expect(rows[0]?.tenantId).toBe(a.tenantId);
      // The stamp-back at submit.ts:190 is the second wrapped call; a null here
      // means that update never landed.
      expect(rows[0]?.alertStatus).not.toBeNull();
    });

    it("does not let a report land in another tenant's ledger", async () => {
      const before = await db().feedback.count({ where: { tenantId: b.tenantId } });

      await submitFeedback({
        tenantId: a.tenantId,
        category: 'BUG',
        impact: 'MINOR',
        title: `probe-b ${RUN}`,
        body: 'tenant scope probe',
      });

      expect(await db().feedback.count({ where: { tenantId: b.tenantId } })).toBe(before);
    });
  });
});
