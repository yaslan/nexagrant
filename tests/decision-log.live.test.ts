import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { presentIds, requireId } from './helpers/teardown-guard';

/**
 * NG-38 — the withdrawal and the project idea on a real database, over `fabrika_app`
 * (NOBYPASSRLS, asserted). Nothing is mocked but the routing of `withTenant` to that client.
 *
 *  - withdrawing needs a reason; without one nothing changes, neither status nor log;
 *  - a withdrawal is written once, as WITHDRAWN plus a decision_log row, and read back;
 *  - another tenant can neither withdraw, read the log nor attach a row to the opportunity
 *    (RLS for the rows, the composite foreign key for a row naming the other tenant's
 *    opportunity with its own tenantId);
 *  - a project idea is written and read back, tenant-scoped.
 *
 * `.live`: needs the docker-compose Postgres, `pnpm db:setup` and `pnpm db:rls-role`.
 */

const SUITE = 'decision-log.live';
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');
const RUN = `ng38-${Date.now().toString(36)}`;

const state = vi.hoisted(() => ({ rls: undefined as PrismaClient | undefined }));

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    withTenant: (tenantId: string, cb: Parameters<typeof actual.withTenant>[1]) =>
      actual.withTenantOn(state.rls!, tenantId, cb),
  };
});

const { createDbClient, withTenantOn } = await import('@/lib/db');
const withdrawal = await import('@/lib/k5-pipeline/withdrawal');
const ideas = await import('@/lib/project-ideas/records');

type Scope = { tenantId: string; userId: string };
type Fixture = Scope & { workspaceId: string; opportunityId: string };

let admin: PrismaClient | undefined;
let ready = false;
let skipReason = '';
const tenants: string[] = [];
const users: string[] = [];
let a: Fixture;
let b: Fixture;

async function makeFixture(key: string): Promise<Fixture> {
  const tenant = await admin!.tenant.create({
    data: { name: `${RUN} ${key}`, slug: `${RUN}-${key}`, country: 'TR', kind: 'ORGANIZATION' },
    select: { id: true },
  });
  tenants.push(tenant.id);
  const user = await admin!.user.create({ data: { email: `${RUN}-${key}@example.com`, name: key } });
  users.push(user.id);
  await admin!.membership.create({ data: { tenantId: tenant.id, userId: user.id, role: 'TENANT_OWNER' } });
  const workspace = await admin!.workspace.create({
    data: { tenantId: tenant.id, name: `${RUN} ${key}`, slug: `${RUN}-${key}` },
    select: { id: true },
  });
  const opportunity = await admin!.opportunity.create({
    data: { tenantId: tenant.id, workspaceId: workspace.id, title: `${RUN} ${key}` },
    select: { id: true },
  });
  return { tenantId: tenant.id, userId: user.id, workspaceId: workspace.id, opportunityId: opportunity.id };
}

async function newOpportunity(f: Fixture, status: 'ACTIVE' | 'FUNDED' = 'ACTIVE') {
  const opp = await admin!.opportunity.create({
    data: { tenantId: f.tenantId, workspaceId: f.workspaceId, title: `${RUN} extra`, status },
    select: { id: true },
  });
  return opp.id;
}

beforeAll(async () => {
  const rlsUrl = requireRlsTestUrl(RLS_URL, SUITE);
  if (!ADMIN_URL) skipOrFailInCi(SUITE, 'DATABASE_URL is not set');
  if (!rlsUrl || !ADMIN_URL) {
    skipReason = 'DATABASE_URL_RLS_TEST / DATABASE_URL not set. Run `pnpm db:rls-role`.';
    return;
  }
  state.rls = createDbClient(rlsUrl);
  admin = createDbClient(ADMIN_URL);
  try {
    await state.rls.$connect();
  } catch (e) {
    skipReason = `database unavailable: ${e instanceof Error ? e.message : String(e)}`;
    skipOrFailInCi(SUITE, skipReason);
    return;
  }
  await assertRlsSubjectRole(state.rls, SUITE);
  a = await makeFixture('a');
  b = await makeFixture('b');
  ready = true;
});

