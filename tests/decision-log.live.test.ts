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
 *  - a project idea is written and read back, tenant-scoped;
 *  - NG-241: a withdrawn opportunity is reactivated, with a reason, back to the status it was
 *    withdrawn from; only WITHDRAWN, never another tenant's, never by a role that may not decide
 *    on it. The server actions are called too, with `auth` mocked, for the refusal codes.
 *
 * `.live`: needs the docker-compose Postgres, `pnpm db:setup` and `pnpm db:rls-role`.
 */

const SUITE = 'decision-log.live';
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');
const RUN = `ng38-${Date.now().toString(36)}`;

const state = vi.hoisted(() => ({ rls: undefined as PrismaClient | undefined }));
const session = vi.hoisted(() => ({ tenantId: '', userId: '', role: 'TENANT_OWNER' }));
vi.mock('@/lib/auth', () => ({
  auth: async () => ({ user: { id: session.userId }, tenantId: session.tenantId, role: session.role }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

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
const actions = await import('@/app/[locale]/(app)/[workspace]/pipeline/actions');

type Scope = { tenantId: string; userId: string; role: string };
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
  return {
    tenantId: tenant.id,
    userId: user.id,
    role: 'TENANT_OWNER',
    workspaceId: workspace.id,
    opportunityId: opportunity.id,
  };
}

async function newOpportunity(
  f: Fixture,
  status: 'ACTIVE' | 'SUBMITTED' | 'FUNDED' | 'WITHDRAWN' = 'ACTIVE',
  ownerId: string | null = null,
) {
  const opp = await admin!.opportunity.create({
    data: { tenantId: f.tenantId, workspaceId: f.workspaceId, title: `${RUN} extra`, status, ownerId },
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

/** A MEMBER of tenant a, who may decide only on opportunities they own (canArchiveOpportunity). */
async function memberOf(f: Fixture, key: string): Promise<Scope> {
  const user = await admin!.user.create({ data: { email: `${RUN}-${key}@example.com`, name: key } });
  users.push(user.id);
  await admin!.membership.create({ data: { tenantId: f.tenantId, userId: user.id, role: 'MEMBER' } });
  return { tenantId: f.tenantId, userId: user.id, role: 'MEMBER' };
}

async function statusOf(id: string) {
  return (await admin!.opportunity.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;
}

async function decisionCount(id: string) {
  return admin!.decisionLog.count({ where: { opportunityId: id } });
}

describe('reactivation (NG-241)', () => {
  const reactivate = (s: Scope, opportunityId: string, reason: string) =>
    withdrawal.reactivateOpportunity({ ...s, opportunityId, reason });

  test('without a reason it is refused and nothing is written', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    const opp = await newOpportunity(a);
    await withdrawal.withdrawOpportunity(a, opp, { reason: 'Bütçe yok' });
    for (const reason of ['', '   ', 'a'.repeat(2001), undefined]) {
      expect(await reactivate(a, opp, reason as never)).toEqual({ refused: 'REASON_REQUIRED' });
    }
    expect(await statusOf(opp)).toBe('WITHDRAWN');
    expect(await decisionCount(opp)).toBe(1);
  });

  test('with a reason: back to ACTIVE, a REACTIVATE row, two decisions read back in order', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    const opp = await newOpportunity(a);
    await withdrawal.withdrawOpportunity(a, opp, { reason: 'Ortak bulunamadı' });

    const result = await reactivate(a, opp, '  Ortak bulundu  ');
    expect(result).toMatchObject({
      status: 'ACTIVE',
      decision: {
        opportunityId: opp,
        kind: 'REACTIVATE',
        reason: 'Ortak bulundu',
        decidedById: a.userId,
        fromStatus: 'WITHDRAWN',
        toStatus: 'ACTIVE',
      },
    });
    expect(await statusOf(opp)).toBe('ACTIVE');

    const log = await withdrawal.listDecisions(a, opp);
    expect(log?.map((d) => [d.kind, d.fromStatus, d.toStatus])).toEqual([
      ['WITHDRAW', 'ACTIVE', 'WITHDRAWN'],
      ['REACTIVATE', 'WITHDRAWN', 'ACTIVE'],
    ]);

    // The audit row names the act and the statuses, not the reason.
    const audit = await admin!.auditEvent.findMany({ where: { tenantId: a.tenantId, type: 'opportunity.reactivated', target: opp } });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.data).toMatchObject({ from: 'WITHDRAWN', to: 'ACTIVE' });
    expect(JSON.stringify(audit[0])).not.toContain('Ortak bulundu');
  });

  test('a submitted opportunity comes back as SUBMITTED', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    const opp = await newOpportunity(a, 'SUBMITTED');
    await withdrawal.withdrawOpportunity(a, opp, { reason: 'Portalda geri çektik' });
    expect(await reactivate(a, opp, 'Yeniden gönderdik')).toMatchObject({ status: 'SUBMITTED' });
    expect(await statusOf(opp)).toBe('SUBMITTED');
  });

  test('withdraw → reactivate twice: each return follows the latest withdrawal', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    const opp = await newOpportunity(a, 'SUBMITTED');
    await withdrawal.withdrawOpportunity(a, opp, { reason: '1' });
    expect(await reactivate(a, opp, '2')).toMatchObject({ status: 'SUBMITTED' });
    await admin!.opportunity.update({ where: { id: opp }, data: { status: 'ACTIVE' } });
    await withdrawal.withdrawOpportunity(a, opp, { reason: '3' });
    expect(await reactivate(a, opp, '4')).toMatchObject({ status: 'ACTIVE' });
    expect((await withdrawal.listDecisions(a, opp))?.map((d) => d.kind)).toEqual([
      'WITHDRAW',
      'REACTIVATE',
      'WITHDRAW',
      'REACTIVATE',
    ]);
  });

  test('only a withdrawn opportunity is reactivated', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    for (const status of ['ACTIVE', 'SUBMITTED', 'FUNDED'] as const) {
      const opp = await newOpportunity(a, status);
      expect(await reactivate(a, opp, 'neden')).toEqual({ refused: 'NOT_WITHDRAWN' });
      expect(await statusOf(opp)).toBe(status);
      expect(await decisionCount(opp)).toBe(0);
    }
  });

  test('a withdrawal with no recorded status (before NG-241) returns to ACTIVE', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    const legacy = await newOpportunity(a, 'WITHDRAWN');
    await admin!.decisionLog.create({
      data: { tenantId: a.tenantId, opportunityId: legacy, kind: 'WITHDRAW', reason: 'eski kayıt' },
    });
    expect(await reactivate(a, legacy, 'geri')).toMatchObject({ status: 'ACTIVE' });
    const bare = await newOpportunity(a, 'WITHDRAWN');
    expect(await reactivate(a, bare, 'geri')).toMatchObject({ status: 'ACTIVE' });
  });

  test('of two concurrent reactivations one wins and one row is written', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    const opp = await newOpportunity(a);
    await withdrawal.withdrawOpportunity(a, opp, { reason: 'x' });
    const results = await Promise.all([reactivate(a, opp, 'bir'), reactivate(a, opp, 'iki')]);
    expect(results.filter((r) => 'decision' in r)).toHaveLength(1);
    expect(results.filter((r) => 'refused' in r)).toEqual([{ refused: 'NOT_WITHDRAWN' }]);
    expect(await admin!.decisionLog.count({ where: { opportunityId: opp, kind: 'REACTIVATE' } })).toBe(1);
  });

  test('another tenant cannot reactivate', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    const opp = await newOpportunity(a);
    await withdrawal.withdrawOpportunity(a, opp, { reason: 'x' });
    expect(await reactivate(b, opp, 'başkasının')).toEqual({ refused: 'NOT_FOUND' });
    expect(await statusOf(opp)).toBe('WITHDRAWN');
    expect(await decisionCount(opp)).toBe(1);
  });

  test('a MEMBER may neither withdraw nor reactivate an opportunity they do not own', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    const member = await memberOf(a, 'member-1');
    const theirs = await newOpportunity(a, 'ACTIVE', a.userId);
    expect(await withdrawal.withdrawOpportunity(member, theirs, { reason: 'benim değil' })).toEqual({ refused: 'FORBIDDEN' });
    expect(await statusOf(theirs)).toBe('ACTIVE');
    await withdrawal.withdrawOpportunity(a, theirs, { reason: 'sahibi vazgeçti' });
    expect(await reactivate(member, theirs, 'benim değil')).toEqual({ refused: 'FORBIDDEN' });
    expect(await statusOf(theirs)).toBe('WITHDRAWN');
    expect(await decisionCount(theirs)).toBe(1);

    // An unowned opportunity is not "everybody's".
    const unowned = await newOpportunity(a, 'WITHDRAWN', null);
    expect(await reactivate(member, unowned, 'sahipsiz')).toEqual({ refused: 'FORBIDDEN' });
  });

  test('a MEMBER who owns the opportunity may withdraw and reactivate it', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    const member = await memberOf(a, 'member-2');
    const own = await newOpportunity(a, 'ACTIVE', member.userId);
    expect(await withdrawal.withdrawOpportunity(member, own, { reason: 'vazgeçtim' })).toHaveProperty('decision');
    expect(await reactivate(member, own, 'döndüm')).toMatchObject({ status: 'ACTIVE' });
  });

  // The `where` half of the role rule (ownedByScope): the owner changes after the write's read
  // and before its conditional update. Another transaction holds the row with a new owner; the
  // write reads the old (committed) owner, passes canArchiveOpportunity, then its update waits on
  // the row lock. Once the owner change commits, the update re-checks its `where` against the new
  // owner and moves nothing. Without the `where` half it would move the row for a non-owner.
  test('an owner changed between the read and the write: neither withdrawal nor reactivation moves the row', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    const member = await memberOf(a, 'member-4');

    const withdrawable = await newOpportunity(a, 'ACTIVE', member.userId);
    const withdrawn = await ownerChangedMidWrite(withdrawable, a.userId, () =>
      withdrawal.withdrawOpportunity(member, withdrawable, { reason: 'benimdi' }),
    );
    expect(withdrawn).toEqual({ refused: 'ALREADY_WITHDRAWN' });
    expect(await statusOf(withdrawable)).toBe('ACTIVE');
    expect(await decisionCount(withdrawable)).toBe(0);

    const reactivatable = await newOpportunity(a, 'WITHDRAWN', member.userId);
    const reactivated = await ownerChangedMidWrite(reactivatable, a.userId, () =>
      reactivate(member, reactivatable, 'benimdi'),
    );
    expect(reactivated).toEqual({ refused: 'NOT_WITHDRAWN' });
    expect(await statusOf(reactivatable)).toBe('WITHDRAWN');
    expect(await decisionCount(reactivatable)).toBe(0);
  });
});

