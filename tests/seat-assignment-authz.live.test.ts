import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isForbiddenRole } from '@/lib/forbidden-role';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { presentIds, requireId } from './helpers/teardown-guard';

/**
 * TASK-MUN509G2ICKWI (İNCELEME-36 Y-1) — who may put which organisation on a
 * consortium seat, and in which status.
 *
 * Before the fix `assignCandidateToSeat(seat, org, status, opp)` took `status`
 * and `organizationId` from the client with no role check: a MEMBER posted
 * `CONFIRMED` with a made-up PIC and the seat was confirmed (reproduced on an
 * isolated DB: `OPEN|null → CONFIRMED|<forged>`). The consortium page's
 * `assignSeat` wrote any PIC as INVITED, even over a confirmed seat.
 *
 * Every action runs for real over `fabrika_app` (NOBYPASSRLS, asserted); only
 * the session scope (with the role under test) and `revalidatePath` are
 * replaced. Each refusal also checks the seat row did not change.
 *
 * `.live`: needs the docker-compose Postgres and `pnpm db:rls-role`. Locally a
 * missing database skips the file; in CI it fails (tests/helpers/live-db-role.ts).
 */

const SUITE = 'seat-assignment-authz.live';
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');
const RUN = `seat-authz-${Date.now().toString(36)}`;

const state = vi.hoisted(() => ({
  rls: undefined as PrismaClient | undefined,
  scope: {
    tenantId: '',
    userId: '',
    role: 'MEMBER',
    workspaceIds: [] as string[],
    isPlatformAdmin: false,
  },
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
  return {
    ...actual,
    withTenant: (tenantId: string, cb: Parameters<typeof actual.withTenant>[1]) =>
      actual.withTenantOn(state.rls!, tenantId, cb),
  };
});
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const { createDbClient } = await import('@/lib/db');
const m8 = await import('@/modules/m8/server/actions');
const consortium = await import('@/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/actions');

let admin: PrismaClient | undefined;
let ready = false;
let skipReason = '';
const tenants: string[] = [];
let topicId = '';
let callId = '';
let createdProgramme = false;
/** Tenant A: `opp`, its seats, and a sibling opportunity on the same call. */
const a = { tenantId: '', opp: '', sibling: '', siblingSeat: '', seats: [] as string[] };
/** Tenant B: its own seat and candidate, used as the "other tenant's organisation". */
const b = { tenantId: '', seat: '' };

const ORG = `${RUN}-org-listed`;
const ORG_2 = `${RUN}-org-listed-2`;
const ORG_OTHER_TENANT = `${RUN}-org-b`;
const ORG_FORGED = `${RUN}-FORGED-PIC`;
/** Listed on tenant A's third seat only. */
const ORG_OTHER_SEAT = `${RUN}-org-other-seat`;

async function seat(id: string): Promise<string> {
  const r = await admin!.consortiumSeat.findUniqueOrThrow({
    where: { id },
    select: { status: true, organizationId: true },
  });
  return `${r.status}|${r.organizationId}`;
}

async function setSeat(id: string, status: 'OPEN' | 'INVITED' | 'CONFIRMED' | 'DECLINED', organizationId: string | null) {
  await admin!.consortiumSeat.update({ where: { id }, data: { status, organizationId } });
}

/** Runs `call`, returns what it answered or `threw: <message>`. */
async function outcome(call: () => Promise<unknown>): Promise<unknown> {
  try {
    return await call();
  } catch (e) {
    return `threw: ${e instanceof Error ? e.message : String(e)}`;
  }
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

  // A call with one topic, so the confirm-conflict rule has something to match.
  if (!(await admin.programme.findUnique({ where: { id: 'HE' } }))) {
    await admin.programme.create({ data: { id: 'HE', name: 'Horizon Europe', sourceKey: 'he' } });
    createdProgramme = true;
  }
  callId = (await admin.call.create({ data: { programmeId: 'HE', callIdentifier: RUN, title: RUN } })).id;
  topicId = (
    await admin.topic.create({ data: { callId, identifier: `${RUN}-T1`, title: RUN, deadlines: [] } })
  ).id;

  for (const key of ['a', 'b'] as const) {
    const t = await admin.tenant.create({
      data: { name: `${RUN} ${key}`, slug: `${RUN}-${key}`, country: 'TR', kind: 'ORGANIZATION' },
      select: { id: true },
    });
    tenants.push(t.id);
    const ws = await admin.workspace.create({ data: { tenantId: t.id, name: RUN, slug: `${RUN}-${key}` } });
    const opp = await admin.opportunity.create({
      data: { tenantId: t.id, workspaceId: ws.id, title: `${RUN} ${key}`, topicId },
    });
    if (key === 'a') {
      a.tenantId = t.id;
      a.opp = opp.id;
      for (const role of ['research', 'industry', 'end_user']) {
        const s = await admin.consortiumSeat.create({ data: { tenantId: t.id, opportunityId: opp.id, roleKey: role } });
        a.seats.push(s.id);
        for (const [rank, org] of [ORG, ORG_2].entries()) {
          await admin.seatCandidate.create({
            data: { tenantId: t.id, seatId: s.id, organizationId: org, score: 2 - rank, breakdown: {}, rank: rank + 1 },
          });
        }
      }
      await admin.seatCandidate.create({
        data: { tenantId: t.id, seatId: a.seats[2]!, organizationId: ORG_OTHER_SEAT, score: 0, breakdown: {}, rank: 3 },
      });
      const sib = await admin.opportunity.create({
        data: { tenantId: t.id, workspaceId: ws.id, title: `${RUN} sibling`, topicId },
      });
      a.sibling = sib.id;
      a.siblingSeat = (
        await admin.consortiumSeat.create({
          data: { tenantId: t.id, opportunityId: sib.id, roleKey: 'research', organizationId: ORG_2, status: 'CONFIRMED' },
        })
      ).id;
    } else {
      b.tenantId = t.id;
      b.seat = (await admin.consortiumSeat.create({ data: { tenantId: t.id, opportunityId: opp.id, roleKey: 'research' } })).id;
      await admin.seatCandidate.create({
        data: { tenantId: t.id, seatId: b.seat, organizationId: ORG_OTHER_TENANT, score: 1, breakdown: {}, rank: 1 },
      });
    }
  }
  state.scope = { ...state.scope, tenantId: a.tenantId, userId: `${RUN}-user` };
  ready = true;
});

