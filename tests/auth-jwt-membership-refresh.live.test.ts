import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { envValue } from './helpers/dotenv';
import { skipOrFailInCi, requireTestEnv } from './helpers/live-db-role';
import { requireId } from './helpers/teardown-guard';

/**
 * TASK-MUNQB0GR306U0 (İNCELEME-59 Y-2) — a role or tenant taken away in the
 * database is gone from the very next request, not when the token expires.
 *
 * The session cookie is minted once, as a sign-in would (the jwt callback with
 * `trigger: 'signIn'`, then Auth.js's own `encode`), and the browser keeps
 * sending that same cookie. Each request is the REAL `auth()` from
 * src/lib/auth.ts: it decodes the cookie, runs the jwt and session callbacks
 * against the database, and the server action reads the result through
 * requireTenantAction. Only `next/headers` (the cookie) and `revalidatePath`
 * are replaced.
 *
 * The app's own client is used, as in production (the jwt callback runs
 * outside any tenant scope). Every row is created here and deleted by its id.
 */

const SUITE = 'auth-jwt-membership-refresh.live';
const RUN = `jwt-${Date.now().toString(36)}`;
const COOKIE = 'authjs.session-token';

// The browser's cookie jar: every cookie the server sets comes back on the next
// request, the session cookie that `unstable_update` re-mints included.
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  headers: async () =>
    new Headers({
      host: 'localhost:3000',
      'x-forwarded-proto': 'http',
      cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
    }),
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void (value ? jar.set(name, value) : jar.delete(name)),
    delete: (name: string) => void jar.delete(name),
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
// The accept action's error strings; the keys are enough here.
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));

let admin: PrismaClient | undefined;
let lib:
  | {
      auth: typeof import('../src/lib/auth');
      evidence: typeof import('../src/app/[locale]/(app)/[workspace]/evidence/actions');
      acceptActions: typeof import('../src/app/[locale]/accept-invite/continue/actions');
      acceptCookie: typeof import('../src/lib/invitations/accept-cookie');
      token: typeof import('../src/lib/secret-token');
      encode: typeof import('next-auth/jwt').encode;
    }
  | undefined;
let ready = false;
let skipReason = '';
const ids = { tenantA: '', tenantB: '', user: '', membershipA: '' };
/** Every row id this file created, across tests, for the teardown. */
const created = { tenants: [] as string[], users: [] as string[] };

async function outcome(p: Promise<unknown>): Promise<string> {
  try {
    return `ok:${JSON.stringify(await p)}`;
  } catch (e) {
    const err = e as { digest?: string; code?: string; message?: string };
    return `throw:${err.digest ?? err.code ?? err.message}`;
  }
}

async function evidenceRow(label: string): Promise<string> {
  const row = await admin!.evidence.create({
    data: { tenantId: ids.tenantA, kind: 'corporate', title: `${RUN} ${label}`, body: 'x' },
  });
  return row.id;
}

beforeAll(async () => {
  const url = envValue('DATABASE_URL');
  if (!url) {
    skipReason = 'DATABASE_URL is not set';
    skipOrFailInCi(SUITE, skipReason);
    return;
  }
  if (!requireTestEnv('AUTH_SECRET', SUITE)) {
    skipReason = 'AUTH_SECRET is not set';
    return;
  }
  try {
    const db = await import('../src/lib/db');
    admin = db.prisma;
    await admin.$queryRaw`SELECT 1`;
  } catch (e) {
    skipReason = `database unavailable: ${e instanceof Error ? e.message : String(e)}`;
    skipOrFailInCi(SUITE, skipReason);
    return;
  }
  lib = {
    auth: await import('../src/lib/auth'),
    evidence: await import('../src/app/[locale]/(app)/[workspace]/evidence/actions'),
    acceptActions: await import('../src/app/[locale]/accept-invite/continue/actions'),
    acceptCookie: await import('../src/lib/invitations/accept-cookie'),
    token: await import('../src/lib/secret-token'),
    encode: (await import('next-auth/jwt')).encode,
  };
  ready = true;
});

beforeEach(async (ctx) => {
  if (!ready) ctx.skip(skipReason);
  // Two tenants, A older than B, the user an owner of both: a sign-in picks A.
  const a = await admin!.tenant.create({ data: { name: `${RUN} A`, slug: `${RUN}-a-${Math.random().toString(36).slice(2, 8)}`, country: 'TR' } });
  ids.tenantA = a.id;
  created.tenants.push(a.id);
  const b = await admin!.tenant.create({ data: { name: `${RUN} B`, slug: `${RUN}-b-${Math.random().toString(36).slice(2, 8)}`, country: 'TR' } });
  ids.tenantB = b.id;
  created.tenants.push(b.id);
  const u = await admin!.user.create({ data: { email: `${RUN}-${Math.random().toString(36).slice(2, 8)}@example.invalid`, name: 'Owner' } });
  ids.user = u.id;
  created.users.push(u.id);
  ids.membershipA = (
    await admin!.membership.create({
      data: { tenantId: a.id, userId: u.id, role: 'TENANT_OWNER', createdAt: new Date(Date.now() - 60_000) },
    })
  ).id;
  await admin!.membership.create({ data: { tenantId: b.id, userId: u.id, role: 'TENANT_OWNER' } });

  // Sign-in: the claims Auth.js would put in the cookie, sealed with its own encode.
  const jwt = lib!.auth.authConfig.callbacks!.jwt!;
  const claims = await jwt({
    token: { sub: u.id, email: u.email },
    user: { id: u.id, email: u.email, name: u.name },
    trigger: 'signIn',
  } as never);
  jar.clear();
  jar.set(COOKIE, await lib!.encode({ token: claims as never, secret: process.env.AUTH_SECRET!, salt: COOKIE }));
});

