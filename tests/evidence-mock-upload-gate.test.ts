import { beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * TASK-MUNTTZ94LJWBC (İNCELEME-66 D-4, mutant M11) — the dev upload stand-in
 * does not exist in production, nor when an object store is configured. The
 * gate comes before the session is read: a production request is a 404 for
 * everyone, not a 401 that tells the route is there.
 */

const state = vi.hoisted(() => ({ nodeEnv: 'development', hasObjectStore: false, authCalls: 0, puts: 0 }));

vi.mock('@/lib/env', () => ({
  env: new Proxy({}, { get: (_t, k) => (k === 'NODE_ENV' ? state.nodeEnv : undefined) }),
}));
vi.mock('@/lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/storage')>();
  return {
    ...actual,
    get hasObjectStore() {
      return state.hasObjectStore;
    },
    putObjectBytes: async () => {
      state.puts += 1;
      return true;
    },
  };
});
vi.mock('@/lib/tenant', () => ({
  requireTenantApi: async () => {
    state.authCalls += 1;
    return { ok: true, scope: { tenantId: 'tenant-g', userId: 'u', role: 'TENANT_OWNER', workspaceIds: [], isPlatformAdmin: false } };
  },
}));

const { PUT } = await import('@/app/api/evidence/mock-upload/route');

const KEY = 'tenant-g/incoming/org-default/certificate/2026/abcd1234_x.pdf';
const call = (key = KEY) =>
  PUT(
    new Request(`http://localhost/api/evidence/mock-upload?key=${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/pdf' },
      body: '%PDF-1.4 x',
    })
  );

beforeEach(() => {
  state.nodeEnv = 'development';
  state.hasObjectStore = false;
  state.authCalls = 0;
  state.puts = 0;
});

describe('mock-upload is a development-only route', () => {
  test('production: 404, before the session is read, nothing stored', async () => {
    state.nodeEnv = 'production';
    const res = await call();
    expect(res.status).toBe(404);
    expect(state.authCalls).toBe(0);
    expect(state.puts).toBe(0);
  });

  test('with an object store configured: 404, nothing stored', async () => {
    state.hasObjectStore = true;
    const res = await call();
    expect(res.status).toBe(404);
    expect(state.authCalls).toBe(0);
    expect(state.puts).toBe(0);
  });

  test('positive control: development without a store takes the same request', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(state.authCalls).toBe(1);
    expect(state.puts).toBe(1);
  });
});

describe('mock-upload takes only a staging key of the presign’s shape (D-1, TASK-MUO122UPRPJQH)', () => {
  test('a nested incoming key is refused and nothing is stored', async () => {
    // It maps to `tenant-g/incoming/…`, itself a staging key a confirm would record.
    for (const key of ['tenant-g/incoming/incoming/x.pdf', 'tenant-g/incoming/incoming/certificate/2026/abcd1234_x.pdf']) {
      const res = await call(key);
      expect(res.status, key).toBe(403);
    }
    expect(state.puts).toBe(0);
  });
});