beforeEach(async (ctx) => {
  if (!ready) ctx.skip(skipReason);
  state.scope.role = 'MEMBER';
  for (const id of a.seats) await setSeat(id, 'OPEN', null);
});

afterAll(async () => {
  if (admin) {
    // SeatCandidate and ConsortiumSeat have no FK to Tenant; delete them by tenant first.
    await admin.seatCandidate.deleteMany({ where: { tenantId: { in: presentIds(tenants) } } }).catch(() => {});
    await admin.consortiumSeat.deleteMany({ where: { tenantId: { in: presentIds(tenants) } } }).catch(() => {});
    for (const id of presentIds(tenants)) await admin.tenant.delete({ where: { id } }).catch(() => {});
    if (topicId) await admin.topic.delete({ where: { id: requireId(topicId, 'topicId') } }).catch(() => {});
    if (callId) await admin.call.delete({ where: { id: requireId(callId, 'callId') } }).catch(() => {});
    if (createdProgramme) await admin.programme.delete({ where: { id: 'HE' } }).catch(() => {});
  }
  await Promise.all([state.rls, admin].map((c) => c?.$disconnect().catch(() => {})));
});

describe('M8 "Davet Et" (inviteCandidateToSeat)', () => {
  test('a MEMBER invites a listed candidate: the seat becomes INVITED with that organisation', async () => {
    const [s] = a.seats as [string];
    expect(await outcome(() => m8.inviteCandidateToSeat(s, ORG, a.opp))).toBeUndefined();
    expect(await seat(s)).toBe(`INVITED|${ORG}`);
  });

  test.each([
    ['a made-up PIC', ORG_FORGED],
    ["another tenant's candidate", ORG_OTHER_TENANT],
    ["a candidate of another seat of the same opportunity", ORG_OTHER_SEAT],
    ['an empty organisation', ''],
  ])('refuses %s and leaves the seat as it was', async (_label, org) => {
    const [s] = a.seats as [string];
    expect(await outcome(() => m8.inviteCandidateToSeat(s, org, a.opp))).toMatch(/^threw: /);
    expect(await seat(s)).toBe('OPEN|null');
  });

  test("refuses another seat's candidate list: an organisation listed on tenant B's seat cannot be invited to it from tenant A", async () => {
    expect(await outcome(() => m8.inviteCandidateToSeat(b.seat, ORG_OTHER_TENANT, a.opp))).toMatch(/^threw: /);
    expect(await seat(b.seat)).toBe('OPEN|null');
  });

  test('does not overwrite a confirmed seat', async () => {
    const [s] = a.seats as [string];
    await setSeat(s, 'CONFIRMED', ORG);
    expect(await outcome(() => m8.inviteCandidateToSeat(s, ORG_2, a.opp))).toMatch(/^threw: /);
    expect(await seat(s)).toBe(`CONFIRMED|${ORG}`);
  });

  test("a seat of another opportunity is not invited through this opportunity's id", async () => {
    await admin!.seatCandidate.create({
      data: { tenantId: a.tenantId, seatId: a.siblingSeat, organizationId: ORG, score: 1, breakdown: {}, rank: 1 },
    });
    await setSeat(a.siblingSeat, 'OPEN', null);
    expect(await outcome(() => m8.inviteCandidateToSeat(a.siblingSeat, ORG, a.opp))).toMatch(/^threw: /);
    expect(await seat(a.siblingSeat)).toBe('OPEN|null');
    await setSeat(a.siblingSeat, 'CONFIRMED', ORG_2);
  });

  test('a CONFIRMED seat that names no organisation (seed data) can still be offered', async () => {
    const [s] = a.seats as [string];
    await setSeat(s, 'CONFIRMED', null);
    expect(await outcome(() => m8.inviteCandidateToSeat(s, ORG, a.opp))).toBeUndefined();
    expect(await seat(s)).toBe(`INVITED|${ORG}`);
  });

  test('the old four-argument call carrying CONFIRMED writes nothing', async () => {
    const [s] = a.seats as [string];
    // A client built before the fix posts (seat, org, status, opportunity).
    const legacy = m8.inviteCandidateToSeat as unknown as (...args: string[]) => Promise<unknown>;
    expect(await outcome(() => legacy(s, ORG_FORGED, 'CONFIRMED', a.opp))).toMatch(/^threw: /);
    expect(await outcome(() => legacy(s, ORG, 'CONFIRMED', a.opp))).toMatch(/^threw: /);
    expect(await seat(s)).toBe('OPEN|null');
  });
});

