import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * FA-49 (TASK-MVFMK08Z447OR) — three FA-47 call sites that read RLS-scoped rows
 * with no scope at all, measured under `fabrika_app` (NOBYPASSRLS):
 *
 *   admin/tenants/page.tsx    _count of Membership/Workspace  → withSystemScope('platform-admin')
 *   settings/billing/page.tsx getEntitlements(tenantId)        → withTenant(tenantId); client now required
 *   plan-repository.ts        listPlansForAdmin assignments    → withSystemScope('platform-admin')
 *
 * Unscoped, every one of them reads back zero rows WITHOUT an error: the
 * tenant list shows 0 members, a paying tenant is entitled from the free
 * fallback, and a private plan lists no tenants. Each arm below pairs the
 * unscoped read (the negative, which proves the policy is live) with the
 * shipped call.
 *
 * Same wiring as billing-k1-tenant-scope.live.test.ts: `@/lib/db`'s singleton
 * is pointed at the RLS role before it loads; fixtures go through the owner.
 */
const { rlsUrl: RLS_URL, ownerUrl: OWNER_URL } = await vi.hoisted(async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const path = resolve(process.cwd(), '.env');
  const read = (key: string): string | undefined => {
    if (!existsSync(path)) return undefined;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const t = line.trim();
      const i = t.indexOf('=');
      if (i > 0 && t.slice(0, i) === key) {
        const v = t.slice(i + 1).replace(/^["']|["']$/g, '');
        return v || undefined;
      }
    }
    return undefined;
  };
  const ownerUrl = process.env.DATABASE_URL ?? read('DATABASE_URL');
  const rlsUrl = process.env.DATABASE_URL_RLS_TEST ?? read('DATABASE_URL_RLS_TEST');
  if (rlsUrl) process.env.DATABASE_URL = rlsUrl;
  return { rlsUrl, ownerUrl };
});

import { createDbClient, prisma, withTenant, withTenantOn } from '@/lib/db';
import { getEntitlements } from '@/lib/billing';
import { FALLBACK_PLAN_ID, grantsFor } from '@/lib/billing/catalog';
import { listPlansForAdmin } from '@/lib/billing/plan-repository';
import AdminTenantsPage from '@/app/[locale]/admin/tenants/page';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';

const admin = createDbClient(OWNER_URL ?? 'postgresql://fabrika:fabrika@localhost:5432/fabrika');

const SUITE = 'FA-49 admin/billing scope test';

const HAS_DB =
  requireRlsTestUrl(RLS_URL, SUITE) !== undefined &&
  (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));

if (RLS_URL && !HAS_DB) skipOrFailInCi(SUITE, 'Postgres is unreachable (`docker compose up -d`)');

if (HAS_DB) await assertRlsSubjectRole(prisma, SUITE);

const RUN = `fa49-${Date.now()}-${process.pid}`;
const TENANT = `t-${RUN}`;
const USER = `u-${RUN}`;
const PLAN = `plan-${RUN}`;

async function wipe(): Promise<void> {
  await admin.planAssignment.deleteMany({ where: { planId: PLAN } });
  await admin.plan.deleteMany({ where: { id: PLAN } });
  // Membership, Workspace, Subscription go with the tenant (onDelete: Cascade).
  await admin.tenant.deleteMany({ where: { id: TENANT } });
  await admin.user.deleteMany({ where: { id: USER } });
}

beforeAll(async () => {
  if (!HAS_DB) return;
  await wipe();
  await admin.tenant.create({ data: { id: TENANT, name: `FA49 probe ${RUN}`, slug: TENANT, country: 'TR' } });
  await admin.user.create({ data: { id: USER, email: `${RUN}@example.test` } });
  await admin.membership.create({ data: { tenantId: TENANT, userId: USER } });
  await admin.workspace.create({ data: { tenantId: TENANT, name: 'FA49', slug: `ws-${RUN}` } });
  await admin.subscription.create({ data: { tenantId: TENANT, planId: 'pro', status: 'ACTIVE' } });
  await admin.plan.create({
    data: {
      id: PLAN, name: `FA49 ${RUN}`, monthlyCents: 0, yearlyCents: 0,
      seats: 1, workspaces: 1, aiCreditsMonthly: 0, modules: [], visibility: 'private',
    },
  });
  await admin.planAssignment.create({ data: { planId: PLAN, tenantId: TENANT } });
});

afterAll(async () => {
  if (!HAS_DB) return;
  await wipe();
  await admin.$disconnect();
});

describe.skipIf(!HAS_DB)('FA-49 call sites under fabrika_app', () => {
  test('admin/tenants renders the member and workspace counts', async () => {
    const unscoped = await prisma.tenant.findUnique({
      where: { id: TENANT },
      include: { _count: { select: { users: true, workspaces: true } } },
    });
    expect(unscoped?._count).toEqual({ users: 0, workspaces: 0 });

    const html = renderToStaticMarkup(await AdminTenantsPage());
    const row = html.split('<tr').find((r) => r.includes(`>${TENANT}<`));
    expect(row).toBeDefined();
    const counts = [...row!.matchAll(/text-center font-bold">(\d+)</g)].map((m) => Number(m[1]));
    expect(counts).toEqual([1, 1]);
  });

  test('billing entitlements come from the tenant’s live subscription', async () => {
    // The owner role is BYPASSRLS: what the tenant is really entitled to.
    const truth = await withTenantOn(admin, TENANT, (tx) => getEntitlements(TENANT, tx));
    // The read getEntitlements used to fall back to: no subscription at all.
    const unscoped = await prisma.tenant.findUnique({ where: { id: TENANT }, include: { subscription: true } });
    expect(unscoped?.subscription).toBeNull();
    // Without it the tenant was entitled from the fallback plan, not the one it pays for.
    expect(truth.seats).not.toBe(grantsFor(FALLBACK_PLAN_ID)?.seats);

    const scoped = await withTenant(TENANT, (tx) => getEntitlements(TENANT, tx));
    expect(scoped).toEqual(truth);
  });

  test('listPlansForAdmin lists the tenants a private plan is assigned to', async () => {
    const unscoped = await prisma.plan.findUnique({ where: { id: PLAN }, include: { assignments: true } });
    expect(unscoped?.assignments).toEqual([]);

    const plan = (await listPlansForAdmin()).find((p) => p.id === PLAN);
    expect(plan?.assignments.map((a) => a.tenantId)).toEqual([TENANT]);
  });
});
