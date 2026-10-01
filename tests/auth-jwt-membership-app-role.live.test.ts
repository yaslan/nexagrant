import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, requireTestEnv, skipOrFailInCi } from './helpers/live-db-role';
import { requireId } from './helpers/teardown-guard';

/**
 * TASK-MUPYHVSBW47GD#auth (P0) — the Auth.js jwt callback, run as the app runs
 * in production: on `fabrika_app` (NOSUPERUSER, NOBYPASSRLS).
 *
 * "Membership" is FORCE ROW LEVEL SECURITY under `tenant_isolation`, and the
 * callback is what DISCOVERS the tenant, so it has no app.tenant_id to give.
 * Under the superuser of local dev and CI the plain read worked by accident;
 * on live Supabase it read zero rows and every session came out tenantless
 * (/no-workspace, no role). tests/auth-jwt-membership-refresh.live.test.ts runs
 * the same callback on the app's default client — the superuser in CI — so it
 * could not see this.
 *
 * Here src/lib/db.ts is handed a `fabrika_app` client BEFORE src/lib/auth.ts is
 * imported, so `prisma` and `withSystemScope` inside the callback are the app
 * role's. Rows are written with the superuser and deleted by id.
 */

const SUITE = 'auth-jwt-membership-app-role.live';
const RUN = `jwtapp-${Date.now().toString(36)}`;

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: 'localhost:3000' }),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));

type Jwt = (args: Record<string, unknown>) => Promise<Record<string, unknown>>;

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };
let previousGlobal: PrismaClient | undefined;
let admin: PrismaClient | undefined;
let app: PrismaClient | undefined;
let jwt: Jwt | undefined;
let ready = false;
let skipReason = '';
const ids = { tenantA: '', tenantB: '', userU: '', userV: '', workspaceA: '' };
const created = { tenants: [] as string[], users: [] as string[] };

beforeAll(async () => {
  const adminUrl = envValue('DATABASE_URL');
  if (!adminUrl) {
    skipReason = 'DATABASE_URL is not set';
    skipOrFailInCi(SUITE, skipReason);
    return;
  }
  const rlsUrl = requireRlsTestUrl(envValue('DATABASE_URL_RLS_TEST'), SUITE);
  if (!rlsUrl) {
    skipReason = 'DATABASE_URL_RLS_TEST is not set';
    return;
  }
  if (!requireTestEnv('AUTH_SECRET', SUITE)) {
    skipReason = 'AUTH_SECRET is not set';
    return;
  }

  const { createDbClient } = await import('../src/lib/db');
  admin = createDbClient(adminUrl);
  try {
    await admin.$queryRaw`SELECT 1`;
  } catch (e) {
    skipReason = `database unavailable: ${e instanceof Error ? e.message : String(e)}`;
    skipOrFailInCi(SUITE, skipReason);
    return;
  }

  // src/lib/db.ts keeps its client on globalThis outside production; this file
  // has already loaded db.ts (above), so its `prisma` export is fixed. Reload it
  // with the app role's client in place, then load auth.ts on top of that.
  app = createDbClient(rlsUrl);
  await assertRlsSubjectRole(app, SUITE);
  previousGlobal = globalForPrisma.prisma;
  globalForPrisma.prisma = app;
  vi.resetModules();
  const db = await import('../src/lib/db');
  const role = await assertRlsSubjectRole(db.prisma, SUITE);
  expect(role.user).toBe('fabrika_app');
  const auth = await import('../src/lib/auth');
  jwt = auth.authConfig.callbacks!.jwt! as unknown as Jwt;
  ready = true;
});

