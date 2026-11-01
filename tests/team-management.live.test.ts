import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { presentIds } from './helpers/teardown-guard';

/**
 * TASK-MUPUHBAE811KP (QA Y-3) — the team routes: list members and pending
 * invitations, cancel an invitation, remove a member.
 *
 * Runs for real over `fabrika_app` (NOBYPASSRLS, asserted). Only the session
 * (`auth()`) is replaced; `requireTenantApi` itself runs, so the role check
 * and the expired-pilot refusal are the production ones. Every refusal also
 * checks the rows did not change.
 *
 * `.live`: needs the docker-compose Postgres and `pnpm db:rls-role`.
 */

const SUITE = 'team-management.live';
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');
const RUN = `team-${Date.now().toString(36)}`;

const state = vi.hoisted(() => ({
  rls: undefined as PrismaClient | undefined,
  session: null as null | Record<string, unknown>,
}));

vi.mock('@/lib/auth', () => ({ auth: async () => state.session }));
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    withTenant: (tenantId: string, cb: Parameters<typeof actual.withTenant>[1]) =>
      actual.withTenantOn(state.rls!, tenantId, cb),
  };
});

const { createDbClient, withTenant: withTenantFn } = await import('@/lib/db');
const list = await import('@/app/api/team/route');
const cancelInvite = await import('@/app/api/team/invitations/[id]/route');
const removeMember = await import('@/app/api/team/members/[id]/route');
const { readSeatUsage, hasFreeSeat } = await import('@/lib/billing/seat-limit');

let admin: PrismaClient | undefined;
let ready = false;
let skipReason = '';
const tenants: string[] = [];
const users: string[] = [];

interface Ctx {
  tenantId: string;
  owner: { userId: string; membershipId: string };
  admin: { userId: string; membershipId: string };
  member: { userId: string; membershipId: string };
  owner2: { userId: string; membershipId: string };
  inviteId: string;
}
let a: Ctx;
let b: Ctx;

async function makeTenant(key: string): Promise<Ctx> {
  const t = await admin!.tenant.create({
    data: { name: `${RUN} ${key}`, slug: `${RUN}-${key}`, country: 'TR', kind: 'ORGANIZATION' },
    select: { id: true },
  });
  tenants.push(t.id);
  const person = async (role: 'TENANT_OWNER' | 'TENANT_ADMIN' | 'MEMBER', n: string) => {
    const u = await admin!.user.create({ data: { email: `${RUN}-${key}-${n}@example.com`, name: `${key} ${n}` } });
    users.push(u.id);
    const m = await admin!.membership.create({ data: { tenantId: t.id, userId: u.id, role } });
    return { userId: u.id, membershipId: m.id };
  };
  const owner = await person('TENANT_OWNER', 'owner');
  const adminP = await person('TENANT_ADMIN', 'admin');
  const member = await person('MEMBER', 'member');
  const owner2 = await person('TENANT_OWNER', 'owner2');
  const inv = await admin!.invitation.create({
    data: { tenantId: t.id, email: `${RUN}-${key}-typo@example.com`, tokenHash: `${RUN}-${key}-hash`, expires: new Date(Date.now() + 6 * 864e5) },
  });
  return { tenantId: t.id, owner, admin: adminP, member, owner2, inviteId: inv.id };
}

function as(ctx: Ctx, who: 'owner' | 'admin' | 'member' | 'owner2') {
  const role = { owner: 'TENANT_OWNER', owner2: 'TENANT_OWNER', admin: 'TENANT_ADMIN', member: 'MEMBER' }[who];
  state.session = { user: { id: ctx[who].userId, email: 'x@example.com' }, tenantId: ctx.tenantId, role, workspaceIds: [] };
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const del = (route: { DELETE: (r: Request, c: { params: Promise<{ id: string }> }) => Promise<Response> }, id: string) =>
  route.DELETE(new Request('http://localhost/x', { method: 'DELETE' }), params(id));

const memberCount = (tenantId: string) => admin!.membership.count({ where: { tenantId } });
const seats = (tenantId: string) =>
  withTenantFn(tenantId, (tx) => readSeatUsage(tx, tenantId, 'nobody@example.com'));

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
  a = await makeTenant('a');
  b = await makeTenant('b');
  ready = true;
});

beforeEach(async (ctx) => {
  if (!ready) ctx.skip(skipReason);
});

