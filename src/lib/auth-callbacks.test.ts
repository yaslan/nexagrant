import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PLATFORM_ADMIN_DEMO_EMAIL } from './demo-login';

/**
 * TASK-MULU7GVFBTRXX Ö-2 / K-2 — the platform-admin claim in the session token.
 *
 * NextAuth is replaced by a stub that hands back the config auth.ts built, so
 * the jwt/session callbacks and the Credentials `authorize` run as written,
 * against a Prisma stub. The flag is read once per module load, so each case
 * re-imports auth.ts under the environment it needs.
 */

type Callbacks = {
  jwt: (args: {
    token: Record<string, unknown>;
    user?: unknown;
    trigger?: string;
    session?: unknown;
  }) => Promise<Record<string, unknown>>;
  session: (args: { session: Record<string, unknown>; token: Record<string, unknown> }) => Promise<Record<string, unknown>>;
};
type Config = {
  callbacks: Callbacks;
  providers: Array<{ id: string; authorize?: (c: Record<string, unknown>) => Promise<unknown> }>;
};

const { prismaUser, captured } = vi.hoisted(() => ({
  prismaUser: { findUnique: vi.fn(), update: vi.fn() },
  captured: { config: undefined as unknown },
}));

vi.mock('next-auth', () => ({
  // src/lib/agency/invite-signin-error.ts subclasses it at load time.
  CredentialsSignin: class CredentialsSignin extends Error {},
  default: (config: unknown) => {
    captured.config = config;
    return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() };
  },
}));
vi.mock('next-auth/providers/google', () => ({ default: () => ({ id: 'google' }) }));
vi.mock('next-auth/providers/credentials', () => ({
  default: (c: { authorize: (x: Record<string, unknown>) => Promise<unknown> }) => ({ id: 'credentials', authorize: c.authorize }),
}));
vi.mock('@auth/prisma-adapter', () => ({ PrismaAdapter: () => ({}) }));
vi.mock('./db', () => ({ prisma: { user: prismaUser, $transaction: vi.fn() } }));

async function loadConfig(demoLogin: 'true' | 'false'): Promise<Config> {
  vi.stubEnv('DEMO_LOGIN_ENABLED', demoLogin);
  vi.resetModules();
  captured.config = undefined;
  await import('./auth');
  return captured.config as Config;
}

/** Runs one request through both callbacks, as Auth.js does on every session read. */
async function sessionFor(config: Config, token: Record<string, unknown>) {
  const next = await config.callbacks.jwt({ token: { ...token } });
  const session = await config.callbacks.session({ session: { user: {} }, token: next });
  return { token: next, isPlatformAdmin: session.isPlatformAdmin };
}

const tenanted = { tenantId: 't1', role: 'TENANT_OWNER', workspaceIds: ['w1'] };
// Every membership lookup carries it: a row in a soft-deleted tenant grants nothing
// (TASK-MUO2B59ZNY7D7, İNCELEME-81 O-1).
const LIVE = { tenant: { deletedAt: null } };

