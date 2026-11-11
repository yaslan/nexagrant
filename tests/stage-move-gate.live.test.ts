import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Gate, PrismaClient } from '@prisma/client';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { presentIds, requireId } from './helpers/teardown-guard';

// NG-100 / K-579560=A: a seat candidate counts only when the M8 matcher wrote its row
// (visibleSeatCandidates reads the breakdown), so seeded rows carry a matcher breakdown.
const MATCH_BREAKDOWN = { topicExperience: 20, geographicBalance: 15, collabHistory: 10, rivalRisk: 0 };

/**
 * NG-25: a forward stage move goes through the gate, whichever door it comes in by.
 *
 * `moveOpportunityStage` used to write the stage without running a gate and answer `{ success: true }`
 * even when the write failed; `evaluateOpportunityGate` ran whichever gate the browser named, so a
 * crafted call could pass G4 from G0. Both run here on a real database over `fabrika_app`
 * (NOBYPASSRLS, asserted). Only the session is faked.
 *
 * `.live`: needs Postgres and `pnpm db:rls-role`. Locally a missing database skips the file; in CI
 * it fails (tests/helpers/live-db-role.ts).
 */

const SUITE = 'stage-move-gate.live';
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');
const RUN = `stage-move-${Date.now().toString(36)}`;
const FIXTURE = `${RUN}-fixture`;

const state = vi.hoisted(() => ({
  rls: undefined as PrismaClient | undefined,
  failNextTransaction: false,
  scope: { tenantId: '', userId: '', role: 'TENANT_OWNER', workspaceIds: [] as string[], isPlatformAdmin: false },
}));
const store = vi.hoisted(() => ({ updateStage: vi.fn(() => false) }));

vi.mock('@/lib/tenant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tenant')>();
  return { ...actual, tenantScopeOf: () => state.scope, assertTenantActionWritable: async () => {} };
});
vi.mock('@/lib/auth', () => ({
  auth: async () => ({ user: { id: state.scope.userId, email: `${RUN}@example.invalid`, name: 'Owner' } }),
}));
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    withTenant: (tenantId: string, cb: Parameters<typeof actual.withTenant>[1]) => {
      if (state.failNextTransaction) {
        state.failNextTransaction = false;
        return Promise.reject(new Error('database went away'));
      }
      return actual.withTenantOn(state.rls!, tenantId, cb);
    },
  };
});
vi.mock('@/lib/k5-pipeline/pipelineStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/k5-pipeline/pipelineStore')>();
  return { ...actual, updateInMemoryOpportunityStage: store.updateStage };
});
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const { createDbClient } = await import('@/lib/db');
const { moveOpportunityStage, evaluateOpportunityGate } = await import(
  '@/app/[locale]/(app)/[workspace]/pipeline/actions'
);

let admin: PrismaClient | undefined;
let ready = false;
let skipReason = '';
let tenantId = '';
let otherTenantId = '';
let workspaceId = '';
let otherWorkspaceId = '';
const tenants: string[] = [];

async function opportunity(title: string, stage: Gate = 'G0', owner?: { tenantId: string; workspaceId: string }) {
  const o = await admin!.opportunity.create({
    data: {
      tenantId: owner?.tenantId ?? tenantId,
      workspaceId: owner?.workspaceId ?? workspaceId,
      title: `${RUN} ${title}`,
      stage,
    },
  });
  return o.id;
}
/** A G0 decision on file, written the way the engine writes one. */
async function fileG0(opportunityId: string, passed: boolean, decidedAt = new Date(), owner = tenantId) {
  await admin!.gateDecision.create({
    data: { tenantId: owner, opportunityId, gate: 'G0', passed, inputs: {}, ruleVersion: '1.0', decidedBy: FIXTURE, decidedAt },
  });
}
/** Meets the seat conditions of G1: a filled critical seat and a backup candidate. */
async function fillSeatsForG1(opportunityId: string) {
  const seat = await admin!.consortiumSeat.create({
    data: { tenantId, opportunityId, roleKey: 'research', status: 'CONFIRMED', organizationId: `${RUN}-org-seated` },
  });
  await admin!.seatCandidate.create({
    data: { tenantId, seatId: seat.id, organizationId: `${RUN}-org-backup`, score: 9, breakdown: MATCH_BREAKDOWN, rank: 1 },
  });
}
/** Meets every G1 condition the engine checks: G0 passed, plus the seats. */
async function makeReadyForG1(opportunityId: string) {
  await fileG0(opportunityId, true);
  await fillSeatsForG1(opportunityId);
}
const stageOf = async (id: string) =>
  (await admin!.opportunity.findUniqueOrThrow({ where: { id }, select: { stage: true } })).stage;