afterAll(async () => {
  if (admin) {
    await admin.subscription.deleteMany({ where: { tenantId: { in: presentIds(tenants) } } }).catch(() => {});
    for (const id of presentIds(tenants)) await admin.tenant.delete({ where: { id } }).catch(() => {});
    await admin.user.deleteMany({ where: { id: { in: presentIds(users) } } }).catch(() => {});
  }
  await Promise.all([state.rls, admin].map((c) => c?.$disconnect().catch(() => {})));
});

describe('GET /api/team', () => {
  test('an owner sees members and pending invitations — and no token', async () => {
    as(a, 'owner');
    const res = await list.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.members.map((m: { id: string }) => m.id).sort()).toEqual(
      [a.owner, a.admin, a.member, a.owner2].map((p) => p.membershipId).sort()
    );
    expect(body.invitations).toHaveLength(1);
    expect(body.invitations[0].id).toBe(a.inviteId);
    expect(JSON.stringify(body)).not.toMatch(/tokenHash|-hash/);
    expect(body.me).toEqual({ userId: a.owner.userId, role: 'TENANT_OWNER' });
  });

  test('an admin may list; a MEMBER gets 403 FORBIDDEN_ROLE', async () => {
    as(a, 'admin');
    expect((await list.GET()).status).toBe(200);
    as(a, 'member');
    const res = await list.GET();
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('FORBIDDEN_ROLE');
  });

  test('no session: 401; another tenant never appears in the list', async () => {
    state.session = null;
    expect((await list.GET()).status).toBe(401);
    as(b, 'owner');
    const body = await (await list.GET()).json();
    const ids = body.members.map((m: { id: string }) => m.id);
    expect(ids).not.toContain(a.owner.membershipId);
    expect(body.invitations.map((i: { id: string }) => i.id)).toEqual([b.inviteId]);
  });

  test('an expired or accepted invitation is not pending', async () => {
    await admin!.invitation.create({
      data: { tenantId: a.tenantId, email: `${RUN}-old@example.com`, tokenHash: `${RUN}-old`, expires: new Date(Date.now() - 864e5) },
    });
    await admin!.invitation.create({
      data: { tenantId: a.tenantId, email: `${RUN}-acc@example.com`, tokenHash: `${RUN}-acc`, expires: new Date(Date.now() + 864e5), acceptedAt: new Date() },
    });
    as(a, 'owner');
    const body = await (await list.GET()).json();
    expect(body.invitations.map((i: { id: string }) => i.id)).toEqual([a.inviteId]);
  });
});

describe('DELETE /api/team/invitations/[id]', () => {
  test('a MEMBER gets 403 and the invitation stays', async () => {
    as(a, 'member');
    expect((await del(cancelInvite, a.inviteId)).status).toBe(403);
    expect(await admin!.invitation.count({ where: { id: a.inviteId } })).toBe(1);
  });

  test("another tenant's invitation id is 404 and the row stays", async () => {
    as(b, 'owner');
    const res = await del(cancelInvite, a.inviteId);
    expect(res.status).toBe(404);
    expect(await admin!.invitation.count({ where: { id: a.inviteId } })).toBe(1);
  });

  test('an accepted invitation (a member now) is not cancellable', async () => {
    const acc = await admin!.invitation.findFirstOrThrow({ where: { tenantId: a.tenantId, acceptedAt: { not: null } } });
    as(a, 'owner');
    expect((await del(cancelInvite, acc.id)).status).toBe(404);
    expect(await admin!.invitation.count({ where: { id: acc.id } })).toBe(1);
  });

  test('the owner cancels: row gone, one audit row, and the seat count drops by one', async () => {
    const before = await seats(a.tenantId);
    as(a, 'owner');
    const res = await del(cancelInvite, a.inviteId);
    expect(res.status).toBe(200);
    expect(await admin!.invitation.count({ where: { id: a.inviteId } })).toBe(0);
    const audit = await admin!.auditEvent.findMany({ where: { tenantId: a.tenantId, type: 'invitation.cancelled' } });
    expect(audit).toHaveLength(1);
    expect(audit[0]!.actorId).toBe(a.owner.userId);
    expect(audit[0]!.target).toBe(a.inviteId);
    const after = await seats(a.tenantId);
    expect(after.pendingInvitations).toBe(before.pendingInvitations - 1);
    expect(after.members).toBe(before.members);
    // the seat is really free: at a limit of members + 1 an invite is possible again
    expect(hasFreeSeat({ ...after, limit: after.members + after.pendingInvitations + 1 })).toBe(true);
    expect(hasFreeSeat({ ...before, limit: before.members + before.pendingInvitations })).toBe(false);
    // second cancel: gone
    expect((await del(cancelInvite, a.inviteId)).status).toBe(404);
  });
});

