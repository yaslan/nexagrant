import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { presentIds } from './helpers/teardown-guard';

/**
 * NG-24: the G1 gate on a real database.
 *
 * The seat reaches CONFIRMED through the real M8 invite and confirm actions, so a pass here also
 * proves the gate's idea of "filled" is one the product can actually produce. Everything runs over
 * `fabrika_app` (NOBYPASSRLS, asserted): `SeatCandidate` is read under the tenant's RLS context.
 *
 * `.live`: needs Postgres and `pnpm db:rls-role`. Locally a missing database skips the file; in CI
 * it fails (tests/helpers/live-db-role.ts).
 */

const SUITE = 'g1-gate.live';
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');
const RUN = `g1-gate-${Date.now().toString(36)}`;
const SEATED = `${RUN}-org-seated`;
const BACKUP = `${RUN}-org-backup`;

const state = vi.hoisted(() => ({
  rls: undefined as PrismaClient | undefined,
  scope: { tenantId: '', userId: '', role: 'PIPELINE_MANAGER', workspaceIds: [] as string[], isPlatformAdmin: false },
}));

vi.mock('@/lib/tenant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tenant')>();
  return {
    ...actual,
    requireTenantAction: async () => state.scope,
    assertTenantActionWritable: async () => {},
  };
});
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  const withTenant = (tenantId: string, cb: Parameters<typeof actual.withTenant>[1]) =>
    actual.withTenantOn(state.rls!, tenantId, cb);
  return { ...actual, withTenant };
});
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const { createDbClient } = await import('@/lib/db');
const { evaluateGate } = await import('@/lib/gates/evaluate');
const m8 = await import('@/modules/m8/server/actions');

let admin: PrismaClient | undefined;
let ready = false;
let skipReason = '';
let tenantId = '';
let otherTenantId = '';
let workspaceId = '';
const tenants: string[] = [];

async function opportunity(title: string): Promise<string> {
  const o = await admin!.opportunity.create({ data: { tenantId, workspaceId, title: `${RUN} ${title}`, stage: 'G0' } });
  // These cases measure the seat conditions, so the G0 condition (NG-26) is met for all of them;
  // tests/stage-move-gate.live.test.ts covers that one.
  await admin!.gateDecision.create({
    data: { tenantId, opportunityId: o.id, gate: 'G0', passed: true, inputs: {}, ruleVersion: '1.0', decidedBy: `${RUN}-fixture` },
  });
  return o.id;
}
async function seat(opportunityId: string): Promise<string> {
  const s = await admin!.consortiumSeat.create({ data: { tenantId, opportunityId, roleKey: 'research' } });
  return s.id;
}
// The matcher's breakdown shape (seat-dimension-scale.ts MATCH_DIMENSION_SCALE): only rows
// written in this shape are candidates for the gate, the invite and the screens (K-579560=A).
const MATCH_BREAKDOWN = { topicExperience: 10, geographicBalance: 20, collabHistory: 5, rivalRisk: 0 };
// The retired consortium scorer's shape (NG-100): a row in the table that no reader may use.
const RETIRED_BREAKDOWN = {
  topicExperience: 3,
  networkCentrality: 2,
  countryDiversity: 1.5,
  smeBonus: 1,
  warmthBonus: 0,
  liveDemandSignal: 0,
};
// The pre-K-578751 matcher's 6-key shape: also a row no reader may use (K-580035=A).
const LEGACY_MATCH_BREAKDOWN = {
  topicExperience: 20,
  geographicBalance: 10,
  collabHistory: 10,
  relationshipWarmth: 5,
  centrality: 5,
  rivalRisk: 0,
};
const OLD_ROWS = [
  ['retired consortium', RETIRED_BREAKDOWN],
  ['pre-K-578751 matcher', LEGACY_MATCH_BREAKDOWN],
] as const;
async function candidate(
  seatId: string,
  organizationId: string,
  rank: number,
  owner = tenantId,
  breakdown: Record<string, number> = MATCH_BREAKDOWN,
) {
  await admin!.seatCandidate.create({
    data: { tenantId: owner, seatId, organizationId, score: 10 - rank, breakdown, rank },
  });
}
async function fillThroughM8(opportunityId: string, seatId: string) {
  await m8.inviteCandidateToSeat(seatId, SEATED, opportunityId);
  await m8.confirmSeatAssignment(seatId, opportunityId);
}
const stage = async (id: string) =>
  (await admin!.opportunity.findUniqueOrThrow({ where: { id }, select: { stage: true } })).stage;
