import { readFileSync } from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Role } from '@prisma/client';

import { can, type Action } from '@/lib/rbac';
import { NG_PLAN_VIEW_ACTION } from '@/lib/billing/nexagrant/access';

/**
 * NG-64 — a tenant page the menu hides for a role is also closed to that role on
 * the server. Three parts:
 *   1. `requireTenantPageRole` lets through exactly the roles `can()` lets
 *      through (the answer is read from rbac.ts, never restated here) and
 *      refuses an unknown or missing role;
 *   2. the downloads behind those pages refuse a role without their action
 *      (`view_proposal`, and `manage_billing` for an invoice) before any tenant read;
 *   3. each page names its door in source, so a new copy of a page cannot drop it.
 */

const { m } = vi.hoisted(() => ({
  m: {
    scope: null as Record<string, unknown> | null,
    session: null as Record<string, unknown> | null,
    withTenant: vi.fn(),
  },
}));

class Forbidden extends Error {}

vi.mock('next/navigation', () => ({
  forbidden: vi.fn(() => {
    throw new Forbidden('NEXT_HTTP_ERROR_FALLBACK;403');
  }),
  redirect: vi.fn(),
}));
vi.mock('@/lib/tenant', () => ({
  requireTenantPage: vi.fn(async () => m.scope),
  requireTenantApi: vi.fn(async () =>
    m.scope ? { ok: true, scope: m.scope } : { ok: false, response: new Response(null, { status: 401 }) },
  ),
}));
vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => m.session) }));
vi.mock('@/lib/db', () => ({ withTenant: m.withTenant }));

import { requireTenantPageRole } from '@/lib/page-role';
import { GET as exportConceptNote } from '@/app/api/concept-notes/[id]/export/route';
import { GET as exportDocument } from '@/app/api/documents/export/route';
import { GET as exportInvoice } from '@/app/api/billing/invoices/[id]/export/route';

const ROLES: Role[] = ['TENANT_OWNER', 'TENANT_ADMIN', 'PIPELINE_MANAGER', 'WRITER', 'MEMBER', 'GUEST_PARTNER'];
const ACTIONS: Action[] = [
  'view_proposal',
  'view_partner_search',
  'request_dual_approval',
  'manage_users',
  'manage_billing',
  'evaluate_gates',
];

beforeEach(() => {
  m.scope = null;
  m.session = null;
  m.withTenant.mockReset();
  m.withTenant.mockImplementation(() => {
    throw new Error('REACHED_TENANT_READ');
  });
});

describe('requireTenantPageRole', () => {
  for (const action of ACTIONS) {
    for (const role of ROLES) {
      test(`${role} ${can(role, action) ? 'opens' : 'is refused'} a page behind ${action}`, async () => {
        m.scope = { tenantId: 't1', userId: 'u1', role, workspaceIds: [], isPlatformAdmin: false };
        const call = requireTenantPageRole('tr', action);
        if (can(role, action)) await expect(call).resolves.toBe(m.scope);
        else await expect(call).rejects.toBeInstanceOf(Forbidden);
      });
    }
  }

  test.each(['OWNER', 'SUPER_ADMIN', ''])('a role outside the enum (%j) is refused', async (role) => {
    m.scope = { tenantId: 't1', userId: 'u1', role, workspaceIds: [], isPlatformAdmin: false };
    await expect(requireTenantPageRole('tr', 'view_proposal')).rejects.toBeInstanceOf(Forbidden);
  });

  test('a scope without a role is refused, never read as MEMBER', async () => {
    m.scope = { tenantId: 't1', userId: 'u1', workspaceIds: [], isPlatformAdmin: false };
    await expect(requireTenantPageRole('tr', 'request_dual_approval')).rejects.toBeInstanceOf(Forbidden);
  });
});