afterAll(async () => {
  if (!admin) return;
  // Tenants cascade to their memberships and evidence.
  for (const id of created.tenants) await admin.tenant.delete({ where: { id: requireId(id, 'tenant') } }).catch(() => {});
  for (const id of created.users) await admin.user.delete({ where: { id: requireId(id, 'user') } }).catch(() => {});
});

/** One request: the real auth() reads the cookie the browser still holds. */
async function request() {
  const session = (await lib!.auth.auth()) as { tenantId: string | null; role: string | null } | null;
  return { tenantA: session?.tenantId === ids.tenantA, tenantB: session?.tenantId === ids.tenantB, tenantId: session?.tenantId ?? null, role: session?.role ?? null };
}

describe('the next request sees the membership as it is now (İNCELEME-59 Y-2)', () => {
  test('demoted to MEMBER: the next request is MEMBER and an edit is refused', async () => {
    const signedIn = await request();
    expect(signedIn).toMatchObject({ tenantA: true, role: 'TENANT_OWNER' });
    // Control: as an owner the same action deletes, so the refusal below is the role.
    const e0 = await evidenceRow('control');
    const asOwner = await outcome(lib!.evidence.deleteEvidence(e0));

    await admin!.membership.update({ where: { id: requireId(ids.membershipA, 'membershipA') }, data: { role: 'MEMBER' } });
    const demoted = await request();
    const e1 = await evidenceRow('kept');
    const asMember = await outcome(lib!.evidence.deleteEvidence(e1));
    const left = await admin!.evidence.count({ where: { id: requireId(e1, 'e1') } });

    console.log('Y2_DEMOTE', JSON.stringify({ signedIn: signedIn.role, asOwner, demoted: { tenantA: demoted.tenantA, role: demoted.role }, asMember, left }));
    expect(asOwner).toBe('ok:{"success":true}');
    expect(demoted).toMatchObject({ tenantA: true, role: 'MEMBER' });
    expect(asMember).toBe('throw:FORBIDDEN_ROLE');
    expect(left).toBe(1);
  });

  test('membership removed: the next request is tenantless, not moved to the other tenant, and an edit is refused', async () => {
    const e1 = await evidenceRow('kept');
    await admin!.membership.delete({ where: { id: requireId(ids.membershipA, 'membershipA') } });
    const removed = await request();
    const write = await outcome(lib!.evidence.deleteEvidence(e1));
    const left = await admin!.evidence.count({ where: { id: requireId(e1, 'e1') } });

    console.log('Y2_REMOVE', JSON.stringify({ removed, write, left }));
    expect(removed.tenantId).toBeNull();
    expect(removed.role).toBeNull();
    expect(removed.tenantB).toBe(false);
    expect(write).toBe('throw:TENANT_SCOPE_REQUIRED');
    expect(left).toBe(1);
  });
});