const decisions = (opportunityId: string) =>
  admin!.gateDecision.findMany({ where: { opportunityId, gate: 'G1' }, select: { passed: true, inputs: true } });

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
    if (key === 'a') {
      tenantId = t.id;
      workspaceId = (await admin.workspace.create({ data: { tenantId: t.id, name: RUN, slug: RUN } })).id;
    } else {
      otherTenantId = t.id;
    }
  }
  state.scope = { ...state.scope, tenantId, userId: `${RUN}-user` };
  ready = true;
});

beforeEach((ctx) => {
  if (!ready) ctx.skip(skipReason);
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

describe('G1 on a real database', () => {
  test('no seats: refused, filed, stage stays', async () => {
    const opp = await opportunity('no seats');

    const result = await evaluateGate(opp, 'G1', tenantId);

    expect(result.passed).toBe(false);
    expect(result.reasons.join()).toMatch(/no critical seat/);
    expect(await stage(opp)).toBe('G0');
    expect(await decisions(opp)).toMatchObject([{ passed: false, inputs: { criticalSeatsCount: 0 } }]);
  });

  test('filled through M8 but no backup: refused, stage stays', async () => {
    const opp = await opportunity('no backup');
    const s = await seat(opp);
    await candidate(s, SEATED, 1);
    await fillThroughM8(opp, s);

    const result = await evaluateGate(opp, 'G1', tenantId);

    expect(result.reasons).toEqual(['Critical role research has no backup candidate']);
    expect(await stage(opp)).toBe('G0');
    expect(await decisions(opp)).toMatchObject([
      { passed: false, inputs: { unfilledCriticalRoles: [], criticalRolesWithoutBackup: ['research'] } },
    ]);
  });

  test('another tenant’s candidate row is not a backup', async () => {
    const opp = await opportunity('foreign backup');
    const s = await seat(opp);
    await candidate(s, SEATED, 1);
    await candidate(s, BACKUP, 2, otherTenantId);
    await fillThroughM8(opp, s);

    expect((await evaluateGate(opp, 'G1', tenantId)).passed).toBe(false);
  });

  test.each(OLD_ROWS)('the only backup is a %s row (K-580035=A): refused as no backup', async (label, breakdown) => {
    const opp = await opportunity(`old backup ${label}`);
    const s = await seat(opp);
    await candidate(s, SEATED, 1);
    await candidate(s, BACKUP, 2, tenantId, { ...breakdown });
    await fillThroughM8(opp, s);

    const result = await evaluateGate(opp, 'G1', tenantId);

    expect(result.reasons).toEqual(['Critical role research has no backup candidate']);
    expect(await decisions(opp)).toMatchObject([
      { passed: false, inputs: { criticalRolesWithoutBackup: ['research'] } },
    ]);
  });

  test.each(OLD_ROWS)('a %s row cannot be invited (K-580035=A)', async (label, breakdown) => {
    const opp = await opportunity(`old invite ${label}`);
    const s = await seat(opp);
    await candidate(s, BACKUP, 1, tenantId, { ...breakdown });

    await expect(m8.inviteCandidateToSeat(s, BACKUP, opp)).rejects.toThrow(/cannot be offered/);
    expect(await admin!.consortiumSeat.findUnique({ where: { id: s }, select: { status: true, organizationId: true } })).toMatchObject({
      status: 'OPEN',
      organizationId: null,
    });
  });

  test('filled through M8 with a backup: passes and the stage moves to G1', async () => {
    const opp = await opportunity('ready');
    const s = await seat(opp);
    await candidate(s, SEATED, 1);
    await candidate(s, BACKUP, 2);

    // Invited is not filled yet.
    await m8.inviteCandidateToSeat(s, SEATED, opp);
    expect((await evaluateGate(opp, 'G1', tenantId)).reasons).toEqual([
      'Critical role research is not filled: seat status is INVITED',
    ]);
    expect(await stage(opp)).toBe('G0');

    await m8.confirmSeatAssignment(s, opp);
    expect(await evaluateGate(opp, 'G1', tenantId)).toEqual({ passed: true, reasons: [] });
    expect(await stage(opp)).toBe('G1');
  });
});