const decisionsOf = (opportunityId: string) =>
  admin!.gateDecision.findMany({
    where: { opportunityId },
    orderBy: { decidedAt: 'asc' },
    select: { gate: true, passed: true, decidedBy: true },
  });

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

  for (const key of ['a', 'b']) {
    const t = await admin.tenant.create({
      data: { name: `${RUN} ${key}`, slug: `${RUN}-${key}`, country: 'TR', kind: 'ORGANIZATION' },
      select: { id: true },
    });
    tenants.push(t.id);
    const ws = await admin.workspace.create({ data: { tenantId: t.id, name: RUN, slug: `${RUN}-${key}` } });
    if (key === 'a') {
      tenantId = t.id;
      workspaceId = ws.id;
    } else {
      otherTenantId = t.id;
      otherWorkspaceId = ws.id;
    }
  }
  state.scope = { ...state.scope, tenantId, userId: `${RUN}-user` };
  ready = true;
});

beforeEach((ctx) => {
  if (!ready) ctx.skip(skipReason);
  store.updateStage.mockClear();
  state.failNextTransaction = false;
});

afterAll(async () => {
  if (admin) {
    // SeatCandidate and ConsortiumSeat have no FK to Tenant; delete them by tenant first.
    await admin.seatCandidate.deleteMany({ where: { tenantId: { in: presentIds(tenants) } } }).catch(() => {});
    await admin.consortiumSeat.deleteMany({ where: { tenantId: { in: presentIds(tenants) } } }).catch(() => {});
    for (const id of presentIds(tenants)) await admin.tenant.delete({ where: { id } }).catch(() => {});
  }
  await Promise.all([state.rls, admin].map((c) => c?.$disconnect().catch(() => {})));
});

describe('moveOpportunityStage', () => {
  test('next stage, conditions not met: refused with the reasons, stage stays, decision filed', async () => {
    const opp = await opportunity('blocked');

    const result = await moveOpportunityStage(opp, 'G1');

    expect(result).toMatchObject({ success: true, passed: false });
    expect((result as { reasons: string[] }).reasons.join()).toMatch(/no critical seat/);
    expect(await stageOf(opp)).toBe('G0');
    expect(await decisionsOf(opp)).toEqual([{ gate: 'G1', passed: false, decidedBy: `${RUN}-user` }]);
    expect(store.updateStage).not.toHaveBeenCalled();
  });

  test('next stage, conditions met: the gate moves it and files the decision', async () => {
    const opp = await opportunity('ready');
    await makeReadyForG1(opp);

    expect(await moveOpportunityStage(opp, 'G1')).toEqual({ success: true, passed: true, reasons: [] });

    expect(await stageOf(opp)).toBe('G1');
    expect(await decisionsOf(opp)).toEqual([
      { gate: 'G0', passed: true, decidedBy: FIXTURE },
      { gate: 'G1', passed: true, decidedBy: `${RUN}-user` },
    ]);
  });

  test('no G0 decision on file, seats fine: refused for that reason alone, stage stays, refusal filed', async () => {
    const opp = await opportunity('no g0');
    await fillSeatsForG1(opp);

    const result = await moveOpportunityStage(opp, 'G1');

    expect(result).toMatchObject({ success: true, passed: false });
    expect((result as { reasons: string[] }).reasons).toEqual(['G0 has not been passed: no G0 decision is on file']);
    expect((result as { reasonDetails: unknown[] }).reasonDetails).toEqual([{ code: 'G1_G0_NOT_DECIDED' }]);
    expect(await stageOf(opp)).toBe('G0');
    expect(await decisionsOf(opp)).toEqual([{ gate: 'G1', passed: false, decidedBy: `${RUN}-user` }]);
    expect(store.updateStage).not.toHaveBeenCalled();
  });

  test('skipping a stage is refused before any gate runs, even when the skipped-to gate would pass', async () => {
    // G2 only refuses OPEN seats, so this opportunity would pass it.
    const opp = await opportunity('skip');

    const result = await moveOpportunityStage(opp, 'G2');

    expect(result).toMatchObject({ success: true, passed: false, refusal: 'STAGE_SKIP', nextStage: 'G1' });
    expect((result as { reasons: string[] }).reasons).toHaveLength(1);
    expect(await stageOf(opp)).toBe('G0');
    expect(await decisionsOf(opp)).toEqual([]);
    expect(store.updateStage).not.toHaveBeenCalled();
  });

  test('moving back stays free and files no gate decision', async () => {
    const opp = await opportunity('back', 'G2');

    expect(await moveOpportunityStage(opp, 'G0')).toEqual({ success: true, passed: true, reasons: [] });

    expect(await stageOf(opp)).toBe('G0');
    expect(await decisionsOf(opp)).toEqual([]);
  });

  test('a database failure is an error, not a success, and nothing moves', async () => {
    const opp = await opportunity('db failure');
    await makeReadyForG1(opp);
    state.failNextTransaction = true;

    expect(await moveOpportunityStage(opp, 'G1')).toEqual({ success: false, error: 'STAGE_MOVE_FAILED' });

    expect(await stageOf(opp)).toBe('G0');
    expect(store.updateStage).not.toHaveBeenCalled();
  });

  test('another tenant’s id and an archived id are not found; neither row changes', async () => {
    const foreign = await opportunity('foreign', 'G2', { tenantId: otherTenantId, workspaceId: otherWorkspaceId });
    const archived = await opportunity('archived', 'G2');
    await admin!.opportunity.update({ where: { id: archived }, data: { deletedAt: new Date() } });

    for (const id of [foreign, archived]) {
      expect(await moveOpportunityStage(id, 'G1')).toEqual({ success: false, error: 'OPPORTUNITY_NOT_FOUND' });
      expect(await stageOf(id)).toBe('G2');
    }
  });

  test('a stage outside the enum is refused', async () => {
    const opp = await opportunity('bad target');

    expect(await moveOpportunityStage(opp, 'G9' as Gate)).toEqual({ success: false, error: 'INVALID_INPUT' });
    expect(await stageOf(opp)).toBe('G0');
  });
});

