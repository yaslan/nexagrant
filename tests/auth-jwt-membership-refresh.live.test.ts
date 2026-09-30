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

const jar = vi.hoisted(() => ({ cookie: '' }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: 'localhost:3000', 'x-forwarded-proto': 'http', cookie: jar.cookie }),
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

let admin: PrismaClient | undefined;
let lib:
  | {
      auth: typeof import('../src/lib/auth');
      evidence: typeof import('../src/app/[locale]/(app)/[workspace]/evidence/actions');
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
  jar.cookie = `${COOKIE}=${await lib!.encode({ token: claims as never, secret: process.env.AUTH_SECRET!, salt: COOKIE })}`;
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
