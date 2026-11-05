import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { presentIds, requireId } from './helpers/teardown-guard';

/**
 * NG-34 — the three G1 records on a real database, over `fabrika_app` (NOBYPASSRLS, asserted).
 * Nothing is mocked but the routing of `withTenant` to that client.
 *
 *  - each table: written and read back through src/lib/gates/readiness-records.ts;
 *  - another tenant can neither read nor write them: RLS for the rows, and the composite
 *    foreign keys for a row that names the other tenant's opportunity or seat with its own
 *    tenantId, which RLS alone lets through (a foreign key check does not pass through RLS);
 *  - an empty Tenant.pic reads as missing, and PIC is not stored a second time.
 *
 * `.live`: needs the docker-compose Postgres, `pnpm db:setup` and `pnpm db:rls-role`.
 */

const SUITE = 'readiness-records.live';
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');
const RUN = `ng34-${Date.now().toString(36)}`;

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
const records = await import('@/lib/gates/readiness-records');
const { computeG0ForOpportunity } = await import('@/lib/scoring/g0-compute');

type Scope = { tenantId: string; userId: string };
type Fixture = Scope & { opportunityId: string; seatId: string; partnerSeatId: string };

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
  const seat = await admin!.consortiumSeat.create({
    data: { tenantId: tenant.id, opportunityId: opportunity.id, roleKey: 'research', organizationId: `${RUN}-pic-${key}` },
    select: { id: true },
  });
  const partnerSeat = await admin!.consortiumSeat.create({
    data: { tenantId: tenant.id, opportunityId: opportunity.id, roleKey: 'industry' },
    select: { id: true },
  });
  return { tenantId: tenant.id, userId: user.id, opportunityId: opportunity.id, seatId: seat.id, partnerSeatId: partnerSeat.id };
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

describe('org_readiness', () => {
  test('nothing recorded and no PIC: every field is missing', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    const view = await records.getOwnReadiness(a);
    expect(view).toEqual({
      subject: 'self',
      pic: 'missing',
      euLogin: 'unknown',
      lear: 'unknown',
      missing: ['pic', 'euLogin', 'lear'],
      complete: false,
    });
  });

  test('written and read back; "no" stays apart from "not answered"', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    await records.saveOwnReadiness(a, { euLoginReady: true, learReady: false });
    const view = await records.getOwnReadiness(a);
    expect(view.euLogin).toBe('yes');
    expect(view.lear).toBe('no');
    expect(view.missing).toEqual(['pic', 'lear']);
  });

  test('a save that leaves a field out keeps it; null clears it', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    await records.saveOwnReadiness(a, { learReady: true });
    expect((await records.getOwnReadiness(a)).euLogin).toBe('yes');
    await records.saveOwnReadiness(a, { euLoginReady: null });
    expect((await records.getOwnReadiness(a)).euLogin).toBe('unknown');
    await records.saveOwnReadiness(a, { euLoginReady: true });
  });

  test('PIC is read from Tenant.pic, the one place it lives', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    await admin!.tenant.update({ where: { id: a.tenantId }, data: { pic: `9${Date.now().toString().slice(-8)}` } });
    const view = await records.getOwnReadiness(a);
    expect(view.pic).toBe('present');
    expect(view.complete).toBe(true);
    await admin!.tenant.update({ where: { id: a.tenantId }, data: { pic: null } });
    const cleared = await records.getOwnReadiness(a);
    expect(cleared.pic).toBe('missing');
    expect(cleared.missing).toEqual(['pic']);
    expect(Object.keys(admin!.orgReadiness.fields)).not.toContain('pic');
  });

  test("a partner's readiness is keyed on the organisation, and its PIC comes from the seat", async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    const before = await records.getSeatReadiness(a, a.seatId);
    expect(before).toMatchObject({ subject: `cordis:${RUN}-pic-a`, pic: 'present', euLogin: 'unknown' });
    expect(await records.saveSeatReadiness(a, a.seatId, { euLoginReady: true, learReady: true })).toMatchObject({ complete: true });
    expect(await records.getSeatReadiness(a, a.seatId)).toMatchObject({ complete: true });
    // A seat nobody fills has no organisation to hold a record for.
    expect(await records.getSeatReadiness(a, a.partnerSeatId)).toBeNull();
    expect(await records.saveSeatReadiness(a, a.partnerSeatId, { euLoginReady: true })).toBeNull();
    // The tenant's own row did not move.
    expect((await records.getOwnReadiness(a)).subject).toBe('self');
  });

  test('a private partner with no PIC on its record reads as missing', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    const partner = await admin!.partnerOrg.create({ data: { tenantId: b.tenantId, name: `${RUN} private` } });
    await admin!.consortiumSeat.update({ where: { id: b.partnerSeatId }, data: { partnerOrgId: partner.id } });
    const view = await records.getSeatReadiness(b, b.partnerSeatId);
    expect(view).toMatchObject({ subject: `partner:${partner.id}`, pic: 'missing', complete: false });
    expect(view?.missing).toContain('pic');
  });

  test('another tenant cannot read or write it', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    expect(await records.getSeatReadiness(b, a.seatId)).toBeNull();
    expect(await records.saveSeatReadiness(b, a.seatId, { learReady: false })).toBeNull();
    expect(await withTenantOn(state.rls!, b.tenantId, (tx) => tx.orgReadiness.count({ where: { tenantId: a.tenantId } }))).toBe(0);
    await expect(
      withTenantOn(state.rls!, b.tenantId, (tx) =>
        tx.orgReadiness.create({ data: { tenantId: a.tenantId, subject: 'self', learReady: false } }),
      ),
    ).rejects.toThrow(/row-level security|violates/i);
    const updated = await withTenantOn(state.rls!, b.tenantId, (tx) =>
      tx.orgReadiness.updateMany({ where: { tenantId: requireId(a.tenantId, 'a') }, data: { learReady: false } }),
    );
    expect(updated.count).toBe(0);
    expect((await records.getOwnReadiness(a)).lear).toBe('yes');
  });
});

