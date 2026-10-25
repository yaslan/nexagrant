import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * TASK-MVBEM10PJYU0E (FO-12, Ö-2) — the module facts are read once per request,
 * and only for the tenant that asked.
 *
 * `react`'s default build has no request scope, so its `cache()` memoises nothing
 * and would make the "read once" assertion pass or fail for the wrong reason. Here
 * `react` is the `react-server` build Next renders server components with, and the
 * test plays the renderer: `request()` installs a fresh cache store the way React
 * does at the start of a render and removes it at the end. The memoisation itself
 * is React's own code, not a stand-in.
 */

const h = vi.hoisted(() => ({
  auth: vi.fn(),
  findMany: vi.fn(),
  getEntitlements: vi.fn(),
  withTenant: vi.fn(),
}));

vi.mock('react', async () => {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  return require(require.resolve('react').replace(/index\.js$/, 'react.react-server.js'));
});

vi.mock('@/lib/auth', () => ({ auth: h.auth }));

vi.mock('@/lib/db', () => ({
  prisma: {},
  withTenant: h.withTenant,
}));

vi.mock('@/lib/billing', () => ({ getEntitlements: h.getEntitlements }));

import * as React from 'react';
import { checkModuleAccess, listAccessibleModules } from '@/lib/modules/access';

type Internals = { A: unknown };
const internals = (React as unknown as {
  __SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: Internals;
}).__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

/** Run `work` as one server render: one cache store, dropped afterwards. */
async function request<T>(work: () => Promise<T>): Promise<T> {
  const store = new Map<unknown, unknown>();
  const previous = internals.A;
  internals.A = {
    getCacheForType<V>(create: () => V): V {
      if (!store.has(create)) store.set(create, create());
      return store.get(create) as V;
    },
  };
  try {
    return await work();
  } finally {
    internals.A = previous;
  }
}

/** What each tenant has in the database. */
const DB: Record<string, { rows: { moduleId: string; status: string }[]; allowedModules: string[] }> = {
  'tenant-a': {
    rows: [
      { moduleId: 'M1', status: 'ON' },
      { moduleId: 'M5', status: 'ON' },
    ],
    allowedModules: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M8'],
  },
  'tenant-b': {
    rows: [
      { moduleId: 'M1', status: 'ON' },
      { moduleId: 'M5', status: 'OFF' },
      { moduleId: 'M8', status: 'ON' },
    ],
    allowedModules: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M8'],
  },
};

function signIn(tenantId: string) {
  h.auth.mockResolvedValue({
    user: { id: `user-of-${tenantId}` },
    tenantId,
    role: 'MEMBER',
    workspaceIds: [],
    isPlatformAdmin: false,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.withTenant.mockImplementation(async <T,>(tenantId: string, cb: (tx: never) => Promise<T>) =>
    cb({
      moduleState: {
        findMany: (args: { where: { tenantId: string } }) => {
          h.findMany(tenantId, args);
          return Promise.resolve(DB[tenantId]?.rows ?? []);
        },
      },
    } as never)
  );
  h.getEntitlements.mockImplementation(async (tenantId: string) => ({
    allowedModules: DB[tenantId]?.allowedModules ?? [],
  }));
});

describe('module facts — one read per request (Ö-2)', () => {
  it('the shell list and the page gate share one session and one transaction', async () => {
    signIn('tenant-a');

    const [list, gate] = await request(async () => [
      await listAccessibleModules(),
      await checkModuleAccess('M5'),
    ] as const);

    expect(list).toEqual(['M1', 'M5']);
    expect(gate).toEqual({ allowed: true, status: 'ON' });
    expect(h.auth).toHaveBeenCalledTimes(1);
    expect(h.withTenant).toHaveBeenCalledTimes(1);
    expect(h.findMany).toHaveBeenCalledTimes(1);
    expect(h.getEntitlements).toHaveBeenCalledTimes(1);
  });

  it('several gates on one page still read once', async () => {
    signIn('tenant-a');

    await request(async () => {
      for (const id of ['M1', 'M5', 'M8', 'M9'] as const) await checkModuleAccess(id);
    });

    expect(h.withTenant).toHaveBeenCalledTimes(1);
    expect(h.auth).toHaveBeenCalledTimes(1);
  });

  it('a second request reads again — nothing outlives the request', async () => {
    signIn('tenant-a');
    await request(() => listAccessibleModules());

    // The admin turns M5 off between the two requests.
    DB['tenant-a']!.rows[1]!.status = 'OFF';
    try {
      const after = await request(() => listAccessibleModules());
      expect(after).toEqual(['M1']);
      expect(h.withTenant).toHaveBeenCalledTimes(2);
      expect(h.auth).toHaveBeenCalledTimes(2);
    } finally {
      DB['tenant-a']!.rows[1]!.status = 'ON';
    }
  });
});

describe('module facts — never shared across tenants', () => {
  // One request carries one session (`requestSession` is cached too), so tenants
  // meet only across requests; the facts are additionally keyed by tenant id.
  it('tenant B is answered from tenant B, not from A’s cached facts', async () => {
    signIn('tenant-a');
    const forA = await request(() => listAccessibleModules());

    signIn('tenant-b');
    const forB = await request(async () => [await listAccessibleModules(), await checkModuleAccess('M5')] as const);

    expect(forA).toEqual(['M1', 'M5']);
    expect(forB[0]).toEqual(['M1', 'M8']);
    expect(forB[1]).toMatchObject({ allowed: false, status: 'OFF', reason: 'MODULE_OFF' });
    expect(h.withTenant.mock.calls.map((c) => c[0])).toEqual(['tenant-a', 'tenant-b']);
    expect(h.findMany.mock.calls).toEqual([
      ['tenant-a', expect.objectContaining({ where: { tenantId: 'tenant-a' } })],
      ['tenant-b', expect.objectContaining({ where: { tenantId: 'tenant-b' } })],
    ]);
  });
});