describe('DELETE /api/team/members/[id]', () => {
  test('a MEMBER gets 403 and nobody is removed', async () => {
    as(a, 'member');
    const n = await memberCount(a.tenantId);
    expect((await del(removeMember, a.admin.membershipId)).status).toBe(403);
    expect(await memberCount(a.tenantId)).toBe(n);
  });

  test("another tenant's membership id is 404", async () => {
    as(b, 'owner');
    expect((await del(removeMember, a.member.membershipId)).status).toBe(404);
    expect(await admin!.membership.count({ where: { id: a.member.membershipId } })).toBe(1);
  });

  test('you cannot remove yourself', async () => {
    as(a, 'admin');
    const res = await del(removeMember, a.admin.membershipId);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('CANNOT_REMOVE_SELF');
    expect(await admin!.membership.count({ where: { id: a.admin.membershipId } })).toBe(1);
  });

  test('an admin cannot remove an owner', async () => {
    as(a, 'admin');
    const res = await del(removeMember, a.owner.membershipId);
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('CANNOT_REMOVE_OWNER');
    expect(await admin!.membership.count({ where: { id: a.owner.membershipId } })).toBe(1);
  });

  test('the owner removes a member: row gone, seat freed, audit written, access cut', async () => {
    const before = await seats(a.tenantId);
    as(a, 'owner');
    const res = await del(removeMember, a.member.membershipId);
    expect(res.status).toBe(200);
    expect(await admin!.membership.count({ where: { id: a.member.membershipId } })).toBe(0);
    expect((await seats(a.tenantId)).members).toBe(before.members - 1);
    const audit = await admin!.auditEvent.findMany({ where: { tenantId: a.tenantId, type: 'member.removed' } });
    expect(audit).toHaveLength(1);
    expect(audit[0]!.target).toBe(a.member.membershipId);
    // The removed person's user row survives; only the tenant link is gone.
    expect(await admin!.user.count({ where: { id: a.member.userId } })).toBe(1);
    expect(await admin!.membership.count({ where: { userId: a.member.userId } })).toBe(0);
  });

  test('the last owner is protected; with two owners one may be removed, then the other not', async () => {
    // owner removes owner2 (two owners -> one)
    as(a, 'owner');
    expect((await del(removeMember, a.owner2.membershipId)).status).toBe(200);
    // now owner is the only owner: nobody (not even a second session as owner) can remove them
    as(b, 'owner');
    // tenant b has two owners; remove one, then the sole remaining one cannot be removed by an owner-role caller
    expect((await del(removeMember, b.owner2.membershipId)).status).toBe(200);
    // an owner-role session of tenant b that is not the sole owner row: simulate a stale session of the removed owner2
    state.session = { user: { id: b.owner2.userId }, tenantId: b.tenantId, role: 'TENANT_OWNER', workspaceIds: [] };
    const res = await del(removeMember, b.owner.membershipId);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('LAST_OWNER');
    expect(await admin!.membership.count({ where: { id: b.owner.membershipId } })).toBe(1);
  });
});

describe('expired pilot', () => {
  test('writes are refused (403 PILOT_EXPIRED) but the list still reads', async () => {
    await admin!.subscription.create({
      data: { tenantId: a.tenantId, planId: 'pilot', status: 'TRIALING', provider: 'pilot', trialEndsAt: new Date(Date.now() - 864e5) },
    });
    const inv = await admin!.invitation.create({
      data: { tenantId: a.tenantId, email: `${RUN}-late@example.com`, tokenHash: `${RUN}-late`, expires: new Date(Date.now() + 864e5) },
    });
    as(a, 'owner');
    const res = await del(cancelInvite, inv.id);
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('PILOT_EXPIRED');
    expect(await admin!.invitation.count({ where: { id: inv.id } })).toBe(1);
    const n = await memberCount(a.tenantId);
    expect((await del(removeMember, a.admin.membershipId)).status).toBe(403);
    expect(await memberCount(a.tenantId)).toBe(n);
    expect((await list.GET()).status).toBe(200);
  });
});