describe('internal_approval', () => {
  test('no record reads as null; written and read back', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    expect(await records.getInternalApproval(a, a.opportunityId)).toBeNull();
    const saved = await records.saveInternalApproval(a, a.opportunityId, {
      approved: true,
      cofinancingCents: 2_500_000,
      currency: 'EUR',
      decisionRef: 'K-2026/14',
      decisionAt: '2026-10-20T00:00:00.000Z',
    });
    expect(saved).toMatchObject({ approved: true, approvedById: a.userId, cofinancingCents: 2_500_000, currency: 'EUR', decisionRef: 'K-2026/14' });
    expect(await records.getInternalApproval(a, a.opportunityId)).toEqual(saved);
  });

  test('a changed commitment is a new approval; an unchanged one keeps its date', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    const first = await records.getInternalApproval(a, a.opportunityId);
    const same = await records.saveInternalApproval(a, a.opportunityId, {
      approved: true, cofinancingCents: 2_500_000, currency: 'EUR', decisionRef: 'K-2026/15', decisionAt: null,
    });
    expect(same?.approvedAt).toBe(first?.approvedAt);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const raised = await records.saveInternalApproval(a, a.opportunityId, {
      approved: true, cofinancingCents: 3_000_000, currency: 'EUR', decisionRef: 'K-2026/15', decisionAt: null,
    });
    expect(raised?.approvedAt).not.toBe(first?.approvedAt);
    const withdrawn = await records.saveInternalApproval(a, a.opportunityId, {
      approved: false, cofinancingCents: 3_000_000, currency: 'EUR', decisionRef: null, decisionAt: null,
    });
    expect(withdrawn).toMatchObject({ approved: false, approvedAt: null, approvedById: null });
    await records.saveInternalApproval(a, a.opportunityId, {
      approved: true, cofinancingCents: 3_000_000, currency: 'EUR', decisionRef: null, decisionAt: null,
    });
  });

  test('another tenant cannot read or write it', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    expect(await records.getInternalApproval(b, a.opportunityId)).toBeNull();
    expect(
      await records.saveInternalApproval(b, a.opportunityId, {
        approved: true, cofinancingCents: 1, currency: 'EUR', decisionRef: null, decisionAt: null,
      }),
    ).toBeNull();
    // Own tenantId + the other tenant's opportunity: RLS passes it, the composite FK does not.
    await expect(
      withTenantOn(state.rls!, b.tenantId, (tx) =>
        tx.internalApproval.create({ data: { tenantId: b.tenantId, opportunityId: a.opportunityId } }),
      ),
    ).rejects.toThrow(/foreign key/i);
    expect(await withTenantOn(state.rls!, b.tenantId, (tx) => tx.internalApproval.count({ where: { opportunityId: a.opportunityId } }))).toBe(0);
    expect((await records.getInternalApproval(a, a.opportunityId))?.cofinancingCents).toBe(3_000_000);
  });

  test('a soft-deleted opportunity takes no record', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    const gone = await admin!.opportunity.create({
      data: {
        tenantId: b.tenantId,
        workspaceId: (await admin!.opportunity.findUniqueOrThrow({ where: { id: b.opportunityId } })).workspaceId,
        title: `${RUN} gone`,
        deletedAt: new Date(),
      },
      select: { id: true },
    });
    expect(await records.saveInternalApproval(b, gone.id, {
      approved: true, cofinancingCents: 1, currency: 'EUR', decisionRef: null, decisionAt: null,
    })).toBeNull();
  });
});

