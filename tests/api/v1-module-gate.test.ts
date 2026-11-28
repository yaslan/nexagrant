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
      // NG-272: no NgSubscription row, so the NexaGrant gate passes (K-584603 = A).
      ngSubscription: { findUnique: async () => null },
      ngPlan: { findFirst: async () => ({ id: "ng-free" }), findUnique: async () => null },
      ngPlanFeature: { findMany: async () => [] },
    }),
}));

vi.mock('@/lib/billing', () => ({
  getEntitlements: async () => ({ allowedModules: db.allowedModules }),
}));

import { authenticateApiKey } from '@/lib/api-auth';

const DENIED_BODY = { error: 'MODULE_ACCESS_DENIED', module: 'M1' };

function call() {
  return authenticateApiKey(
    new Request('http://localhost/api/v1/calls', { headers: { 'x-api-key': KEY } }),
    { action: 'search_calls', feature: 'call_search' },
  );
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
      { action: 'search_calls', feature: 'call_search' },
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

/**
 * A route scan, not a runtime refusal: a new route that skips the call is caught
 * here or nowhere (src/lib/api-auth.ts). Matching on `withTenant|prisma` alone
 * missed routes that read through a helper (`partners/leaders` →
 * `coordinatorLeaders`) and never looked at whether the result was checked, so the
 * rule is now about the handler itself (TASK-MVDV63H2OCK0, FO-80 review §1-2):
 *
 *   1. every exported HTTP method is an `async function` whose body we can read;
 *   2. its first statement is `const x = await authenticateApiKey(req, null);`, so no
 *      call of any kind (a helper, a floating promise) runs before the key check;
 *   3. the very next statement is `if (!x.authenticated) … return`.
 *
 * Rule 2 is what catches a read through a helper with no `await`: the data-access
 * text check on `withTenant|withSystemScope|prisma` alone cannot see those.
 */
const HTTP_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const DATA_ACCESS = /\b(withTenant|withSystemScope|prisma)\s*[.(]/;
// The second argument is the route's NexaGrant gate (NG-272): an object literal, or `null` for a route no feature covers.
const AUTH_GUARD = /const (\w+) = await authenticateApiKey\(req, (?:\{[^}]*\}|null)\);\s*if \(!\1\.authenticated\)\s*\{?\s*return\b/;

/** Comments are dropped, so a `prisma.` or an `await` in a doc comment does not count. */
function codeOf(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Index just past the bracket that closes the one at `open`. */
function closeOf(src: string, open: number, l: string, r: string): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === l) depth++;
    else if (src[i] === r && --depth === 0) return i + 1;
  }
  return -1;
}

/** What is wrong with each exported handler of a route file; empty when it is gated. */
function authOrderProblems(source: string): string[] {
  const src = codeOf(source);
  const problems: string[] = [];
  const exported = [...src.matchAll(/export\s+(?:const|let|var|async\s+function|function)\s+(\w+)/g)]
    .filter((m) => HTTP_METHODS.includes(m[1]!));
  if (exported.length === 0) problems.push('no exported HTTP handler');
  // `export { list as POST }` names a method the declaration scan above cannot see (FO-86 review §1).
  for (const m of src.matchAll(/export\s*\{[^}]*\b(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)\b[^}]*\}/g)) {
    problems.push(`${m[1]}: exported through an export list, the scan cannot read it`);
  }
  // `export const { POST } = handlers` and `export * from` hide a method from both scans above (FO-127 review).
  if (/export\s+(?:const|let|var)\s*[{[]/.test(src)) problems.push('a destructured export, the scan cannot read it');
  if (/export\s*\*/.test(src)) problems.push('`export *`, the scan cannot read it');

  for (const m of exported) {
    const method = m[1]!;
    const fn = new RegExp(`export\\s+async\\s+function\\s+${method}\\s*\\(`).exec(src);
    if (!fn) {
      problems.push(`${method}: not an exported async function, the scan cannot read it`);
      continue;
    }
    const paramsEnd = closeOf(src, fn.index + fn[0].length - 1, '(', ')');
    const bodyOpen = src.indexOf('{', paramsEnd);
    const body = src.slice(bodyOpen + 1, closeOf(src, bodyOpen, '{', '}') - 1);

    const guard = AUTH_GUARD.exec(body);
    if (!guard) {
      problems.push(`${method}: no \`const x = await authenticateApiKey(req, null); if (!x.authenticated) return\``);
      continue;
    }
    const leadingWhitespace = body.length - body.trimStart().length;
    if (guard.index !== leadingWhitespace) {
      problems.push(`${method}: authenticateApiKey is not the first statement`);
    }
    if (body.search(/\bawait\b/) !== guard.index + guard[0].indexOf('await')) {
      problems.push(`${method}: something is awaited before authenticateApiKey`);
    }
    const dataAt = body.search(DATA_ACCESS);
    if (dataAt !== -1 && dataAt < guard.index) problems.push(`${method}: data is read before authenticateApiKey`);
  }
  return problems;
}

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

  test.each(files.map((f) => [relative(root, f), f]))(
    '%s authenticates first and checks the result before anything else',
    (_name, file) => {
      expect(authOrderProblems(readFileSync(file, 'utf8'))).toEqual([]);
    },
  );
});