describe('downloads behind view_proposal', () => {
  for (const role of ROLES) {
    const allowed = can(role, 'view_proposal');

    test(`concept note export: ${role} ${allowed ? 'passes the role door' : 'gets 403 before any read'}`, async () => {
      m.session = { user: { id: 'u1' }, tenantId: 't1', role };
      if (allowed) {
        await expect(exportConceptNote(new Request('http://x/api/concept-notes/n1/export'), { params: Promise.resolve({ id: 'n1' }) })).rejects.toThrow('REACHED_TENANT_READ');
        return;
      }
      const res = await exportConceptNote(new Request('http://x/api/concept-notes/n1/export'), { params: Promise.resolve({ id: 'n1' }) });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'Forbidden', code: 'FORBIDDEN_ROLE' });
      expect(m.withTenant).not.toHaveBeenCalled();
    });

    test(`document export: ${role} ${allowed ? 'passes the role door' : 'gets 403 before any read'}`, async () => {
      m.scope = { tenantId: 't1', userId: 'u1', role, workspaceIds: [], isPlatformAdmin: false };
      if (allowed) {
        await expect(exportDocument(new Request('http://x/api/documents/export?partId=p1'))).rejects.toThrow('REACHED_TENANT_READ');
        return;
      }
      const res = await exportDocument(new Request('http://x/api/documents/export?partId=p1'));
      expect(res.status).toBe(403);
      expect(m.withTenant).not.toHaveBeenCalled();
    });
  }

  test('a concept note export with no role on the session is refused', async () => {
    m.session = { user: { id: 'u1' }, tenantId: 't1', role: null };
    const res = await exportConceptNote(new Request('http://x/api/concept-notes/n1/export'), { params: Promise.resolve({ id: 'n1' }) });
    expect(res.status).toBe(403);
  });
});

describe('invoice export behind manage_billing (NG-64 review B-1)', () => {
  const call = () =>
    exportInvoice(new Request('http://x/api/billing/invoices/FB-1/export?format=xml'), {
      params: Promise.resolve({ id: 'FB-1' }),
    });

  for (const role of ROLES) {
    const allowed = can(role, 'manage_billing');
    test(`${role} ${allowed ? 'passes the role door' : 'gets 403 before any invoice read'}`, async () => {
      m.session = { user: { id: 'u1' }, tenantId: 't1', role };
      if (allowed) {
        // The read stub throws; the route turns that into its own 500, so the
        // proof the door let it through is that the read was attempted.
        await call();
        expect(m.withTenant).toHaveBeenCalledTimes(1);
        return;
      }
      const res = await call();
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'Forbidden', code: 'FORBIDDEN_ROLE' });
      expect(m.withTenant).not.toHaveBeenCalled();
    });
  }

  test.each([null, 'OWNER', 'SUPER_ADMIN'])('an invoice export with role %j is refused', async (role) => {
    m.session = { user: { id: 'u1' }, tenantId: 't1', role };
    const res = await call();
    expect(res.status).toBe(403);
    expect(m.withTenant).not.toHaveBeenCalled();
  });
});

/** Page file (under the workspace segment) → the action its door names. */
const PAGE_DOORS: Record<string, Action> = {
  'pipeline/page.tsx': 'view_proposal',
  'pipeline/[id]/page.tsx': 'view_proposal',
  'pipeline/[id]/consortium/page.tsx': 'view_proposal',
  'concept-notes/page.tsx': 'view_proposal',
  'concept-notes/[id]/page.tsx': 'view_proposal',
  'relationships/page.tsx': 'view_proposal',
  'relationships/[id]/page.tsx': 'view_proposal',
  'tto/page.tsx': 'view_proposal',
  'opportunities/[id]/application/page.tsx': 'view_proposal',
  'opportunities/[id]/briefs/page.tsx': 'view_proposal',
  'opportunities/[id]/documents/page.tsx': 'view_proposal',
  'opportunities/[id]/evaluations/page.tsx': 'view_proposal',
  'opportunities/[id]/m2/page.tsx': 'view_proposal',
  'opportunities/[id]/matching/page.tsx': 'view_proposal',
  'reports/person-days/page.tsx': 'view_proposal',
  'partners/page.tsx': 'view_partner_search',
  'partners/resources/page.tsx': 'view_partner_search',
  'partners/leaders/page.tsx': 'view_partner_search',
  // NG-257: CORDIS partner detail (M1 moduleGate alone before this).
  'partners/[pic]/page.tsx': 'view_partner_search',
  'settings/api-keys/page.tsx': 'view_partner_search',
  'approvals/page.tsx': 'request_dual_approval',
  'settings/members/page.tsx': 'manage_users',
  // NG-64 review B-1/B-2 (K-577543: existing actions only, rbac.ts unchanged).
  'settings/billing/page.tsx': 'manage_billing',
  'settings/gates/page.tsx': 'evaluate_gates',
  // Review R-1 (first round B-1), K-577556: a guest reviewer reaches the panel to
  // score; the panel-wide table stays behind view_proposal (checked below).
  'opportunities/[id]/evaluations/panel/page.tsx': 'contribute_assigned',
};

