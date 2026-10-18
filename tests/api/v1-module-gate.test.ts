/**
 * TASK-MVDPYNG1JI0S1 (FO-80) — the Partner REST API is the M1 module. A key keeps
 * authenticating after its tenant turns M1 off or drops the plan, so the gate
 * sits in authenticateApiKey, after the key and its count, and every /api/v1
 * route passes through it. The decision itself is the one the session gate uses
 * (checkModuleAccessForTenant → decideModuleAccess); this file pins what the API
 * answers for each combination of the two facts.
 */
import crypto from 'crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, test, expect, vi, beforeEach } from 'vitest';

const KEY = 'fp_live_module_gate_0001';
const HASH = crypto.createHash('sha256').update(KEY).digest('hex');

const db = vi.hoisted(() => ({
  /** `ModuleState.status` for M1, null when the tenant has no row (= OFF), 'THROW' to fail the read. */
  moduleStatus: 'ON' as string | null,
  /** What `getEntitlements` says the plan plus add-ons include. */
  allowedModules: ['M1'] as string[],
  queryRaw: vi.fn(),
  moduleStateReads: 0,
}));

vi.mock('@/lib/system-scope', () => ({
  withSystemScope: async <T,>(_p: string, _c: string, cb: (tx: unknown) => Promise<T>) =>
    cb({
      apiKey: {
        findUnique: async ({ where }: { where: { keyHash: string } }) =>
          where.keyHash === HASH ? { id: 'k1', tenantId: 't1', name: 'unit' } : null,
      },
    }),
}));

vi.mock('@/lib/db', () => ({
  withTenant: async <T,>(_t: string, cb: (tx: unknown) => Promise<T>) =>
    cb({
      $queryRaw: db.queryRaw,
      moduleState: {
        findUnique: async () => {
          db.moduleStateReads += 1;
          if (db.moduleStatus === 'THROW') throw new Error('connection refused');
          return db.moduleStatus === null ? null : { status: db.moduleStatus };
        },
      },
    }),
}));

vi.mock('@/lib/billing', () => ({
  getEntitlements: async () => ({ allowedModules: db.allowedModules }),
}));

import { authenticateApiKey } from '@/lib/api-auth';

const DENIED_BODY = { error: 'MODULE_ACCESS_DENIED', module: 'M1' };

function call() {
  return authenticateApiKey(new Request('http://localhost/api/v1/calls', { headers: { 'x-api-key': KEY } }));
}

beforeEach(() => {
  db.moduleStatus = 'ON';
  db.allowedModules = ['M1'];
  db.moduleStateReads = 0;
  db.queryRaw.mockReset();
  db.queryRaw.mockResolvedValue([{ count: 1, windowStartedAt: new Date() }]);
});

describe('/api/v1 is gated by M1 (module status and plan)', () => {
  test('M1 on and in the plan: the key authenticates', async () => {
    const res = await call();
    expect(res.authenticated).toBe(true);
  });

  test('M1 switched off: 403 MODULE_ACCESS_DENIED, nothing else about the module leaks', async () => {
    db.moduleStatus = 'OFF';
    const res = await call();
    expect(res.authenticated).toBe(false);
    if (res.authenticated) return;
    expect(res.errorResponse.status).toBe(403);
    expect(await res.errorResponse.json()).toEqual(DENIED_BODY);
  });

  test('no ModuleState row at all is OFF', async () => {
    db.moduleStatus = null;
    const res = await call();
    expect(res.authenticated).toBe(false);
    if (res.authenticated) return;
    expect(res.errorResponse.status).toBe(403);
  });

  test('switched on but the plan no longer includes M1 (downgrade leftover): 403', async () => {
    db.allowedModules = [];
    const res = await call();
    expect(res.authenticated).toBe(false);
    if (res.authenticated) return;
    expect(res.errorResponse.status).toBe(403);
    expect(await res.errorResponse.json()).toEqual(DENIED_BODY);
  });

  test('PILOT stays open to the tenant key as a machine audience: 200', async () => {
    db.moduleStatus = 'PILOT';
    const res = await call();
    expect(res.authenticated).toBe(true);
  });

  test('DEV is for FonBridge staff, and a key is not staff: 403', async () => {
    db.moduleStatus = 'DEV';
    const res = await call();
    expect(res.authenticated).toBe(false);
    if (res.authenticated) return;
    expect(res.errorResponse.status).toBe(403);
  });

  test('an unknown key is still 401 and never reaches the module read', async () => {
    const res = await authenticateApiKey(
      new Request('http://localhost/api/v1/calls', { headers: { 'x-api-key': 'fp_live_nope' } }),
    );
    expect(res.authenticated).toBe(false);
    if (res.authenticated) return;
    expect(res.errorResponse.status).toBe(401);
    expect(await res.errorResponse.json()).toMatchObject({ code: 'AUTH_INVALID_API_KEY' });
    expect(db.moduleStateReads).toBe(0);
  });

  test('a denied request still spends its place in the key counter (the count runs first)', async () => {
    db.moduleStatus = 'OFF';
    await call();
    expect(db.queryRaw).toHaveBeenCalledTimes(1);
  });

  test('a failed module read fails closed as 500, not open', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.moduleStatus = 'THROW';
    const res = await call();
    expect(res.authenticated).toBe(false);
    if (res.authenticated) return;
    expect(res.errorResponse.status).toBe(500);
    errSpy.mockRestore();
  });
});

describe('every /api/v1 route goes through authenticateApiKey', () => {
  function routeFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? routeFiles(path) : name === 'route.ts' ? [path] : [];
    });
  }

  const root = join(__dirname, '..', '..', 'src', 'app', 'api', 'v1');
  const files = routeFiles(root);

  test('there are routes to check', () => {
    expect(files.length).toBeGreaterThanOrEqual(5);
  });

  // Comments are dropped first, so a `prisma.` mentioned in a doc comment does not
  // count as a read. The first real data access must come after the auth call.
  const DATA_ACCESS = /\b(withTenant|withSystemScope|prisma)\s*[.(]/;
  const AUTH_CALL = /await authenticateApiKey\(req\)/;

  function codeOf(file: string): string {
    return readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
  }

  test.each(files.map((f) => [relative(root, f), f]))('%s authenticates before it reads data', (_name, file) => {
    const src = codeOf(file);
    const authAt = src.search(AUTH_CALL);
    expect(authAt).toBeGreaterThanOrEqual(0);
    const dataAt = src.search(DATA_ACCESS);
    if (dataAt !== -1) expect(authAt).toBeLessThan(dataAt);
  });
});
