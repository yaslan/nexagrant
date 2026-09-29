import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { PrismaClient } from '@prisma/client';

import { createDbClient, withTenantOn } from '@/lib/db';
import { getWeeklyActiveUsersIn } from '@/lib/metrics/weekly-active-users';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { requireId } from './helpers/teardown-guard';

/**
 * TASK-MULRS12Y8F087 — the Ö1 weekly-active-user count against Postgres.
 *
 * Fixture: two members × two weeks, written through the privileged handle so
 * the expectation is built independently of the code under test. Read back
 * through the NOBYPASSRLS role (`DATABASE_URL_RLS_TEST`) inside `withTenantOn`,
 * which is how the app itself reads it.
 *
 *   week 1 (Mon 2026-09-14): user A writes a concept note and uses AI; user B
 *                            takes a gate decision            → 2
 *   week 2 (Mon 2026-09-21): user A saves a search, twice    → 1 (distinct)
 *   week 3 (Mon 2026-09-28): nothing                          → 0
 *
 * The negative arms carry the weight:
 *   • a platform admin with no membership writes an AuditEvent in the tenant
 *     in week 2 — must not count (the Membership join);
 *   • tenant B's member writes in week 2 — must not leak into A (RLS + WHERE);
 *   • the SAME read without the tenant bound returns nothing, so the numbers
 *     above are not RLS being inert.
 */

const SUITE = 'weekly-active-users live test';
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');
const RUN = `wau-${Date.now().toString(36)}`;
const NOW = new Date('2026-09-29T09:00:00Z');

let rls: PrismaClient | undefined;
let admin: PrismaClient | undefined;
let ready = false;
const ids = { tenantA: '', tenantB: '', userA: '', userB: '', userOther: '', platformAdmin: '' };

/** Turkey-time wall clock → the UTC instant Prisma stores. */
const tr = (local: string) => new Date(`${local}+03:00`);

beforeAll(async () => {
  if (!requireRlsTestUrl(RLS_URL, SUITE) || !ADMIN_URL) return;
  rls = createDbClient(RLS_URL!);
  admin = createDbClient(ADMIN_URL);
  const reachable = await rls.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
  if (!reachable) {
    skipOrFailInCi(SUITE, 'Postgres is unreachable (`docker compose up -d`)');
    return;
  }
  await assertRlsSubjectRole(rls, SUITE);

  const tenant = (suffix: string) =>
    admin!.tenant.create({ data: { name: `${RUN} ${suffix}`, slug: `${RUN}-${suffix}`, country: 'TR' } });
  const user = (suffix: string, isPlatformAdmin = false) =>
    admin!.user.create({ data: { email: `${RUN}-${suffix}@example.test`, isPlatformAdmin } });

  ids.tenantA = (await tenant('a')).id;
  ids.tenantB = (await tenant('b')).id;
  ids.userA = (await user('a')).id;
  ids.userB = (await user('b')).id;
  ids.userOther = (await user('other')).id;
  ids.platformAdmin = (await user('padmin', true)).id;

  await withTenantOn(admin, ids.tenantA, async (tx) => {
    await tx.membership.createMany({
      data: [
        { tenantId: ids.tenantA, userId: ids.userA, role: 'WRITER', workspaceIds: [] },
        { tenantId: ids.tenantA, userId: ids.userB, role: 'PIPELINE_MANAGER', workspaceIds: [] },
      ],
    });
    // Week 1.
    await tx.conceptNote.create({
      data: { tenantId: ids.tenantA, opportunityId: `${RUN}-opp`, templateId: `${RUN}-tpl`, content: {}, createdBy: ids.userA, createdAt: tr('2026-09-14T00:10:00') },
    });
    await tx.aiUsageLog.create({
      data: { tenantId: ids.tenantA, userId: ids.userA, module: 'm2', purpose: 'draft', provider: 'test', model: 'test', promptHash: RUN, inputTokens: 1, outputTokens: 1, credits: 0, createdAt: tr('2026-09-16T12:00:00') },
    });
    // GateDecision needs a real opportunity; the workspace comes with it.
    const ws = await tx.workspace.create({ data: { tenantId: ids.tenantA, name: RUN, slug: RUN } });
    const opp = await tx.opportunity.create({ data: { tenantId: ids.tenantA, workspaceId: ws.id, title: RUN } });
    await tx.gateDecision.create({
      data: { tenantId: ids.tenantA, opportunityId: opp.id, gate: 'G0', passed: true, inputs: {}, ruleVersion: 'test', decidedBy: ids.userB, decidedAt: tr('2026-09-20T23:59:00') },
    });
    // Week 2: two writes by the same user count once.
    await tx.savedSearch.createMany({
      data: [
        { tenantId: ids.tenantA, userId: ids.userA, name: `${RUN}-1`, filters: {}, createdAt: tr('2026-09-21T00:00:00') },
        { tenantId: ids.tenantA, userId: ids.userA, name: `${RUN}-2`, filters: {}, createdAt: tr('2026-09-25T18:00:00') },
      ],
    });
    // Week 2, negative: a platform admin acting in the tenant is not its user.
    await tx.auditEvent.create({
      data: { tenantId: ids.tenantA, actorId: ids.platformAdmin, type: 'module.state.changed', createdAt: tr('2026-09-22T10:00:00') },
    });
  });

  // Week 2, negative: another tenant's member.
  await withTenantOn(admin, ids.tenantB, async (tx) => {
    await tx.membership.create({ data: { tenantId: ids.tenantB, userId: ids.userOther, role: 'WRITER', workspaceIds: [] } });
    await tx.savedSearch.create({
      data: { tenantId: ids.tenantB, userId: ids.userOther, name: RUN, filters: {}, createdAt: tr('2026-09-23T10:00:00') },
    });
  });

  ready = true;
});

