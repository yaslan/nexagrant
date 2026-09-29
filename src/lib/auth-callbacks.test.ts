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
  jwt: (args: { token: Record<string, unknown>; user?: unknown; trigger?: string }) => Promise<Record<string, unknown>>;
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
    // One select of the flag only: the token already has a tenant.
    expect(prismaUser.findUnique).toHaveBeenCalledTimes(1);
    expect(prismaUser.findUnique).toHaveBeenCalledWith({
      where: { id: 'demo-user-bob' },
      select: { isPlatformAdmin: true },
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