describe('M8 confirmSeatAssignment', () => {
  test.each(['MEMBER', 'WRITER', 'GUEST_PARTNER', 'NOT_A_ROLE'])('%s cannot confirm, and the seat stays INVITED', async (role) => {
    const [s] = a.seats as [string];
    await setSeat(s, 'INVITED', ORG);
    state.scope.role = role;
    expect(await outcome(() => m8.confirmSeatAssignment(s, a.opp))).toMatch(/^threw: /);
    expect(await seat(s)).toBe(`INVITED|${ORG}`);
  });

  test.each(['PIPELINE_MANAGER', 'TENANT_ADMIN', 'TENANT_OWNER'])('%s confirms the organisation already invited', async (role) => {
    const [, s] = a.seats as [string, string];
    await setSeat(s, 'INVITED', ORG);
    state.scope.role = role;
    expect(await outcome(() => m8.confirmSeatAssignment(s, a.opp))).toBeUndefined();
    expect(await seat(s)).toBe(`CONFIRMED|${ORG}`);
  });

  test('a seat that was never invited cannot be confirmed, even by a pipeline manager', async () => {
    const [s] = a.seats as [string];
    state.scope.role = 'PIPELINE_MANAGER';
    expect(await outcome(() => m8.confirmSeatAssignment(s, a.opp))).toMatch(/^threw: /);
    expect(await seat(s)).toBe('OPEN|null');
  });

  test('a declined seat that still names an organisation cannot be confirmed', async () => {
    const [s] = a.seats as [string];
    await setSeat(s, 'DECLINED', ORG);
    state.scope.role = 'PIPELINE_MANAGER';
    expect(await outcome(() => m8.confirmSeatAssignment(s, a.opp))).toMatch(/^threw: /);
    expect(await seat(s)).toBe(`DECLINED|${ORG}`);
  });

  test("a seat of another opportunity cannot be confirmed through this opportunity's id", async () => {
    await setSeat(a.siblingSeat, 'INVITED', ORG);
    state.scope.role = 'PIPELINE_MANAGER';
    expect(await outcome(() => m8.confirmSeatAssignment(a.siblingSeat, a.opp))).toMatch(/^threw: /);
    expect(await seat(a.siblingSeat)).toBe(`INVITED|${ORG}`);
    await setSeat(a.siblingSeat, 'CONFIRMED', ORG_2);
  });

  test("another tenant's seat cannot be confirmed", async () => {
    await admin!.consortiumSeat.update({ where: { id: b.seat }, data: { status: 'INVITED', organizationId: ORG_OTHER_TENANT } });
    state.scope.role = 'TENANT_OWNER';
    expect(await outcome(() => m8.confirmSeatAssignment(b.seat, a.opp))).toMatch(/^threw: /);
    expect(await seat(b.seat)).toBe(`INVITED|${ORG_OTHER_TENANT}`);
    await setSeat(b.seat, 'OPEN', null);
  });

  test('the same-call conflict rule still holds: an organisation confirmed on a sibling opportunity is refused', async () => {
    const [, , s] = a.seats as [string, string, string];
    await setSeat(s, 'INVITED', ORG_2);
    state.scope.role = 'PIPELINE_MANAGER';
    expect(await outcome(() => m8.confirmSeatAssignment(s, a.opp))).toMatch(/^threw: Conflict: /);
    expect(await seat(s)).toBe(`INVITED|${ORG_2}`);
    expect(await seat(a.siblingSeat)).toBe(`CONFIRMED|${ORG_2}`);
  });
});