afterAll(async () => {
  if (admin) {
    await admin.auditEvent.deleteMany({ where: { tenantId: { in: presentIds(tenants) } } });
    await admin.workspace.deleteMany({ where: { tenantId: { in: presentIds(tenants) } } });
    await admin.tenant.deleteMany({ where: { id: { in: presentIds(tenants) } } });
    await admin.user.deleteMany({ where: { id: { in: presentIds(users) } } });
    await admin.$disconnect();
  }
  await state.rls?.$disconnect();
});

describe('withdrawal', () => {
  test('without a reason it is refused and nothing is written', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    for (const reason of ['', '   ', undefined]) {
      const result = await withdrawal.withdrawOpportunity(a, a.opportunityId, { reason } as never);
      expect(result).toEqual({ refused: 'REASON_REQUIRED' });
    }
    const opp = await admin!.opportunity.findUniqueOrThrow({ where: { id: a.opportunityId } });
    expect(opp.status).toBe('ACTIVE');
    expect(await admin!.decisionLog.count({ where: { opportunityId: a.opportunityId } })).toBe(0);
  });

  test('with a reason: WITHDRAWN and one decision_log row, read back', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    const result = await withdrawal.withdrawOpportunity(a, a.opportunityId, { reason: '  Ortak bulunamadı  ' });
    expect(result).toMatchObject({
      decision: { opportunityId: a.opportunityId, kind: 'WITHDRAW', reason: 'Ortak bulunamadı', decidedById: a.userId },
    });

    const opp = await admin!.opportunity.findUniqueOrThrow({ where: { id: a.opportunityId } });
    expect(opp.status).toBe('WITHDRAWN');

    const log = await withdrawal.listDecisions(a, a.opportunityId);
    expect(log).toHaveLength(1);
    expect(log![0]).toMatchObject({ kind: 'WITHDRAW', reason: 'Ortak bulunamadı', decidedById: a.userId });
    expect(log![0]?.decidedAt).toBeInstanceOf(Date);

    // The audit row says what happened, not why: the reason stays in decision_log.
    const audit = await admin!.auditEvent.findMany({ where: { tenantId: a.tenantId, type: 'opportunity.withdrawn' } });
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit[0])).not.toContain('Ortak bulunamadı');
  });

  test('a second withdrawal is refused and writes no second row', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    expect(await withdrawal.withdrawOpportunity(a, a.opportunityId, { reason: 'tekrar' })).toEqual({
      refused: 'ALREADY_WITHDRAWN',
    });
    expect(await admin!.decisionLog.count({ where: { opportunityId: a.opportunityId } })).toBe(1);
  });

  test('an opportunity with a result is not withdrawn', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    const funded = await newOpportunity(a, 'FUNDED');
    expect(await withdrawal.withdrawOpportunity(a, funded, { reason: 'geç kaldık' })).toEqual({
      refused: 'ALREADY_DECIDED',
    });
    expect((await admin!.opportunity.findUniqueOrThrow({ where: { id: funded } })).status).toBe('FUNDED');
    expect(await admin!.decisionLog.count({ where: { opportunityId: funded } })).toBe(0);
  });

  test('a soft-deleted opportunity answers as one that does not exist', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    const gone = await newOpportunity(a);
    await admin!.opportunity.update({ where: { id: gone }, data: { deletedAt: new Date() } });
    expect(await withdrawal.withdrawOpportunity(a, gone, { reason: 'x' })).toEqual({ refused: 'NOT_FOUND' });
  });

  test('another tenant can neither withdraw, read nor attach a row', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    const target = await newOpportunity(a);
    expect(await withdrawal.withdrawOpportunity(b, target, { reason: 'başkasının' })).toEqual({ refused: 'NOT_FOUND' });
    expect((await admin!.opportunity.findUniqueOrThrow({ where: { id: target } })).status).toBe('ACTIVE');
    expect(await withdrawal.listDecisions(b, a.opportunityId)).toBeNull();
    expect(
      await withTenantOn(state.rls!, b.tenantId, (tx) => tx.decisionLog.count({ where: { tenantId: a.tenantId } })),
    ).toBe(0);
    // RLS: a row in the other tenant's name.
    await expect(
      withTenantOn(state.rls!, b.tenantId, (tx) =>
        tx.decisionLog.create({
          data: { tenantId: a.tenantId, opportunityId: target, kind: 'WITHDRAW', reason: 'x' },
        }),
      ),
    ).rejects.toThrow(/row-level security|violates/i);
    // Composite FK: its own tenantId on the other tenant's opportunity. RLS alone lets this through.
    await expect(
      withTenantOn(state.rls!, b.tenantId, (tx) =>
        tx.decisionLog.create({
          data: { tenantId: b.tenantId, opportunityId: target, kind: 'WITHDRAW', reason: 'x' },
        }),
      ),
    ).rejects.toThrow(/foreign key|violates/i);
    const updated = await withTenantOn(state.rls!, b.tenantId, (tx) =>
      tx.decisionLog.updateMany({ where: { tenantId: requireId(a.tenantId, 'a') }, data: { reason: 'silindi' } }),
    );
    expect(updated.count).toBe(0);
  });
});