describe('partner_budget_share', () => {
  const share = { minCents: 10_000_000, maxCents: 15_000_000, currency: 'EUR', agreed: false };

  test('written and read back, with the agreement apart from the range', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    expect(await records.listBudgetShares(a, a.opportunityId)).toEqual([]);
    expect(await records.saveBudgetShare(a, a.seatId, share)).toMatchObject({
      seatId: a.seatId, minCents: 10_000_000, maxCents: 15_000_000, agreedAt: null, agreedById: null,
    });
    const agreed = await records.saveBudgetShare(a, a.seatId, { ...share, agreed: true });
    expect(agreed?.agreedById).toBe(a.userId);
    expect(agreed?.agreedAt).toEqual(expect.any(String));
    expect(await records.listBudgetShares(a, a.opportunityId)).toEqual([agreed]);
  });

  test('a changed range is no longer the range they agreed to', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    const moved = await records.saveBudgetShare(a, a.seatId, { ...share, maxCents: 16_000_000, agreed: false });
    expect(moved?.agreedAt).toBeNull();
    await records.saveBudgetShare(a, a.seatId, { ...share, agreed: true });
  });

  test('an amount past 32 bits survives', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    const big = await records.saveBudgetShare(a, a.partnerSeatId, { ...share, minCents: 3_000_000_000, maxCents: 4_000_000_000 });
    expect(big).toMatchObject({ minCents: 3_000_000_000, maxCents: 4_000_000_000 });
  });

  test('another tenant cannot read or write it', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    expect(await records.listBudgetShares(b, a.opportunityId)).toEqual([]);
    expect(await records.saveBudgetShare(b, a.seatId, share)).toBeNull();
    await expect(
      withTenantOn(state.rls!, b.tenantId, (tx) =>
        tx.partnerBudgetShare.create({ data: { tenantId: b.tenantId, seatId: a.seatId, minCents: 1, maxCents: 2 } }),
      ),
    ).rejects.toThrow(/foreign key/i);
    await expect(
      withTenantOn(state.rls!, b.tenantId, (tx) =>
        tx.partnerBudgetShare.create({ data: { tenantId: a.tenantId, seatId: b.seatId, minCents: 1, maxCents: 2 } }),
      ),
    ).rejects.toThrow(/row-level security|violates/i);
    expect((await records.listBudgetShares(a, a.opportunityId)).find((row) => row.seatId === a.seatId)?.agreedById).toBe(a.userId);
  });

  test('every write leaves an audit row with no amount or decision text in it', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    const rows = await admin!.auditEvent.findMany({ where: { tenantId: a.tenantId } });
    const types = new Set(rows.map((row) => row.type));
    expect(types).toEqual(new Set(['org_readiness.saved', 'internal_approval.saved', 'partner_budget_share.saved']));
    expect(JSON.stringify(rows.map((row) => row.data))).not.toMatch(/K-2026|2500000|15000000/);
  });
});

describe('an empty PIC and the G0 score (NG-27)', () => {
  // Relative on purpose: #272 moves the G0 points, and the threshold is its own decision. What
  // cannot move is that a tenant with no PIC gets nothing from what only a PIC can show.
  test('tenant.pic = null earns no coordination or network points, whatever the score then is', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    await admin!.tenant.update({ where: { id: a.tenantId }, data: { pic: null } });
    const g0 = await withTenantOn(state.rls!, a.tenantId, (tx) => computeG0ForOpportunity(tx, a.tenantId, a.opportunityId));
    console.log(
      `[NG-34] empty PIC: score=${g0?.score} decision=${g0?.decision} coverage=${g0?.coverage} ` +
        `coordination=${g0?.contributions?.coordinatorHistory} network=${g0?.contributions?.networkCentrality}`,
    );
    expect(g0).not.toBeNull();
    expect(g0!.features.coordinatorHistory ?? 0).toBe(0);
    expect(g0!.features.networkCentrality ?? 0).toBe(0);
    expect(g0!.contributions?.coordinatorHistory ?? 0).toBe(0);
    expect(g0!.contributions?.networkCentrality ?? 0).toBe(0);
  });
});

describe('input rules', () => {
  test('a range with min above max is refused; the spec sets no numeric bound', () => {
    expect(records.BudgetShareInputSchema.safeParse({ seatId: 's', minCents: 2, maxCents: 1, agreed: false }).success).toBe(false);
    expect(records.BudgetShareInputSchema.safeParse({ seatId: 's', minCents: 1, maxCents: 1, agreed: false }).success).toBe(true);
    expect(records.BudgetShareInputSchema.safeParse({ seatId: 's', minCents: -1, maxCents: 1, agreed: false }).success).toBe(false);
  });
  test('an approval needs a whole, non-negative amount or none', () => {
    const base = { approved: true, decisionRef: null, decisionAt: null };
    expect(records.InternalApprovalInputSchema.safeParse({ ...base, cofinancingCents: null }).success).toBe(true);
    expect(records.InternalApprovalInputSchema.safeParse({ ...base, cofinancingCents: 1.5 }).success).toBe(false);
    expect(records.InternalApprovalInputSchema.safeParse({ ...base, cofinancingCents: 1, currency: 'euro' }).success).toBe(false);
  });
});