beforeEach(async (ctx) => {
  if (!ready) ctx.skip(skipReason);
  // U owns A (with a workspace); V owns B. Nobody else is in either.
  const a = await admin!.tenant.create({ data: { name: `${RUN} A`, slug: `${RUN}-a-${Math.random().toString(36).slice(2, 8)}`, country: 'TR' } });
  const b = await admin!.tenant.create({ data: { name: `${RUN} B`, slug: `${RUN}-b-${Math.random().toString(36).slice(2, 8)}`, country: 'TR' } });
  ids.tenantA = a.id;
  ids.tenantB = b.id;
  created.tenants.push(a.id, b.id);
  const u = await admin!.user.create({ data: { email: `${RUN}-u-${Math.random().toString(36).slice(2, 8)}@example.invalid`, name: 'U' } });
  const v = await admin!.user.create({ data: { email: `${RUN}-v-${Math.random().toString(36).slice(2, 8)}@example.invalid`, name: 'V' } });
  ids.userU = u.id;
  ids.userV = v.id;
  created.users.push(u.id, v.id);
  ids.workspaceA = (await admin!.workspace.create({ data: { tenantId: a.id, name: 'Ana', slug: 'default' } })).id;
  await admin!.membership.create({ data: { tenantId: a.id, userId: u.id, role: 'TENANT_OWNER', workspaceIds: [ids.workspaceA] } });
  await admin!.membership.create({ data: { tenantId: b.id, userId: v.id, role: 'TENANT_OWNER' } });
});

afterAll(async () => {
  if (previousGlobal !== undefined || globalForPrisma.prisma === app) globalForPrisma.prisma = previousGlobal;
  if (admin) {
    for (const id of created.tenants) await admin.tenant.delete({ where: { id: requireId(id, 'tenant') } }).catch(() => {});
    for (const id of created.users) await admin.user.delete({ where: { id: requireId(id, 'user') } }).catch(() => {});
    await admin.$disconnect();
  }
  await app?.$disconnect();
});

const signIn = (userId: string) =>
  jwt!({ token: { sub: userId }, user: { id: userId, email: null, name: null }, trigger: 'signIn' });

describe('jwt membership lookup under fabrika_app (TASK-MUPYHVSBW47GD#auth)', () => {
  test('the plain read the callback used to make sees no membership as fabrika_app (the bug, measured)', async () => {
    const row = await app!.user.findUnique({
      where: { id: ids.userU },
      select: { memberships: { select: { tenantId: true } } },
    });
    expect(row).not.toBeNull();
    expect(row!.memberships).toEqual([]);
  });

  test('a sign-in finds the one membership: tenant, role and workspaces are on the token', async () => {
    const token = await signIn(ids.userU);
    expect(token.tenantId).toBe(ids.tenantA);
    expect(token.boundTenantId).toBe(ids.tenantA);
    expect(token.role).toBe('TENANT_OWNER');
    expect(token.workspaceIds).toEqual([ids.workspaceA]);
  });

  test('every later request keeps it (the callback re-reads on each call)', async () => {
    const first = await signIn(ids.userU);
    const next = await jwt!({ token: { ...first } });
    expect(next.tenantId).toBe(ids.tenantA);
    expect(next.role).toBe('TENANT_OWNER');
  });

  test("another user's membership never comes back: V gets B, and U asking for B stays in A", async () => {
    const v = await signIn(ids.userV);
    expect(v.tenantId).toBe(ids.tenantB);
    const u = await signIn(ids.userU);
    const asked = await jwt!({ token: { ...u }, trigger: 'update', session: { tenantId: ids.tenantB } });
    expect(asked.tenantId).toBe(ids.tenantA);
    expect(asked.role).toBe('TENANT_OWNER');
  });

  test('the system scope does not outlive the lookup: the same connection sees no membership afterwards', async () => {
    await signIn(ids.userU);
    const after = await app!.membership.count({ where: { userId: ids.userU } });
    expect(after).toBe(0);
  });

  test('a user with no membership stays tenantless (fail closed)', async () => {
    await admin!.membership.deleteMany({ where: { userId: ids.userU } });
    const token = await signIn(ids.userU);
    expect(token.tenantId).toBeUndefined();
    expect(token.role).toBeUndefined();
  });
});