beforeEach(() => {
  prismaUser.findUnique.mockReset();
  prismaUser.update.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('platform-admin claim (TASK-MULU7GVFBTRXX Ö-2)', () => {
  it('a token minted while demo sign-in was on loses admin once the flag is off', async () => {
    // The demo admin seat, as it sat in the DB before K-2: not an admin row.
    prismaUser.findUnique.mockResolvedValue({ isPlatformAdmin: false });

    const on = await loadConfig('true');
    const minted = await sessionFor(on, { id: 'u-admin', email: PLATFORM_ADMIN_DEMO_EMAIL, ...tenanted });
    expect(minted.isPlatformAdmin).toBe(true);
    expect(minted.token.demoAdmin).toBe(true);
    expect(minted.token.isPlatformAdmin).toBe(false);

    const off = await loadConfig('false');
    const later = await sessionFor(off, minted.token);
    expect(later.isPlatformAdmin).toBe(false);
    expect(later.token.demoAdmin).toBe(false);
    expect(later.token.isPlatformAdmin).toBe(false);
  });

  it('a stale demoAdmin claim is ignored by the session callback with the flag off', async () => {
    const off = await loadConfig('false');
    const session = await off.callbacks.session({
      session: { user: {} },
      token: { id: 'u-admin', demoAdmin: true, isPlatformAdmin: false },
    });
    expect(session.isPlatformAdmin).toBe(false);
  });

  it('a crafted isPlatformAdmin claim on a non-admin user is recomputed to false (crw-fb T3)', async () => {
    prismaUser.findUnique.mockResolvedValue({ isPlatformAdmin: false });
    const off = await loadConfig('false');
    const bob = await sessionFor(off, { id: 'demo-user-bob', email: 'bob@example.org', isPlatformAdmin: true, ...tenanted });
    expect(bob.isPlatformAdmin).toBe(false);
    // One call: the flag and the bound tenant's membership together.
    expect(prismaUser.findUnique).toHaveBeenCalledTimes(1);
    expect(prismaUser.findUnique).toHaveBeenCalledWith({
      where: { id: 'demo-user-bob' },
      select: {
        isPlatformAdmin: true,
        name: true,
        memberships: {
          where: { ...LIVE, tenantId: 't1' },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { tenantId: true, role: true, workspaceIds: true },
        },
      },
    });
  });

  it('a real admin row stays admin with the flag off', async () => {
    prismaUser.findUnique.mockResolvedValue({ isPlatformAdmin: true });
    const off = await loadConfig('false');
    expect((await sessionFor(off, { id: 'u-staff', email: 'staff@example.org', ...tenanted })).isPlatformAdmin).toBe(true);
  });

  it('a row that lost admin in the DB loses it in the next request', async () => {
    prismaUser.findUnique.mockResolvedValueOnce({ isPlatformAdmin: true }).mockResolvedValueOnce({ isPlatformAdmin: false });
    const off = await loadConfig('false');
    const first = await sessionFor(off, { id: 'u-staff', ...tenanted });
    expect(first.isPlatformAdmin).toBe(true);
    expect((await sessionFor(off, first.token)).isPlatformAdmin).toBe(false);
  });

  it('fails closed: no row, or no database, is no admin', async () => {
    const off = await loadConfig('false');
    prismaUser.findUnique.mockResolvedValueOnce(null);
    expect((await sessionFor(off, { id: 'gone', isPlatformAdmin: true, ...tenanted })).isPlatformAdmin).toBe(false);
    prismaUser.findUnique.mockRejectedValueOnce(new Error('db down'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await sessionFor(off, { id: 'u-staff', isPlatformAdmin: true, ...tenanted })).isPlatformAdmin).toBe(false);
  });

  it('a token with no user id cannot carry admin', async () => {
    const off = await loadConfig('false');
    expect((await sessionFor(off, { isPlatformAdmin: true })).isPlatformAdmin).toBe(false);
    expect(prismaUser.findUnique).not.toHaveBeenCalled();
  });
});

describe('role and tenant claims are re-read on every request (TASK-MUNQB0GR306U0, İNCELEME-59 Y-2)', () => {
  const row = (memberships: Array<{ tenantId: string; role: string; workspaceIds?: string[] }>) => ({
    isPlatformAdmin: false,
    name: 'Ayşe',
    memberships: memberships.map((m) => ({ workspaceIds: [], ...m })),
  });
  const membershipWhere = (call: number) =>
    (prismaUser.findUnique.mock.calls[call]?.[0] as { select: { memberships: { where?: unknown } } }).select.memberships.where;

  it('a demoted member carries the new role in the next request', async () => {
    const off = await loadConfig('false');
    prismaUser.findUnique.mockResolvedValueOnce(row([{ tenantId: 't1', role: 'MEMBER' }]));
    const next = await off.callbacks.jwt({ token: { id: 'u1', ...tenanted } });
    expect(next.tenantId).toBe('t1');
    expect(next.role).toBe('MEMBER');
    expect(next.workspaceIds).toEqual([]);
    expect(membershipWhere(0)).toEqual({ ...LIVE, tenantId: 't1' });
  });

  it('a removed member is tenantless in the next request', async () => {
    const off = await loadConfig('false');
    prismaUser.findUnique.mockResolvedValueOnce(row([]));
    const next = await off.callbacks.jwt({ token: { id: 'u1', ...tenanted } });
    const session = await off.callbacks.session({ session: { user: {} }, token: next });
    expect(next.tenantId).toBeUndefined();
    expect(next.role).toBeUndefined();
    // İNCELEME-68 Ö-1: the removed tenant's workspace list goes with it.
    expect(next.workspaceIds).toBeUndefined();
    expect(session.tenantId).toBeNull();
    expect(session.role).toBeNull();
    expect(session.workspaceIds).toEqual([]);
  });

  it('removed from the bound tenant, a member of another is not moved there', async () => {
    const off = await loadConfig('false');
    // The lookup asks for t1 only; t2 is never offered.
    prismaUser.findUnique.mockResolvedValueOnce(row([]));
    const removed = await off.callbacks.jwt({ token: { id: 'u1', ...tenanted } });
    expect(removed.tenantId).toBeUndefined();
    expect(removed.boundTenantId).toBe('t1');
    // Tenantless now, but still bound: the next request asks for t1 again.
    prismaUser.findUnique.mockResolvedValueOnce(row([]));
    const later = await off.callbacks.jwt({ token: { ...removed } });
    expect(later.tenantId).toBeUndefined();
    expect(membershipWhere(1)).toEqual({ ...LIVE, tenantId: 't1' });
    // Added back to t1, the token has it again.
    prismaUser.findUnique.mockResolvedValueOnce(row([{ tenantId: 't1', role: 'WRITER' }]));
    const readded = await off.callbacks.jwt({ token: { ...later } });
    expect(readded.tenantId).toBe('t1');
    expect(readded.role).toBe('WRITER');
  });

  it('a sign-in picks the oldest membership afresh', async () => {
    const off = await loadConfig('false');
    prismaUser.findUnique.mockResolvedValueOnce(row([{ tenantId: 't2', role: 'TENANT_ADMIN' }]));
    const next = await off.callbacks.jwt({ token: { id: 'u1', boundTenantId: 't1' }, trigger: 'signIn' });
    expect(membershipWhere(0)).toEqual(LIVE);
    expect(next.tenantId).toBe('t2');
    expect(next.boundTenantId).toBe('t2');
    expect(next.role).toBe('TENANT_ADMIN');
  });

  it('a token that never had a tenant takes its first membership (invitation accepted)', async () => {
    const off = await loadConfig('false');
    prismaUser.findUnique.mockResolvedValueOnce(row([{ tenantId: 't3', role: 'MEMBER' }]));
    const next = await off.callbacks.jwt({ token: { id: 'u1' } });
    expect(membershipWhere(0)).toEqual(LIVE);
    expect(next.tenantId).toBe('t3');
  });

  it('no database: tenantless for this request, same tenant once it is back', async () => {
    const off = await loadConfig('false');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    prismaUser.findUnique.mockRejectedValueOnce(new Error('db down'));
    const down = await off.callbacks.jwt({ token: { id: 'u1', ...tenanted } });
    expect(down.tenantId).toBeUndefined();
    expect(down.role).toBeUndefined();
    expect(down.workspaceIds).toBeUndefined();
    prismaUser.findUnique.mockResolvedValueOnce(row([{ tenantId: 't1', role: 'TENANT_OWNER' }]));
    const up = await off.callbacks.jwt({ token: { ...down } });
    expect(membershipWhere(1)).toEqual({ ...LIVE, tenantId: 't1' });
    expect(up.tenantId).toBe('t1');
  });
});

describe('the session carries exactly the claims the app reads (İNCELEME-81 Ö-4)', () => {
  it('no token-only claim (boundTenantId, demoAdmin, id) reaches the session', async () => {
    const off = await loadConfig('false');
    prismaUser.findUnique.mockResolvedValueOnce({
      isPlatformAdmin: false,
      name: 'Ayşe',
      memberships: [{ tenantId: 't1', role: 'TENANT_OWNER', workspaceIds: ['w1'] }],
    });
    const token = await off.callbacks.jwt({ token: { id: 'u1', email: 'a@example.invalid', ...tenanted } });
    expect(token.boundTenantId).toBe('t1');
    const session = await off.callbacks.session({ session: { user: {}, expires: 'x' }, token });
    expect(Object.keys(session).sort()).toEqual(['expires', 'isPlatformAdmin', 'role', 'tenantId', 'user', 'workspaceIds']);
    expect(Object.keys(session.user as object).sort()).toEqual(['email', 'id', 'image', 'name']);
  });
});

describe('an accepted invitation rebinds the token (TASK-MUNWZA26VGK0B, İNCELEME-68 Y-1)', () => {
  const row = (memberships: Array<{ tenantId: string; role: string; workspaceIds?: string[] }>) => ({
    isPlatformAdmin: false,
    name: 'Ayşe',
    memberships: memberships.map((m) => ({ workspaceIds: [], ...m })),
  });
  const membershipQuery = (call: number) =>
    (prismaUser.findUnique.mock.calls[call]?.[0] as { select: { memberships: { where?: unknown; take?: number } } })
      .select.memberships;
  // Removed from t1, still bound to it: the state İNCELEME-68 scenario 10 left the user in.
  const stranded = { id: 'u1', boundTenantId: 't1' };

  it('removed from the bound tenant, accepting t2 moves the token to t2', async () => {
    const off = await loadConfig('false');
    prismaUser.findUnique.mockResolvedValueOnce(row([{ tenantId: 't2', role: 'WRITER', workspaceIds: ['w2'] }]));
    const next = await off.callbacks.jwt({ token: { ...stranded }, trigger: 'update', session: { tenantId: 't2' } });
    expect(membershipQuery(0).where).toEqual({ ...LIVE, tenantId: { in: ['t2', 't1'] } });
    expect(membershipQuery(0).take).toBe(2);
    expect(next.tenantId).toBe('t2');
    expect(next.boundTenantId).toBe('t2');
    expect(next.role).toBe('WRITER');
    expect(next.workspaceIds).toEqual(['w2']);
    // Plain requests from here on ask for t2 only.
    prismaUser.findUnique.mockResolvedValueOnce(row([{ tenantId: 't2', role: 'WRITER' }]));
    const later = await off.callbacks.jwt({ token: { ...next } });
    expect(membershipQuery(1).where).toEqual({ ...LIVE, tenantId: 't2' });
    expect(later.tenantId).toBe('t2');
  });

  it('still a member of the bound tenant, the requested one wins even when it is newer', async () => {
    const off = await loadConfig('false');
    // `asc` order: t1 (older) first. Taking the first row would keep t1.
    prismaUser.findUnique.mockResolvedValueOnce(
      row([
        { tenantId: 't1', role: 'TENANT_OWNER' },
        { tenantId: 't2', role: 'MEMBER' },
      ])
    );
    const next = await off.callbacks.jwt({ token: { id: 'u1', ...tenanted }, trigger: 'update', session: { tenantId: 't2' } });
    expect(next.tenantId).toBe('t2');
    expect(next.role).toBe('MEMBER');
  });

  it('the requested membership wins when it is OLDER than the bound one too (İNCELEME-81 Ö-1)', async () => {
    const off = await loadConfig('false');
    // `asc` order puts the requested t1 first and the bound t2 last: taking the
    // last row would keep t2, taking the first would pass by luck of the order.
    prismaUser.findUnique.mockResolvedValueOnce(
      row([
        { tenantId: 't1', role: 'TENANT_OWNER' },
        { tenantId: 't2', role: 'MEMBER' },
      ])
    );
    const next = await off.callbacks.jwt({
      token: { id: 'u1', tenantId: 't2', role: 'MEMBER' },
      trigger: 'update',
      session: { tenantId: 't1' },
    });
    expect(membershipQuery(0).where).toEqual({ ...LIVE, tenantId: { in: ['t1', 't2'] } });
    expect(next.tenantId).toBe('t1');
    expect(next.boundTenantId).toBe('t1');
    expect(next.role).toBe('TENANT_OWNER');
  });

  it('asked for a tenant without a membership, the token stays where it was', async () => {
    const off = await loadConfig('false');
    // The lookup asks for t9 and t1; only t1 exists.
    prismaUser.findUnique.mockResolvedValueOnce(row([{ tenantId: 't1', role: 'TENANT_OWNER' }]));
    const next = await off.callbacks.jwt({ token: { id: 'u1', ...tenanted }, trigger: 'update', session: { tenantId: 't9' } });
    expect(membershipQuery(0).where).toEqual({ ...LIVE, tenantId: { in: ['t9', 't1'] } });
    expect(next.tenantId).toBe('t1');
    expect(next.boundTenantId).toBe('t1');
    // Neither exists: tenantless, and still bound to t1, not to the tenant asked for.
    prismaUser.findUnique.mockResolvedValueOnce(row([]));
    const none = await off.callbacks.jwt({ token: { ...stranded }, trigger: 'update', session: { tenantId: 't9' } });
    expect(none.tenantId).toBeUndefined();
    expect(none.boundTenantId).toBe('t1');
  });

  it('a tenantId outside an update request moves nothing', async () => {
    const off = await loadConfig('false');
    prismaUser.findUnique.mockResolvedValueOnce(row([]));
    const next = await off.callbacks.jwt({ token: { ...stranded }, session: { tenantId: 't2' } });
    expect(membershipQuery(0).where).toEqual({ ...LIVE, tenantId: 't1' });
    expect(next.tenantId).toBeUndefined();
  });

  it('an update without a usable tenantId is an ordinary refresh', async () => {
    const off = await loadConfig('false');
    for (const session of [undefined, null, {}, { tenantId: '' }, { tenantId: '  ' }, { tenantId: 7 }]) {
      prismaUser.findUnique.mockResolvedValueOnce(row([{ tenantId: 't1', role: 'TENANT_OWNER' }]));
      const next = await off.callbacks.jwt({ token: { id: 'u1', ...tenanted }, trigger: 'update', session });
      expect(next.tenantId).toBe('t1');
    }
    for (let call = 0; call < 6; call++) expect(membershipQuery(call).where).toEqual({ ...LIVE, tenantId: 't1' });
  });
});

describe('a connection the pool could not open is retried once (TASK-MUNWZA26VGK0B, İNCELEME-68 Ö-2)', () => {
  const row = { isPlatformAdmin: false, name: 'Ayşe', memberships: [{ tenantId: 't1', role: 'TENANT_OWNER', workspaceIds: [] }] };
  // The two messages pg / pg-pool give when no connection was handed out in time.
  const notConnected = [
    'Connection terminated due to connection timeout',
    'timeout exceeded when trying to connect',
  ];

  it.each(notConnected)('"%s" once: the second attempt keeps the tenant', async (message) => {
    const off = await loadConfig('false');
    prismaUser.findUnique.mockRejectedValueOnce(new Error(message)).mockResolvedValueOnce(row);
    const next = await off.callbacks.jwt({ token: { id: 'u1', ...tenanted } });
    expect(prismaUser.findUnique).toHaveBeenCalledTimes(2);
    expect(next.tenantId).toBe('t1');
    expect(next.role).toBe('TENANT_OWNER');
  });

  it('twice: tenantless for this request, still fail-closed', async () => {
    const off = await loadConfig('false');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    prismaUser.findUnique
      .mockRejectedValueOnce(new Error(notConnected[0]))
      .mockRejectedValueOnce(new Error(notConnected[1]));
    const next = await off.callbacks.jwt({ token: { id: 'u1', ...tenanted } });
    expect(prismaUser.findUnique).toHaveBeenCalledTimes(2);
    expect(next.tenantId).toBeUndefined();
    expect(next.boundTenantId).toBe('t1');
  });

  it('twice: the failure is logged, not swallowed (İNCELEME-81 Ö-4)', async () => {
    const off = await loadConfig('false');
    // Earlier cases spied on console.warn too; only this request's calls count.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warn.mockClear();
    prismaUser.findUnique
      .mockRejectedValueOnce(new Error(notConnected[0]))
      .mockRejectedValueOnce(new Error(notConnected[0]));
    await off.callbacks.jwt({ token: { id: 'u1', ...tenanted } });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('membership lookup failed, session stays tenantless'));
  });

  // A statement that reached the database and ran out of time is not "could not
  // connect": retrying it doubles the load that made it slow (İNCELEME-81 Ö-2).
  it.each([
    'relation "User" does not exist',
    'canceling statement due to statement timeout',
    'Query timeout',
    'Connection terminated unexpectedly',
  ])('"%s" is not retried', async (message) => {
    const off = await loadConfig('false');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    prismaUser.findUnique.mockRejectedValueOnce(new Error(message));
    const next = await off.callbacks.jwt({ token: { id: 'u1', ...tenanted } });
    expect(prismaUser.findUnique).toHaveBeenCalledTimes(1);
    expect(next.tenantId).toBeUndefined();
  });

  it('any other error is not retried', async () => {
    const off = await loadConfig('false');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    prismaUser.findUnique.mockRejectedValueOnce(new Error('relation "User" does not exist'));
    const next = await off.callbacks.jwt({ token: { id: 'u1', ...tenanted } });
    expect(prismaUser.findUnique).toHaveBeenCalledTimes(1);
    expect(next.tenantId).toBeUndefined();
  });
});

describe('demo sign-in writes no admin row (TASK-MULU7GVFBTRXX K-2)', () => {
  it('signing in to the demo admin seat does not set User.isPlatformAdmin', async () => {
    prismaUser.findUnique.mockResolvedValue({
      id: 'u-admin',
      email: PLATFORM_ADMIN_DEMO_EMAIL,
      name: 'Admin',
      image: null,
      isPlatformAdmin: false,
    });
    const on = await loadConfig('true');
    const credentials = on.providers.find((p) => p.id === 'credentials');
    const signedIn = await credentials!.authorize!({ email: PLATFORM_ADMIN_DEMO_EMAIL, password: 'x' });
    expect(signedIn).toMatchObject({ id: 'u-admin' });
    expect(prismaUser.update).not.toHaveBeenCalled();
  });

  it('the Credentials provider is not registered with the flag off', async () => {
    const off = await loadConfig('false');
    expect(off.providers.map((p) => p.id)).toEqual(['google']);
  });

  // ADR-0006, owner decision 29.09 (TASK-MUMLFLB2OPLY3): Microsoft Entra was
  // removed. Its old keys left in an environment must not bring it back.
  it('Microsoft Entra is not registered, even with its old keys set', async () => {
    vi.stubEnv('AUTH_MICROSOFT_ENTRA_ID_ID', 'entra-client');
    vi.stubEnv('AUTH_MICROSOFT_ENTRA_ID_SECRET', 'entra-secret');
    expect((await loadConfig('false')).providers.map((p) => p.id)).toEqual(['google']);
  });
});