describe('the route scan itself refuses the wrong orders', () => {
  const GOOD = `
    export async function GET(req: Request, { params }: { params: Promise<{ pic: string }> }) {
      // await something() in a comment is not code
      const authRes = await authenticateApiKey(req, null);
      if (!authRes.authenticated) {
        return authRes.errorResponse;
      }
      const rows = await coordinatorLeaders({});
      return NextResponse.json(rows);
    }`;

  test('the shape every route uses passes', () => {
    expect(authOrderProblems(GOOD)).toEqual([]);
  });

  test.each([
    [
      'a helper read before the auth call (no prisma/withTenant text)',
      `export async function GET(req: Request) {
        const rows = await coordinatorLeaders({});
        const authRes = await authenticateApiKey(req, null);
        if (!authRes.authenticated) return authRes.errorResponse;
        return NextResponse.json(rows);
      }`,
      'something is awaited before authenticateApiKey',
    ],
    [
      'the auth result is never checked',
      `export async function GET(req: Request) {
        const authRes = await authenticateApiKey(req, null);
        const rows = await coordinatorLeaders({ tenant: authRes });
        return NextResponse.json(rows);
      }`,
      'no `const x = await authenticateApiKey(req, null); if (!x.authenticated) return`',
    ],
    [
      'the check comes after another statement',
      `export async function GET(req: Request) {
        const authRes = await authenticateApiKey(req, null);
        const rows = await coordinatorLeaders({});
        if (!authRes.authenticated) return authRes.errorResponse;
        return NextResponse.json(rows);
      }`,
      'no `const x = await authenticateApiKey(req, null); if (!x.authenticated) return`',
    ],
    [
      'the check tests a different variable',
      `export async function GET(req: Request) {
        const authRes = await authenticateApiKey(req, null);
        if (!other.authenticated) return other.errorResponse;
        return NextResponse.json([]);
      }`,
      'no `const x = await authenticateApiKey(req, null); if (!x.authenticated) return`',
    ],
    [
      'a helper call without await before the auth call (no prisma/withTenant text)',
      `export async function GET(req: Request) {
        const pending = coordinatorLeaders({});
        const authRes = await authenticateApiKey(req, null);
        if (!authRes.authenticated) return authRes.errorResponse;
        return NextResponse.json(await pending);
      }`,
      'authenticateApiKey is not the first statement',
    ],
    [
      'a floating prisma read started before the auth call',
      `export async function GET(req: Request) {
        const pending = prisma.topic.findMany();
        const authRes = await authenticateApiKey(req, null);
        if (!authRes.authenticated) return authRes.errorResponse;
        return NextResponse.json(await pending);
      }`,
      'data is read before authenticateApiKey',
    ],
    [
      'a handler the scan cannot read',
      `export const GET = withSomething(async (req: Request) => NextResponse.json([]));`,
      'not an exported async function, the scan cannot read it',
    ],
    ['no handler at all', `export const dynamic = 'force-dynamic';`, 'no exported HTTP handler'],
    [
      'a handler exported through an export list (`as POST`)',
      `export async function GET(req: Request) {
        const authRes = await authenticateApiKey(req, null);
        if (!authRes.authenticated) return authRes.errorResponse;
        return NextResponse.json([]);
      }
      async function list(req: Request) { return GET(req); }
      export { list as POST };`,
      'POST: exported through an export list, the scan cannot read it',
    ],
    [
      'a handler exported by destructuring (NextAuth `export const { GET, POST } = handlers`)',
      `export async function GET(req: Request) {
        const authRes = await authenticateApiKey(req, null);
        if (!authRes.authenticated) return authRes.errorResponse;
        return NextResponse.json([]);
      }
      export const { POST } = handlers;`,
      'a destructured export, the scan cannot read it',
    ],
    [
      'a handler re-exported from another module (`export * from`)',
      `export async function GET(req: Request) {
        const authRes = await authenticateApiKey(req, null);
        if (!authRes.authenticated) return authRes.errorResponse;
        return NextResponse.json([]);
      }
      export * from './impl';`,
      '`export *`, the scan cannot read it',
    ],
  ])('%s', (_name, src, problem) => {
    expect(authOrderProblems(src).join('\n')).toContain(problem);
  });

  test('every handler in a file is checked, not just the first', () => {
    const bad = `${GOOD}
      export async function POST(req: Request) {
        const body = await req.json();
        const authRes = await authenticateApiKey(req, null);
        if (!authRes.authenticated) return authRes.errorResponse;
        return NextResponse.json(body);
      }`;
    expect(authOrderProblems(bad)).toEqual([
      'POST: authenticateApiKey is not the first statement',
      'POST: something is awaited before authenticateApiKey',
    ]);
  });
});