/**
 * Runs `write` while another transaction holds the opportunity's row with `ownerId` changed, and
 * commits that change only once `write`'s update is waiting on the row lock (seen in
 * pg_stat_activity, so the order is fixed, not timed).
 */
async function ownerChangedMidWrite<T>(opportunityId: string, newOwnerId: string, write: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let held!: () => void;
  const lockHeld = new Promise<void>((resolve) => (held = resolve));
  const handover = admin!.$transaction(
    async (tx) => {
      await tx.opportunity.update({ where: { id: requireId(opportunityId, 'opp') }, data: { ownerId: newOwnerId } });
      held();
      await released;
    },
    { timeout: 20_000 },
  );
  try {
    await lockHeld;
    const pending = write();
    const deadline = Date.now() + 10_000;
    for (;;) {
      const waiting = await admin!.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'
          AND query ILIKE 'UPDATE%"Opportunity"%'`;
      if ((waiting[0]?.n ?? 0) > 0) break;
      if (Date.now() > deadline) throw new Error('the write never waited on the row lock');
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    release();
    await handover;
    return await pending;
  } finally {
    release();
    await handover.catch(() => undefined);
  }
}

describe('withdraw / reactivate server actions (NG-241, inceleme Ö-1)', () => {
  const as = (s: Scope) => {
    session.tenantId = s.tenantId;
    session.userId = s.userId;
    session.role = s.role;
  };

  test('the owner reactivates through the action; the status comes back', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    const opp = await newOpportunity(a, 'SUBMITTED');
    as(a);
    expect(await actions.withdrawOpportunityAction({ opportunityId: opp, reason: 'vazgeç' })).toEqual({ success: true });
    expect(await actions.reactivateOpportunityAction({ opportunityId: opp, reason: 'dön' })).toEqual({
      success: true,
      status: 'SUBMITTED',
    });
    expect(await actions.reactivateOpportunityAction({ opportunityId: opp, reason: 'yine' })).toEqual({
      success: false,
      error: 'NOT_WITHDRAWN',
    });
  });

  test('reason refusals: blank → REASON_REQUIRED, over 2000 → REASON_TOO_LONG', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    const opp = await newOpportunity(a, 'WITHDRAWN');
    as(a);
    expect(await actions.reactivateOpportunityAction({ opportunityId: opp, reason: '   ' })).toEqual({
      success: false,
      error: 'REASON_REQUIRED',
    });
    expect(await actions.reactivateOpportunityAction({ opportunityId: opp, reason: 'a'.repeat(2001) })).toEqual({
      success: false,
      error: 'REASON_TOO_LONG',
    });
    expect(await actions.reactivateOpportunityAction({ opportunityId: '', reason: 'x' })).toEqual({
      success: false,
      error: 'INVALID_INPUT',
    });
    expect(await statusOf(opp)).toBe('WITHDRAWN');
  });

  test('a MEMBER who does not own it: WITHDRAW_FORBIDDEN and REACTIVATE_FORBIDDEN', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    const member = await memberOf(a, 'member-3');
    const active = await newOpportunity(a, 'ACTIVE', a.userId);
    const withdrawn = await newOpportunity(a, 'WITHDRAWN', a.userId);
    as(member);
    expect(await actions.withdrawOpportunityAction({ opportunityId: active, reason: 'x' })).toEqual({
      success: false,
      error: 'WITHDRAW_FORBIDDEN',
    });
    expect(await actions.reactivateOpportunityAction({ opportunityId: withdrawn, reason: 'x' })).toEqual({
      success: false,
      error: 'REACTIVATE_FORBIDDEN',
    });
    expect(await statusOf(active)).toBe('ACTIVE');
    expect(await statusOf(withdrawn)).toBe('WITHDRAWN');
    expect(await decisionCount(active)).toBe(0);
    expect(await decisionCount(withdrawn)).toBe(0);
  });

  test("another tenant's id answers OPPORTUNITY_NOT_FOUND", async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    const withdrawn = await newOpportunity(a, 'WITHDRAWN');
    as(b);
    expect(await actions.reactivateOpportunityAction({ opportunityId: withdrawn, reason: 'x' })).toEqual({
      success: false,
      error: 'OPPORTUNITY_NOT_FOUND',
    });
    expect(await statusOf(withdrawn)).toBe('WITHDRAWN');
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
    await withdrawal.withdrawOpportunity({ tenantId: a.tenantId, userId: extra.id, role: 'TENANT_OWNER' }, opp, { reason: 'silinecek kişi' });
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