describe('each gated page names its door', () => {
  const root = path.join(process.cwd(), 'src/app/[locale]/(app)/[workspace]');
  for (const [file, action] of Object.entries(PAGE_DOORS)) {
    test(`${file} → ${action}`, () => {
      const source = readFileSync(path.join(root, file), 'utf8');
      expect(source).toContain(`requireTenantPageRole(locale, '${action}')`);
      // No second, ungated tenant lookup left beside the door.
      expect(source).not.toMatch(/\brequireTenantPage\(/);
      expect(source).not.toMatch(/from '@\/lib\/auth'/);
    });
  }
});

/**
 * NG-257: the role door runs before the M1 module gate. A role without the permission
 * must get the 403 screen, not the M1 "off" screen, so M1 state is not revealed to it.
 */
const ROLE_BEFORE_MODULE: ReadonlyArray<readonly [string, string]> = [
  ['partners/leaders/page.tsx', 'view_partner_search'],
  ['partners/[pic]/page.tsx', 'view_partner_search'],
  ['partners/page.tsx', 'view_partner_search'],
  ['partners/resources/page.tsx', 'view_partner_search'],
  ['settings/api-keys/page.tsx', 'view_partner_search'],
];

describe('role door runs before the M1 module gate (NG-257)', () => {
  const root = path.join(process.cwd(), 'src/app/[locale]/(app)/[workspace]');
  for (const [file, action] of ROLE_BEFORE_MODULE) {
    test(`${file}: requireTenantPageRole(${action}) precedes moduleGate('M1')`, () => {
      const source = readFileSync(path.join(root, file), 'utf8');
      const role = source.indexOf(`requireTenantPageRole(locale, '${action}')`);
      const mod = source.indexOf("moduleGate('M1', locale)");
      expect(role, 'role door call present').toBeGreaterThan(-1);
      expect(mod, 'M1 gate call present').toBeGreaterThan(-1);
      expect(role).toBeLessThan(mod);
    });
  }
});

/**
 * Pages whose door names a shared constant from `access.ts` instead of a literal (NG-11
 * F4). The permission name stays defined in that one file; the page must pass the
 * constant, and the constant must be the one this table is about.
 */
const PAGE_DOOR_CONSTANTS: Record<string, { name: 'NG_PLAN_VIEW_ACTION'; value: Action }> = {
  'settings/plan/page.tsx': { name: 'NG_PLAN_VIEW_ACTION', value: NG_PLAN_VIEW_ACTION },
};

describe('each constant-named page takes its door from access.ts (NG-11 F4)', () => {
  const root = path.join(process.cwd(), 'src/app/[locale]/(app)/[workspace]');
  for (const [file, { name, value }] of Object.entries(PAGE_DOOR_CONSTANTS)) {
    test(`${file} → ${name} (${value})`, () => {
      const source = readFileSync(path.join(root, file), 'utf8');
      expect(source).toContain(`requireTenantPageRole(locale, ${name})`);
      expect(source).toMatch(new RegExp(`import \\{[^}]*\\b${name}\\b[^}]*\\} from '@/lib/billing/nexagrant/access'`));
      expect(source).not.toMatch(/\brequireTenantPage\(/);
      expect(source).not.toMatch(/from '@\/lib\/auth'/);
    });
  }

  test('the constant names a permission that rbac.ts defines and that the plan screen gives TENANT_OWNER only', () => {
    expect(can('TENANT_OWNER', NG_PLAN_VIEW_ACTION)).toBe(true);
    for (const role of ROLES.filter((r) => r !== 'TENANT_OWNER')) {
      expect(can(role, NG_PLAN_VIEW_ACTION)).toBe(false);
    }
  });
});

describe('evaluation panel: the panel-wide scores are view_proposal only (review R-1)', () => {
  const source = readFileSync(
    path.join(process.cwd(), 'src/app/[locale]/(app)/[workspace]/opportunities/[id]/evaluations/panel/page.tsx'),
    'utf8',
  );

  // Comments stripped (review 3 Öneri-1): a gate named only in a comment, or a second
  // read outside the guarded branch, must not pass for the real thing.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  test('the page asks rbac.ts for view_proposal before it reads the panel scores', () => {
    expect(code).toMatch(/const seesPanel = can\(asRole\(role\), 'view_proposal'\);/);
    // The one call is the guarded one.
    expect(code.match(/listPanelScores\(/g)).toHaveLength(1);
    expect(code).toMatch(/seesPanel \? await listPanelScores\(/);
    expect(code.indexOf('const seesPanel')).toBeLessThan(code.indexOf('listPanelScores('));
  });

  test('GUEST_PARTNER may score but does not hold view_proposal', () => {
    expect(can('GUEST_PARTNER', 'contribute_assigned')).toBe(true);
    expect(can('GUEST_PARTNER', 'view_proposal')).toBe(false);
  });
});

/**
 * NG-258: the role door must run before the first read on the page. The NG-256 review
 * moved a door behind a tenant read and this file stayed green (the text check only
 * looks for the call). Scope of the scan: the body from `export default` on, comments
 * stripped. Helper functions defined above the export are NOT scanned, so a read hidden
 * in a helper is outside this check (documented limit, see the NG-258 report).
 */
const READ_CALL = /\bprisma\.|\bwithTenant\(|\bmoduleGate\(|\bauthenticateCordisSession\(|\bcheckModuleAccess\(/g;
const TENANT_READ = /\bprisma\.|\bwithTenant\(/;

/**
 * Pages where `moduleGate` ran before the role door (NG-258 finding, accepted as a
 * residual risk there). NG-275 moved the role door above `moduleGate` on all 16 pages,
 * so the map is empty. Keep it as the mechanism: an entry here is an explicit, reviewed
 * exception, and the test below fails if an entry stops being module-first or a tenant
 * read appears before its door.
 */
const MODULE_BEFORE_ROLE_ACCEPTED: Readonly<Record<string, string>> = {
};

describe('the role door precedes the first read on each gated page (NG-258)', () => {
  const root = path.join(process.cwd(), 'src/app/[locale]/(app)/[workspace]');
  for (const [file, action] of Object.entries(PAGE_DOORS)) {
    test(`${file}: requireTenantPageRole(${action}) comes before any read in the page body`, () => {
      const code = stripComments(readFileSync(path.join(root, file), 'utf8'));
      const at = code.indexOf('export default');
      expect(at, 'default export present (scan scope)').toBeGreaterThan(-1);
      const body = code.slice(at);
      const door = body.indexOf(`requireTenantPageRole(locale, '${action}')`);
      expect(door, 'role door call present in body').toBeGreaterThan(-1);
      const before = body.slice(0, door);
      const readsBefore = [...before.matchAll(READ_CALL)].map((m) => m[0]);

      if (file in MODULE_BEFORE_ROLE_ACCEPTED) {
        // Accepted exception: only the ModuleState lookup may precede the door.
        expect(readsBefore.length, 'accepted page still reads before its door (exception stale?)').toBeGreaterThan(0);
        expect(readsBefore.every((r) => r === 'moduleGate('), `non-module read before door: ${readsBefore.join(', ')}`).toBe(true);
        expect(before.search(TENANT_READ), 'tenant read before door').toBe(-1);
        return;
      }
      expect(readsBefore, `read(s) before the door: ${readsBefore.join(', ')}`).toEqual([]);
    });
  }
});

/**
 * NG-277 (NG-258 review T1; NG-275 review Ö-5): the check above reads only the page body's
 * literal calls. A read hidden in a helper that the page calls before its door, or a
 * `prisma.` call with no `await`, slipped past it.
 *
 * Chosen approach (b): an allowlist of the calls a page may make before its door. Every
 * other call in the body before the door fails, whatever it is. A helper is caught by its
 * call site, so its body does not need reading; a `prisma.`/`withTenant(` call is caught
 * with or without `await`; a non-call use of `prisma`/`withTenant`/`db` also fails.
 *
 * The allowlist is derived from today's scan of PAGE_DOORS. Only two calls appear before
 * a door: `getTranslations` (i18n string lookup, no tenant data) in
 * relationships/[id]/page.tsx and settings/plan/page.tsx. `params`/`searchParams` are
 * awaited property reads, not calls. Add a name only with a reviewed reason.
 */
const PRE_DOOR_ALLOWED: ReadonlySet<string> = new Set(['getTranslations']);
/**
 * Every `(` that starts a call, in any form: `f(`, `f?.(`, `f!(`, `f<T>(`, `o.f(`, and the
 * parenthesised callee `(f)(`. The name is optional so that `(f)()` (no identifier right
 * before the `(`) still matches, with an empty name that is never allowlisted.
 */
const CALL_SITE =
  /(?:([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*)?(?:!\s*)?(?:<[^>\n]*>\s*)?(?:\?\.)?\s*\(/g;
/** Tagged template `f\`...\`` calls `f` without parentheses. */
const TAGGED_TEMPLATE = /([A-Za-z_$][\w$]*)\s*`/g;
/** `new X` runs a constructor with or without parentheses. */
const NEW_EXPR = /\bnew\s+([A-Za-z_$][\w$]*)/g;
const DB_TOKEN = /\b(prisma|withTenant|db)\b/g;

/**
 * The page body from the default export's opening brace. The parameter list is found by
 * parenthesis balance and the body brace by angle-bracket balance, so a return-type
 * annotation (`}): Promise<X> {`) and a parameter type with braces do not move the start.
 * The body is the first `{` outside `<...>` after the parameter list's closing `)`.
 */
function bodyOf(code: string): string {
  const at = code.indexOf('export default');
  if (at === -1) return '';
  const open = code.indexOf('(', at);
  if (open === -1) return '';
  let parens = 0;
  let close = -1;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '(') parens++;
    else if (code[i] === ')' && --parens === 0) {
      close = i;
      break;
    }
  }
  if (close === -1) return '';
  let angles = 0;
  for (let i = close + 1; i < code.length; i++) {
    const c = code[i];
    if (c === '<') angles++;
    else if (c === '>') angles--;
    else if (c === '{' && angles === 0) return code.slice(i);
  }
  return '';
}

function preDoorViolations(body: string, door: number): string[] {
  const pre = body.slice(0, door);
  const named = [...pre.matchAll(CALL_SITE)].map((m) => m[1] ?? '');
  const tagged = [...pre.matchAll(TAGGED_TEMPLATE)].map((m) => `tagged:${m[1]}`);
  const news = [...pre.matchAll(NEW_EXPR)].map((m) => `new:${m[1]}`);
  const calls = named.filter((name) => !PRE_DOOR_ALLOWED.has(name));
  const db = [...pre.matchAll(DB_TOKEN)].map((m) => `token:${m[0]}`);
  return [...calls, ...tagged, ...news, ...db];
}

describe('nothing before the role door calls out except allowlisted calls (NG-277)', () => {
  const root = path.join(process.cwd(), 'src/app/[locale]/(app)/[workspace]');
  for (const [file, action] of Object.entries(PAGE_DOORS)) {
    test(`${file}: no call or DB token before requireTenantPageRole(${action})`, () => {
      const body = bodyOf(stripComments(readFileSync(path.join(root, file), 'utf8')));
      expect(body, 'default export body present (scan scope)').not.toBe('');
      const door = body.indexOf(`requireTenantPageRole(locale, '${action}')`);
      expect(door, 'role door call present in body').toBeGreaterThan(-1);
      expect(preDoorViolations(body, door), 'calls before the door').toEqual([]);
    });
  }
});

/**
 * NG-277 E1 / Ö1: the pre-door scan must catch every call form (not only `f(`) and must find
 * the body of a signature with a return type. Each fixture is a body that calls a helper
 * before the door; the scan must report it. Only `getTranslations` is allowed.
 */
describe('pre-door scan: call forms and signature shape (NG-277 E1, Ö1)', () => {
  const DOOR = "requireTenantPageRole(locale, 'view_proposal')";
  const callForms: ReadonlyArray<readonly [string, string]> = [
    ['plain call', "await leakHelper('t1');"],
    ['optional call (E1)', "await leakHelper?.('t1');"],
    ['non-null callee', "await leakHelper!('t1');"],
    ['non-null member call', 'await helper!.load();'],
    ['parenthesised callee', "await (leakHelper)('t1');"],
    ['generic call', "await leakHelper<string>('t1');"],
    ['constructor with parens', 'const h = new Helper();'],
    ['constructor without parens', 'const h = new Helper;'],
    ['tagged template', 'await leakHelper`t1`;'],
    ['non-awaited prisma read', 'const rows = prisma.opportunity.findMany();'],
  ];

  test.each(callForms)('%s before the door is a violation', (_label, line) => {
    const body = `{\n  ${line}\n  const x = await ${DOOR};\n}`;
    expect(preDoorViolations(body, body.indexOf(DOOR))).not.toEqual([]);
  });

  test('the allowlisted getTranslations call is not a violation', () => {
    const body = `{\n  const t = await getTranslations('x');\n  const x = await ${DOOR};\n}`;
    expect(preDoorViolations(body, body.indexOf(DOOR))).toEqual([]);
  });

  test('a return-type annotation with braces does not move the body start (Ö1)', () => {
    const src = [
      'export default async function P({ params }: { params: Promise<{ locale: string }> }): Promise<{ ok: true }> {',
      "  await leakHelper('t1');",
      `  const x = await ${DOOR};`,
      '}',
    ].join('\n');
    const body = bodyOf(src);
    expect(body.startsWith('{\n  await leakHelper')).toBe(true);
    expect(preDoorViolations(body, body.indexOf(DOOR))).toEqual(['leakHelper']);
  });
});

/** Comments stripped the same way the evaluation-panel check does (block + full-line). */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