describe('accepting an invitation moves the session to that tenant (TASK-MUNWZA26VGK0B, İNCELEME-68 Y-1)', () => {
  /** A third tenant C that invites the user, as POST /api/invitations would leave it. */
  async function invitedToC(): Promise<{ tenantC: string; raw: string }> {
    const c = await admin!.tenant.create({ data: { name: `${RUN} C`, slug: `${RUN}-c-${Math.random().toString(36).slice(2, 8)}`, country: 'TR' } });
    created.tenants.push(c.id);
    const user = await admin!.user.findUniqueOrThrow({ where: { id: requireId(ids.user, 'user') }, select: { email: true } });
    const raw = lib!.token.generateSecretToken();
    await admin!.invitation.create({
      data: { email: user.email!, tenantId: c.id, role: 'WRITER', tokenHash: lib!.token.hashSecretToken(raw), expires: new Date(Date.now() + 86_400_000) },
    });
    // What the e-mail link's GET handler parks for the accept screen.
    jar.set(lib!.acceptCookie.INVITATION_ACCEPT_COOKIE, lib!.acceptCookie.encodeParkedInvitation({ token: raw, locale: 'tr' }));
    return { tenantC: c.id, raw };
  }

  test('removed from the bound tenant, accepting C makes the very next request C, with the same browser', async () => {
    await admin!.membership.delete({ where: { id: requireId(ids.membershipA, 'membershipA') } });
    const stranded = await request();
    const { tenantC } = await invitedToC();
    // The real server action: joins C, re-mints the session cookie, redirects.
    const accepted = await outcome(lib!.acceptActions.acceptInvitationAction('tr'));
    const joined = await request();
    const again = await request();

    console.log('Y1_REBIND', JSON.stringify({ stranded, accepted, joined: { c: joined.tenantId === tenantC, role: joined.role }, again: again.tenantId === tenantC }));
    // Before: tenantless and not moved to B (İNCELEME-59 Y-2 holds).
    expect(stranded).toMatchObject({ tenantId: null, tenantB: false });
    // WRITER cannot open the dashboard: the landing is the pipeline board (QA Y-1, TASK-MUPUGXME9DP6K).
    expect(accepted).toMatch(/^throw:NEXT_REDIRECT;.*\/tr\/default\/firsatlar/);
    expect(joined.tenantId).toBe(tenantC);
    expect(joined.role).toBe('WRITER');
    // Bound now: plain requests stay on C, and it is still not B.
    expect(again.tenantId).toBe(tenantC);
    expect(again.tenantB).toBe(false);
  });

  test('still a member of A, accepting C moves the session to C too: it is the tenant just chosen', async () => {
    expect((await request()).tenantA).toBe(true);
    const { tenantC } = await invitedToC();
    await outcome(lib!.acceptActions.acceptInvitationAction('tr'));
    expect((await request()).tenantId).toBe(tenantC);
  });

  test('a browser asking to be bound to a tenant it is not in stays where it was', async () => {
    const c = await admin!.tenant.create({ data: { name: `${RUN} X`, slug: `${RUN}-x-${Math.random().toString(36).slice(2, 8)}`, country: 'TR' } });
    created.tenants.push(c.id);
    // What useSession().update({ tenantId }) would send: the same POST /api/auth/session.
    await lib!.auth.unstable_update({ tenantId: c.id } as never);
    const after = await request();
    expect(after.tenantA).toBe(true);
    expect(after.role).toBe('TENANT_OWNER');
  });
});

describe('a soft-deleted tenant grants nothing (TASK-MUO2B59ZNY7D7, İNCELEME-81 O-1)', () => {
  /** What an operator's soft-delete leaves: the row and its memberships stay. */
  async function softDelete(tenantId: string, at: Date | null = new Date()) {
    await admin!.tenant.update({ where: { id: requireId(tenantId, 'tenant') }, data: { deletedAt: at } });
  }

  test('the bound tenant is deleted: the next request is tenantless, not moved to B; undeleted, it is back', async () => {
    expect((await request()).tenantA).toBe(true);
    const e1 = await evidenceRow('kept');
    await softDelete(ids.tenantA);
    const deleted = await request();
    const write = await outcome(lib!.evidence.deleteEvidence(e1));
    const left = await admin!.evidence.count({ where: { id: requireId(e1, 'e1') } });
    // Restored inside the hold (deletedAt cleared): the same cookie finds A again.
    await softDelete(ids.tenantA, null);
    const restored = await request();

    console.log('O1_BOUND_DELETED', JSON.stringify({ deleted, write, left, restored: { tenantA: restored.tenantA, role: restored.role } }));
    expect(deleted.tenantId).toBeNull();
    expect(deleted.role).toBeNull();
    expect(deleted.tenantB).toBe(false);
    expect(write).toBe('throw:TENANT_SCOPE_REQUIRED');
    expect(left).toBe(1);
    expect(restored).toMatchObject({ tenantA: true, role: 'TENANT_OWNER' });
  });

  test('a sign-in skips a deleted tenant even when it is the oldest membership', async () => {
    await softDelete(ids.tenantA);
    const user = await admin!.user.findUniqueOrThrow({ where: { id: requireId(ids.user, 'user') }, select: { email: true } });
    const claims = await lib!.auth.authConfig.callbacks!.jwt!({
      token: { sub: ids.user, email: user.email },
      user: { id: ids.user, email: user.email },
      trigger: 'signIn',
    } as never);
    jar.set(COOKIE, await lib!.encode({ token: claims as never, secret: process.env.AUTH_SECRET!, salt: COOKIE }));
    const signedIn = await request();
    console.log('O1_SIGNIN', JSON.stringify(signedIn));
    expect(signedIn.tenantB).toBe(true);
    expect(signedIn.tenantA).toBe(false);
  });

  test('[A9] asked to be bound to a deleted tenant it is a member of, the session stays where it was', async () => {
    const d = await admin!.tenant.create({ data: { name: `${RUN} D`, slug: `${RUN}-d-${Math.random().toString(36).slice(2, 8)}`, country: 'TR' } });
    created.tenants.push(d.id);
    await admin!.membership.create({ data: { tenantId: d.id, userId: ids.user, role: 'TENANT_OWNER' } });
    await softDelete(d.id);
    // What POST /api/auth/session { data: { tenantId } } does: the same update path.
    await lib!.auth.unstable_update({ tenantId: d.id } as never);
    const after = await request();
    console.log('O1_A9', JSON.stringify({ d: after.tenantId === d.id, tenantA: after.tenantA, role: after.role }));
    expect(after.tenantId).not.toBe(d.id);
    expect(after.tenantA).toBe(true);
    expect(after.role).toBe('TENANT_OWNER');
  });
});