describe('project_idea', () => {
  let ideaId = '';

  test('written and read back', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    const saved = await ideas.createProjectIdea(a, {
      title: 'Akıllı sulama',
      summary: 'Toprak nemine göre sulama',
      keywords: ['su', 'tarım'],
      trl: 4,
      targetPrograms: ['HORIZON-CL6', 'LIFE'],
    });
    ideaId = saved.id;
    expect(saved).toMatchObject({ status: 'OPEN', trl: 4, createdById: a.userId });
    const read = await ideas.getProjectIdea(a, ideaId);
    expect(read).toMatchObject({
      title: 'Akıllı sulama',
      summary: 'Toprak nemine göre sulama',
      keywords: ['su', 'tarım'],
      trl: 4,
      targetPrograms: ['HORIZON-CL6', 'LIFE'],
      status: 'OPEN',
    });
    expect((await ideas.listProjectIdeas(a)).map((i) => i.id)).toEqual([ideaId]);
  });

  test('an invalid TRL never reaches the table', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    await expect(ideas.createProjectIdea(a, { title: 'x', trl: 12, keywords: [], targetPrograms: [] })).rejects.toThrow();
    expect(await admin!.projectIdea.count({ where: { tenantId: a.tenantId } })).toBe(1);
  });

  test('another tenant cannot read or write it', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    expect(await ideas.getProjectIdea(b, ideaId)).toBeNull();
    expect(await ideas.listProjectIdeas(b)).toEqual([]);
    await expect(
      withTenantOn(state.rls!, b.tenantId, (tx) =>
        tx.projectIdea.create({ data: { tenantId: a.tenantId, title: 'x', trl: 1, keywords: [], targetPrograms: [] } }),
      ),
    ).rejects.toThrow(/row-level security|violates/i);
  });
});

describe('deletion', () => {
  test("erasing the deciding user keeps the tenant's decision and drops only the link", async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    await admin!.user.update({ where: { id: a.userId }, data: { email: `${RUN}-a2@example.com` } });
    const extra = await admin!.user.create({ data: { email: `${RUN}-x@example.com`, name: 'x' } });
    users.push(extra.id);
    const opp = await newOpportunity(a);
    await withdrawal.withdrawOpportunity({ tenantId: a.tenantId, userId: extra.id }, opp, { reason: 'silinecek kişi' });
    await admin!.user.delete({ where: { id: extra.id } });
    const row = await admin!.decisionLog.findFirstOrThrow({ where: { opportunityId: opp } });
    expect(row.decidedById).toBeNull();
    expect(row.reason).toBe('silinecek kişi');
  });

  test('deleting the tenant takes both tables with it', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    const t = await makeFixture('del');
    await ideas.createProjectIdea(t, { title: 'gider', trl: 2, keywords: [], targetPrograms: [] });
    await withdrawal.withdrawOpportunity(t, t.opportunityId, { reason: 'gider' });
    await admin!.tenant.delete({ where: { id: requireId(t.tenantId, 'del') } });
    expect(await admin!.projectIdea.count({ where: { tenantId: t.tenantId } })).toBe(0);
    expect(await admin!.decisionLog.count({ where: { tenantId: t.tenantId } })).toBe(0);
  });
});