describe('confirmSeatAssignment on the topic reference a user-made opportunity holds', () => {
  test('the same-call conflict is refused when both opportunities carry the portal identifier', async () => {
    const [, , s] = a.seats as [string, string, string];
    await setSeat(s, 'INVITED', ORG_2);
    state.scope.role = 'PIPELINE_MANAGER';
    await admin!.opportunity.updateMany({ where: { id: { in: [a.opp, a.sibling] } }, data: { topicId: `${RUN}-T1` } });
    try {
      expect(await outcome(() => m8.confirmSeatAssignment(s, a.opp))).toMatch(/^threw: Conflict: /);
      expect(await seat(s)).toBe(`INVITED|${ORG_2}`);
    } finally {
      await admin!.opportunity.updateMany({ where: { id: { in: [a.opp, a.sibling] } }, data: { topicId } });
    }
  });
});

describe('consortium page confirmation button (confirmSeat)', () => {
  /** Runs `body` with both opportunities holding what the board form writes: the portal identifier. */
  async function onIdentifier(body: () => Promise<void>, ids: string[] = [a.opp, a.sibling]) {
    await admin!.opportunity.updateMany({ where: { id: { in: presentIds(ids) } }, data: { topicId: `${RUN}-T1` } });
    try {
      await body();
    } finally {
      await admin!.opportunity.updateMany({ where: { id: { in: presentIds(ids) } }, data: { topicId } });
    }
  }

  test('confirms the organisation on screen and answers ok', async () => {
    const [s] = a.seats as [string];
    await setSeat(s, 'INVITED', ORG);
    state.scope.role = 'PIPELINE_MANAGER';
    expect(await consortium.confirmSeat(s, a.opp, ORG)).toEqual({ ok: true });
    expect(await seat(s)).toBe(`CONFIRMED|${ORG}`);
  });

  test.each(['MEMBER', 'WRITER', 'GUEST_PARTNER', 'NOT_A_ROLE'])('%s leaves with the role refusal, and the seat stays INVITED', async (role) => {
    const [s] = a.seats as [string];
    await setSeat(s, 'INVITED', ORG);
    state.scope.role = role;
    const err = await consortium.confirmSeat(s, a.opp, ORG).catch((e: unknown) => e);
    expect(isForbiddenRole(err)).toBe(true);
    expect(await seat(s)).toBe(`INVITED|${ORG}`);
  });

  test.each([
    ['never invited', 'OPEN', null],
    ['declined', 'DECLINED', ORG],
    ['already confirmed', 'CONFIRMED', ORG],
  ] as const)('a seat %s writes nothing and is no success', async (_label, status, org) => {
    const [s] = a.seats as [string];
    await setSeat(s, status, org);
    state.scope.role = 'PIPELINE_MANAGER';
    expect(await consortium.confirmSeat(s, a.opp, ORG)).toEqual({ ok: false, code: 'seatNotConfirmable' });
    expect(await seat(s)).toBe(`${status}|${org}`);
  });

  test('a seat re-invited to another organisation is not confirmed for the one on screen', async () => {
    const [s] = a.seats as [string];
    await setSeat(s, 'INVITED', ORG);
    state.scope.role = 'PIPELINE_MANAGER';
    expect(await consortium.confirmSeat(s, a.opp, ORG_FORGED)).toEqual({ ok: false, code: 'seatNotConfirmable' });
    expect(await seat(s)).toBe(`INVITED|${ORG}`);
  });

  test("a seat of another tenant or another opportunity is no success", async () => {
    await setSeat(a.siblingSeat, 'INVITED', ORG);
    state.scope.role = 'TENANT_OWNER';
    expect(await consortium.confirmSeat(a.siblingSeat, a.opp, ORG)).toEqual({ ok: false, code: 'seatNotConfirmable' });
    expect(await seat(a.siblingSeat)).toBe(`INVITED|${ORG}`);
    await setSeat(a.siblingSeat, 'CONFIRMED', ORG_2);
    await admin!.consortiumSeat.update({ where: { id: b.seat }, data: { status: 'INVITED', organizationId: ORG_OTHER_TENANT } });
    expect(await consortium.confirmSeat(b.seat, a.opp, ORG_OTHER_TENANT)).toEqual({ ok: false, code: 'seatNotConfirmable' });
    expect(await seat(b.seat)).toBe(`INVITED|${ORG_OTHER_TENANT}`);
    await setSeat(b.seat, 'OPEN', null);
  });

  test('a same-call conflict answers a code: the other opportunity stays off the wire', async () => {
    const [, , s] = a.seats as [string, string, string];
    await setSeat(s, 'INVITED', ORG_2);
    state.scope.role = 'PIPELINE_MANAGER';
    const answer = await consortium.confirmSeat(s, a.opp, ORG_2);
    expect(answer).toEqual({ ok: false, code: 'seatConfirmConflict' });
    expect(JSON.stringify(answer)).not.toContain('sibling');
    expect(await seat(s)).toBe(`INVITED|${ORG_2}`);
  });

  // The board form and the call page store the portal identifier in `Opportunity.topicId`, not the
  // Topic's id (src/lib/scoring/g0-compute.ts says so), so looking the topic up by id alone left the
  // rule asleep on every opportunity a user opens.
  test('the conflict rule holds when both opportunities carry the portal identifier', async () => {
    const [, , s] = a.seats as [string, string, string];
    await setSeat(s, 'INVITED', ORG_2);
    state.scope.role = 'PIPELINE_MANAGER';
    await onIdentifier(async () => {
      expect(await consortium.confirmSeat(s, a.opp, ORG_2)).toEqual({ ok: false, code: 'seatConfirmConflict' });
    });
    expect(await seat(s)).toBe(`INVITED|${ORG_2}`);
  });

  test.each([
    ['this opportunity on the identifier, the other on the id', () => [a.opp]],
    ['this opportunity on the id, the other on the identifier', () => [a.sibling]],
  ])('and with %s', async (_label, ids) => {
    const [, , s] = a.seats as [string, string, string];
    await setSeat(s, 'INVITED', ORG_2);
    state.scope.role = 'PIPELINE_MANAGER';
    await onIdentifier(async () => {
      expect(await consortium.confirmSeat(s, a.opp, ORG_2)).toEqual({ ok: false, code: 'seatConfirmConflict' });
    }, ids());
    expect(await seat(s)).toBe(`INVITED|${ORG_2}`);
  });

  test("another tenant's confirmed seat on the same call is no conflict", async () => {
    const [s] = a.seats as [string];
    await setSeat(s, 'INVITED', ORG);
    await setSeat(b.seat, 'CONFIRMED', ORG);
    state.scope.role = 'PIPELINE_MANAGER';
    expect(await consortium.confirmSeat(s, a.opp, ORG)).toEqual({ ok: true });
    expect(await seat(s)).toBe(`CONFIRMED|${ORG}`);
    await setSeat(b.seat, 'OPEN', null);
  });
});

describe('consortium page "Invite" (assignSeat)', () => {
  test('invites a listed candidate', async () => {
    const [s] = a.seats as [string];
    expect(await consortium.assignSeat(s, ORG)).toEqual({ success: true });
    expect(await seat(s)).toBe(`INVITED|${ORG}`);
  });

  test.each([
    ['a made-up PIC', ORG_FORGED],
    ["another tenant's candidate", ORG_OTHER_TENANT],
    ["a candidate of another seat of the same opportunity", ORG_OTHER_SEAT],
  ])('refuses %s', async (_label, org) => {
    const [s] = a.seats as [string];
    expect(await consortium.assignSeat(s, org)).toEqual({ success: false });
    expect(await seat(s)).toBe('OPEN|null');
  });

  test('does not overwrite a confirmed seat', async () => {
    const [s] = a.seats as [string];
    await setSeat(s, 'CONFIRMED', ORG);
    expect(await consortium.assignSeat(s, ORG_2)).toEqual({ success: false });
    expect(await seat(s)).toBe(`CONFIRMED|${ORG}`);
  });
});