afterAll(async () => {
  if (admin && ids.tenantA) {
    // Tenant cascades take memberships, workspaces, opportunities, gate
    // decisions and audit events; the tables without a Tenant relation go by hand.
    for (const t of [ids.tenantA, ids.tenantB]) {
      await withTenantOn(admin, t, async (tx) => {
        await tx.conceptNote.deleteMany({ where: { tenantId: requireId(t, 't') } });
        await tx.aiUsageLog.deleteMany({ where: { tenantId: requireId(t, 't') } });
        await tx.savedSearch.deleteMany({ where: { tenantId: requireId(t, 't') } });
      });
    }
    await admin.tenant.deleteMany({ where: { id: { in: [ids.tenantA, ids.tenantB] } } });
    await admin.user.deleteMany({ where: { email: { startsWith: `${RUN}-` } } });
  }
  await rls?.$disconnect();
  await admin?.$disconnect();
});

describe('getWeeklyActiveUsers against a live database', () => {
  test('two members over two weeks, counted per week under RLS', async (ctx) => {
    if (!ready) ctx.skip();
    const out = await withTenantOn(rls!, ids.tenantA, (tx) => getWeeklyActiveUsersIn(tx, ids.tenantA, 3, NOW));
    expect(out).toEqual([
      { weekStart: '2026-09-14', activeUsers: 2 },
      { weekStart: '2026-09-21', activeUsers: 1 },
      { weekStart: '2026-09-28', activeUsers: 0 },
    ]);
  });

  test("tenant B sees only its own member, not A's", async (ctx) => {
    if (!ready) ctx.skip();
    const out = await withTenantOn(rls!, ids.tenantB, (tx) => getWeeklyActiveUsersIn(tx, ids.tenantB, 3, NOW));
    expect(out.map((w) => w.activeUsers)).toEqual([0, 1, 0]);
  });

  test("bound to tenant B, a query for tenant A's id returns nothing: RLS, not only the WHERE", async (ctx) => {
    if (!ready) ctx.skip();
    const out = await withTenantOn(rls!, ids.tenantB, (tx) => getWeeklyActiveUsersIn(tx, ids.tenantA, 3, NOW));
    expect(out.map((w) => w.activeUsers)).toEqual([0, 0, 0]);
  });
});