describe('G1 reads the latest G0 decision of this opportunity in this tenant', () => {
  const HOUR = 3_600_000;
  const ago = (hours: number) => new Date(Date.now() - hours * HOUR);

  test('passed, then failed: the latest counts, refused', async () => {
    const opp = await opportunity('pass then fail');
    await fillSeatsForG1(opp);
    await fileG0(opp, true, ago(2));
    await fileG0(opp, false, ago(1));

    const result = await moveOpportunityStage(opp, 'G1');

    expect((result as { reasonDetails: unknown[] }).reasonDetails).toEqual([{ code: 'G1_G0_LAST_FAILED' }]);
    expect(await stageOf(opp)).toBe('G0');
  });

  test('failed, then passed: the latest counts, moves', async () => {
    const opp = await opportunity('fail then pass');
    await fillSeatsForG1(opp);
    await fileG0(opp, false, ago(2));
    await fileG0(opp, true, ago(1));

    expect(await moveOpportunityStage(opp, 'G1')).toEqual({ success: true, passed: true, reasons: [] });
    expect(await stageOf(opp)).toBe('G1');
  });

  test('a soft-deleted pass is not a pass', async () => {
    const opp = await opportunity('erased pass');
    await fillSeatsForG1(opp);
    await fileG0(opp, true);
    await admin!.gateDecision.updateMany({ where: { opportunityId: requireId(opp, 'opp') }, data: { deletedAt: new Date() } });

    const result = await moveOpportunityStage(opp, 'G1');

    expect((result as { reasonDetails: unknown[] }).reasonDetails).toEqual([{ code: 'G1_G0_NOT_DECIDED' }]);
    expect(await stageOf(opp)).toBe('G0');
  });

  test('a pass filed under another tenant is not a pass', async () => {
    const opp = await opportunity('foreign pass');
    await fillSeatsForG1(opp);
    await fileG0(opp, true, new Date(), otherTenantId);

    const result = await moveOpportunityStage(opp, 'G1');

    expect((result as { reasonDetails: unknown[] }).reasonDetails).toEqual([{ code: 'G1_G0_NOT_DECIDED' }]);
    expect(await stageOf(opp)).toBe('G0');
  });

  test('the detail path answers the same: refused without G0, filed, and the outcome is in the inputs', async () => {
    const opp = await opportunity('detail no g0');
    await fillSeatsForG1(opp);

    const result = await evaluateOpportunityGate({ opportunityId: opp, gate: 'G1' });

    expect(result).toMatchObject({ success: true, passed: false, reasonDetails: [{ code: 'G1_G0_NOT_DECIDED' }] });
    expect(await stageOf(opp)).toBe('G0');
    const filed = await admin!.gateDecision.findMany({ where: { opportunityId: opp }, select: { gate: true, inputs: true } });
    expect(filed).toMatchObject([{ gate: 'G1', inputs: { latestG0Passed: null } }]);
  });

  test('the detail path moves an opportunity that passed G0', async () => {
    const opp = await opportunity('detail ready');
    await makeReadyForG1(opp);

    expect(await evaluateOpportunityGate({ opportunityId: opp, gate: 'G1' })).toEqual({ success: true, passed: true, reasons: [] });
    expect(await stageOf(opp)).toBe('G1');
  });
});

describe('evaluateOpportunityGate only runs the next or the current gate', () => {
  test.each([
    ['skip forward', 'G0', 'G2'],
    ['far forward', 'G0', 'G4'],
    ['backward', 'G3', 'G1'],
  ] as const)('%s: refused, no decision, stage stays', async (_name, from, gate) => {
    const opp = await opportunity(`out of order ${from} ${gate}`, from);

    expect(await evaluateOpportunityGate({ opportunityId: opp, gate })).toEqual({
      success: false,
      error: 'GATE_OUT_OF_ORDER',
    });

    expect(await stageOf(opp)).toBe(from);
    expect(await decisionsOf(opp)).toEqual([]);
  });

  test('the next gate advances; the current gate re-runs without moving', async () => {
    const opp = await opportunity('in order', 'G1');

    expect(await evaluateOpportunityGate({ opportunityId: opp, gate: 'G2' })).toEqual({
      success: true,
      passed: true,
      reasons: [],
    });
    expect(await stageOf(opp)).toBe('G2');

    expect(await evaluateOpportunityGate({ opportunityId: opp, gate: 'G2' })).toMatchObject({ success: true });
    expect(await stageOf(opp)).toBe('G2');
  });
});
