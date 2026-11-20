import { readFileSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';
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
 * looks for the call). Scope of the scan: the default export's body, from its opening `{`
 * on, comments stripped. The signature sits before that `{` and is outside this scan; it
 * has its own checks (NG-277 B1, B2). Helper functions defined above the export are NOT
 * scanned, so a read hidden in a helper is outside this check (documented limit, see the
 * NG-258 report).
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
      const { body, door } = scopeOf(stripComments(readFileSync(path.join(root, file), 'utf8')), action);
      expect(body, 'default export body present (scan scope)').not.toBe('');
      expect(door, 'role door is a direct statement of the body').toBeGreaterThan(-1);
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
 * The allowlist is derived from today's scan of PAGE_DOORS. The only call that appears before
 * a door is `getTranslations` (i18n string lookup, no tenant data) in
 * relationships/[id]/page.tsx (line 31, door at line 32). `params`/`searchParams` are
 * awaited property reads, not calls. Add a name only with a reviewed reason.
 */
const PRE_DOOR_ALLOWED: ReadonlySet<string> = new Set(['getTranslations']);
/**
 * Every `(` that starts a call, in any form: `f(`, `f?.(`, `f!(`, `f<T>(`, `o.f(`, and the
 * parenthesised callee `(f)(`. The name is optional so that `(f)()` (no identifier right
 * before the `(`) still matches; such a match is reported as ANONYMOUS_PAREN, never allowlisted.
 */
const CALL_SITE =
  /(?:([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*)?(?:!\s*)?(?:<[^>\n]*>\s*)?(?:\?\.)?\s*\(/g;
/** Tagged template `f\`...\`` calls `f` without parentheses. */
const TAGGED_TEMPLATE = /([A-Za-z_$][\w$]*)\s*`/g;
/** `new X` runs a constructor with or without parentheses. */
const NEW_EXPR = /\bnew\s+([A-Za-z_$][\w$]*)/g;
const DB_TOKEN = /\b(prisma|withTenant|db)\b/g;
/**
 * NG-277 review 2 Ö1: a `(` with no name in front of it. It is either a parenthesised callee
 * `(f)(...)` or a plain grouping `(1 + 2)`; the text scan cannot tell them apart, so it fails
 * closed and says so instead of reporting an empty string.
 */
const ANONYMOUS_PAREN = '(anonymous parenthesised expression or call: name the callee or move it after the door)';
/** Top-level `await` runs while the module loads (B2); in the body `await params` is fine. */
const AWAIT_TOKEN = /\bawait\b/g;

function parseTsx(code: string): ts.SourceFile {
  return ts.createSourceFile('page.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

/**
 * The default export's function declaration, found by the parser. A string or a comment that
 * spells `export default` cannot stand in for it (NG-277 E4: the old text search could).
 */
function defaultExportFn(sf: ts.SourceFile): ts.FunctionDeclaration | undefined {
  return sf.statements.find(
    (st): st is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(st) && hasModifier(st, ts.SyntaxKind.ExportKeyword) && hasModifier(st, ts.SyntaxKind.DefaultKeyword),
  );
}

/** Is `node` the call `requireTenantPageRole(locale, '<action>')`? */
function isDoorCall(node: ts.Node, action: string): node is ts.CallExpression {
  if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return false;
  if (node.expression.text !== 'requireTenantPageRole' || node.arguments.length !== 2) return false;
  const [first, second] = node.arguments;
  return first !== undefined && ts.isIdentifier(first) && first.text === 'locale' &&
    second !== undefined && ts.isStringLiteral(second) && second.text === action;
}

/**
 * The default export's body, from its opening brace, and the offset of its role door inside it.
 * The door must be a DIRECT statement of the body: `await door` as an expression statement, or
 * the initializer of a single `const`. A door inside `if`, a ternary or an arrow function is
 * not a door (`door: -1`), so the reads after it are not treated as guarded (NG-277 E5).
 * Found by the parser, not by text search: a string that spells the door cannot move it.
 * With `action` '' the door is always -1; only the body is used then.
 */
function scopeOf(code: string, action: string): { body: string; door: number } {
  const sf = parseTsx(code);
  const fn = defaultExportFn(sf);
  if (!fn?.body) return { body: '', door: -1 };
  const start = fn.body.getStart(sf);
  const body = code.slice(start);
  for (const st of fn.body.statements) {
    let init: ts.Expression | undefined;
    if (ts.isExpressionStatement(st)) init = st.expression;
    else if (ts.isVariableStatement(st) && st.declarationList.declarations.length === 1) {
      init = st.declarationList.declarations[0]?.initializer;
    }
    if (!init) continue;
    const call = ts.isAwaitExpression(init) ? init.expression : init;
    if (isDoorCall(call, action)) return { body, door: call.getStart(sf) - start };
  }
  return { body, door: -1 };
}

/** The page body from the default export's opening brace (see scopeOf). */
function bodyOf(code: string): string {
  return scopeOf(code, '').body;
}

/**
 * Decorators run when the class is defined, with or without parentheses. The text scan only
 * sees `f(`, so each decorator is found in the parse tree (NG-277 E1).
 */
function decoratorsIn(code: string): Array<{ pos: number; text: string }> {
  const sf = parseTsx(code);
  const out: Array<{ pos: number; text: string }> = [];
  const visit = (node: ts.Node): void => {
    if (ts.canHaveDecorators(node)) {
      for (const d of ts.getDecorators(node) ?? []) out.push({ pos: d.getStart(sf), text: `decorator:${d.getText(sf)}` });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/**
 * NG-277 E3: an allowlisted name is trusted only when it is imported from `next-intl/server`
 * and nothing else in the file declares the same name. Otherwise a page could define a local
 * `getTranslations` (or import one from a module that reads the database) and call it before
 * the door.
 */
function allowedFor(code: string): ReadonlySet<string> {
  const sf = parseTsx(code);
  const imported = new Set<string>();
  const declared = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text === 'next-intl/server' && node.importClause?.namedBindings &&
      ts.isNamedImports(node.importClause.namedBindings)
    ) {
      for (const el of node.importClause.namedBindings.elements) imported.add(el.name.text);
    }
    const named =
      ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) || ts.isClassDeclaration(node) || ts.isClassExpression(node) ||
      ts.isBindingElement(node)
        ? node.name
        : undefined;
    if (named && ts.isIdentifier(named)) declared.add(named.text);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return new Set([...PRE_DOOR_ALLOWED].filter((name) => imported.has(name) && !declared.has(name)));
}

function preDoorViolations(body: string, door: number, allowed: ReadonlySet<string> = PRE_DOOR_ALLOWED): string[] {
  const pre = body.slice(0, door);
  const named = [...pre.matchAll(CALL_SITE)].map((m) => m[1] ?? ANONYMOUS_PAREN);
  const tagged = [...pre.matchAll(TAGGED_TEMPLATE)].map((m) => `tagged:${m[1]}`);
  const news = [...pre.matchAll(NEW_EXPR)].map((m) => `new:${m[1]}`);
  const calls = named.filter((name) => !allowed.has(name));
  const db = [...pre.matchAll(DB_TOKEN)].map((m) => `token:${m[0]}`);
  const decorators = decoratorsIn(body).filter((d) => d.pos < door).map((d) => d.text);
  return [...calls, ...tagged, ...news, ...db, ...decorators];
}

describe('nothing before the role door calls out except allowlisted calls (NG-277)', () => {
  const root = path.join(process.cwd(), 'src/app/[locale]/(app)/[workspace]');
  for (const [file, action] of Object.entries(PAGE_DOORS)) {
    test(`${file}: no call or DB token before requireTenantPageRole(${action})`, () => {
      const code = stripComments(readFileSync(path.join(root, file), 'utf8'));
      const { body, door } = scopeOf(code, action);
      expect(body, 'default export body present (scan scope)').not.toBe('');
      expect(door, 'role door is a direct statement of the body').toBeGreaterThan(-1);
      const found = preDoorViolations(body, door, allowedFor(code));
      expect(found, `calls before the door: ${found.join(' | ')}`).toEqual([]);
    });
  }
});

/**
 * NG-277 review 2, B1 + B2: the body scan above starts at the body's `{`, so two places that
 * also run before the door were never read:
 *   B1 — the default export's parameter list: a default value (`{ params, q = load() }`) is
 *        evaluated when the page is called, before the first body statement;
 *   B2 — module top level: everything outside a function body runs when the page module
 *        loads, before any request reaches the door (`const pre = prisma.x.findMany();`).
 *
 * Design. A flat text scan from the top of the file would read every helper body and fail
 * on legitimate definitions, so the file is parsed with the TypeScript compiler (as the
 * other source-scan tests here do) and only code that RUNS is handed to the same text scan:
 *   - skipped, because nothing in them executes at load: `import` (the imported module's
 *     own top level is out of scope, see the report), `export { } [from]`, `type`,
 *     `interface`, `declare`, function declarations (body and parameter defaults run only
 *     when called), and a `const`/`let` whose initializer is an arrow or function
 *     expression (its body is a definition too);
 *   - scanned, everything else at top level, before AND after the default export: the
 *     initializer of every other declaration (and a destructuring pattern's defaults), and
 *     any other statement whole (expression statements, classes, enums, `export default
 *     <expr>`). A wrapper call such as `cache(async () => ...)` is therefore red even though
 *     the inner body would not run: fail-closed, the call itself does run;
 *   - the default export function: each parameter without its type annotation (types do
 *     not run), so a default value or a destructuring default is scanned.
 * Module and signature code get NO allowlist (`getTranslations` is allowed only in the
 * body, where today's pages use it) and top-level `await` is a violation. A page whose
 * default export is not a function declaration fails: the scan cannot locate its door.
 */
interface OutsideBodyScan {
  /** The default export is an `export default [async] function`. */
  defaultFunction: boolean;
  /** Calls/DB tokens/`await` in code that runs when the module loads. */
  moduleLoad: string[];
  /** Calls/DB tokens in the default export's parameter list (defaults, destructuring). */
  signature: string[];
}

const NO_ALLOWLIST: ReadonlySet<string> = new Set();

function runsOnLoad(text: string): string[] {
  const code = stripComments(text);
  const awaits = [...code.matchAll(AWAIT_TOKEN)].map(() => 'token:await');
  return [...preDoorViolations(code, code.length, NO_ALLOWLIST), ...awaits];
}

function unwrap(expr: ts.Expression): ts.Expression {
  let e = expr;
  while (
    ts.isParenthesizedExpression(e) ||
    ts.isAsExpression(e) ||
    ts.isSatisfiesExpression(e) ||
    ts.isTypeAssertionExpression(e) ||
    ts.isNonNullExpression(e)
  ) {
    e = e.expression;
  }
  return e;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === kind);
}

function scanOutsideBody(source: string, fileName = 'page.tsx'): OutsideBodyScan {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const text = (n: ts.Node) => source.slice(n.getStart(sf), n.getEnd());
  const out: OutsideBodyScan = { defaultFunction: false, moduleLoad: [], signature: [] };

  for (const st of sf.statements) {
    if (
      ts.isImportDeclaration(st) ||
      ts.isImportEqualsDeclaration(st) ||
      ts.isExportDeclaration(st) ||
      ts.isTypeAliasDeclaration(st) ||
      ts.isInterfaceDeclaration(st) ||
      hasModifier(st, ts.SyntaxKind.DeclareKeyword)
    ) {
      continue;
    }
    if (ts.isFunctionDeclaration(st)) {
      if (hasModifier(st, ts.SyntaxKind.ExportKeyword) && hasModifier(st, ts.SyntaxKind.DefaultKeyword)) {
        out.defaultFunction = true;
        for (const p of st.parameters) {
          // `name: Type = init` — scan the name (a destructuring pattern carries defaults)
          // and the initializer; the type annotation does not run.
          out.signature.push(...runsOnLoad(text(p.name)));
          if (p.initializer) out.signature.push(...runsOnLoad(text(p.initializer)));
        }
      }
      continue;
    }
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) out.moduleLoad.push(...runsOnLoad(text(d.name)));
        if (!d.initializer) continue;
        const init = unwrap(d.initializer);
        if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) continue;
        out.moduleLoad.push(...runsOnLoad(text(d.initializer)));
      }
      continue;
    }
    out.moduleLoad.push(...runsOnLoad(text(st)));
  }
  return out;
}

describe('nothing at module load or in the page signature calls out (NG-277 B1, B2)', () => {
  const root = path.join(process.cwd(), 'src/app/[locale]/(app)/[workspace]');
  for (const file of Object.keys(PAGE_DOORS)) {
    test(`${file}: no call, DB token or await at top level or in the default export's parameters`, () => {
      const scan = scanOutsideBody(readFileSync(path.join(root, file), 'utf8'), file);
      expect(scan.defaultFunction, 'default export is a function declaration (scan scope)').toBe(true);
      expect(scan.signature, 'runs in the default export parameter list, before the door').toEqual([]);
      expect(scan.moduleLoad, 'runs at module load, before the door').toEqual([]);
    });
  }
});

describe('module-load and signature scan: what runs and what is only defined (NG-277 B1, B2)', () => {
  const PAGE = [
    'export default async function P({',
    '  params,',
    '}: {',
    '  params: Promise<{ locale: string }>;',
    '}) {',
    '  const { locale } = await params;',
    "  const { tenantId } = await requireTenantPageRole(locale, 'view_proposal');",
    '  return tenantId;',
    '}',
  ].join('\n');

  test('B1: a call in a destructuring default of the default export is a violation', () => {
    const src = PAGE.replace('  params,\n', "  params,\n  q = leakHelper('t1'),\n");
    expect(scanOutsideBody(src).signature).toEqual(['leakHelper']);
  });

  test('B1: a default value of a plain parameter is a violation', () => {
    const src = PAGE.replace('}) {', '}, rows = prisma.opportunity.findMany()) {');
    expect(scanOutsideBody(src).signature).toEqual(['prisma.opportunity.findMany', 'token:prisma']);
  });

  test('B1: the parameter type annotation, even with a function type, is not scanned', () => {
    const src = PAGE.replace('  params: Promise<{ locale: string }>;', '  params: Promise<{ locale: string }>;\n  cb?: (x: string) => void;');
    expect(scanOutsideBody(src)).toEqual({ defaultFunction: true, moduleLoad: [], signature: [] });
  });

  test.each([
    ['B2: non-awaited prisma read', 'const pre = prisma.opportunity.findMany();', ['prisma.opportunity.findMany', 'token:prisma']],
    ['top-level await', 'const pre = await loaded;', ['token:await']],
    ['expression statement', "void leakHelper('t1');", ['leakHelper']],
    ['destructuring default', "const { a = leakHelper('t1') } = {};", ['leakHelper']],
    ['wrapper call around a definition (fail-closed)', 'const load = cache(async () => 1);', ['cache', 'async']],
    ['constructor', 'const h = new Helper();', ['Helper', 'new:Helper']],
    ['getTranslations is not allowlisted at module level', "const t = getTranslations('x');", ['getTranslations']],
  ] as const)('%s at top level is a violation', (_label, line, expected) => {
    expect(scanOutsideBody(`${line}\n\n${PAGE}`).moduleLoad).toEqual(expected);
  });

  test('B2: code after the default export also runs at load and is scanned', () => {
    expect(scanOutsideBody(`${PAGE}\n\nconst late = leakHelper();\n`).moduleLoad).toEqual(['leakHelper']);
  });

  test('definitions, imports, types and plain constants at top level are not violations', () => {
    const src = [
      "import { withTenant } from '@/lib/db';",
      "import { prisma } from '@/lib/prisma';",
      "export { x } from './x';",
      'type Row = { id: string; load: () => Promise<void> };',
      'interface Seat { fn(a: string): void }',
      "export const dynamic = 'force-dynamic';",
      "const DIMENSIONS: (keyof Row)[] = ['id'];",
      'const daysSince = (d: Date | null) => { return d ? Math.floor(Date.now() / 864e5) : null; };',
      'const viaExpr = async function () { return prisma.opportunity.findMany(); };',
      'async function leakHelper(t: string) { return withTenant(t, (tx) => tx.opportunity.findMany()); }',
      'export async function generateMetadata({ params }: { params: Promise<{ l: string }> }) { return { title: await t(params) }; }',
      PAGE,
      'function Section({ children }: { children: unknown }) { return render(children); }',
    ].join('\n\n');
    expect(scanOutsideBody(src)).toEqual({ defaultFunction: true, moduleLoad: [], signature: [] });
  });

  test('a default export that is not a function declaration fails the scope check', () => {
    expect(scanOutsideBody('const P = async () => null;\nexport default P;\n').defaultFunction).toBe(false);
    const wrapped = scanOutsideBody('export default withGate(async function P() { return null; });\n');
    expect(wrapped.defaultFunction).toBe(false);
    expect(wrapped.moduleLoad).toContain('withGate');
  });
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

  test('an unnamed parenthesised expression says what it is (review 2 Ö1)', () => {
    const body = `{\n  const n = (1 + 2);\n  const x = await ${DOOR};\n}`;
    expect(preDoorViolations(body, body.indexOf(DOOR))).toEqual([ANONYMOUS_PAREN]);
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

/**
 * Blank out the REAL comments and keep every other character at its offset, so the text scans
 * see code. The comment ranges come from the TypeScript parser, not a regex: a string, template,
 * regex literal or JSX text that spells `/*` or `//` is not a comment and stays scanned
 * (NG-277 E2). Measured on the 25 pages: leaving comments in turns 8 of them red (JSDoc names
 * `prisma.` and other calls), so comments are stripped, and exactly.
 */
function stripComments(source: string): string {
  const sf = parseTsx(source);
  const ranges = new Map<number, number>();
  const visit = (node: ts.Node): void => {
    // JSX text is text, not trivia: `/*` in it is not a comment, and the trivia lookup below
    // would otherwise blank everything after it (NG-277 E2, found by the JSX fixture).
    if (node.kind === ts.SyntaxKind.JsxText || node.kind === ts.SyntaxKind.JsxTextAllWhiteSpaces) return;
    const children = node.getChildren(sf);
    if (children.length > 0) {
      for (const child of children) visit(child);
      return;
    }
    // A leaf token's trivia is exactly [pos, getStart): a comment counts only inside it.
    const start = node.getStart(sf);
    const found = [...(ts.getLeadingCommentRanges(source, node.pos) ?? []), ...(ts.getTrailingCommentRanges(source, node.pos) ?? [])];
    for (const r of found) if (r.end <= start) ranges.set(r.pos, r.end);
  };
  visit(sf);
  let out = '';
  let last = 0;
  for (const pos of [...ranges.keys()].sort((a, b) => a - b)) {
    const end = ranges.get(pos) ?? pos;
    out += source.slice(last, pos) + source.slice(pos, end).replace(/[^\r\n]/g, ' ');
    last = end;
  }
  return out + source.slice(last);
}

/**
 * NG-277 round 4: each fixture is a page or body that the scan must report (E1 decorators,
 * E2 comment look-alikes, E3 shadowed allowlist, E4 `export default` text, E5 door shape),
 * and the negative fixtures show that real comments and a decorator after the door pass.
 */
describe('round 4 fixtures: decorators, comment look-alikes, shadowed allowlist, door shape (NG-277 E1-E5)', () => {
  const DOOR = "requireTenantPageRole(locale, 'view_proposal')";
  const HEAD = 'export default async function P({ params }: { params: Promise<{ locale: string }> }) {';
  const PAGE_CALL = [HEAD, "  const t = await getTranslations('x');", `  const { tenantId } = await ${DOOR};`, '  return tenantId;', '}'].join('\n');

  test.each([
    ['E1: a bare decorator on a top-level class', '@leakDec\nclass K {}', ['decorator:@leakDec']],
    ['E1: a decorator on a class member', 'class K { @leakDec m = 1 }', ['decorator:@leakDec']],
    ['E1: a class with no decorator runs nothing', 'class K { x = 1 }', []],
  ] as const)('%s', (_label, line, expected) => {
    expect(scanOutsideBody(`${line}\n\n${PAGE_CALL}`).moduleLoad).toEqual(expected);
  });

  test('E1: a decorator in the body before the door is a violation; one after the door is not', () => {
    const before = `{\n  @leakDec\n  class K {}\n  const x = await ${DOOR};\n}`;
    expect(preDoorViolations(before, before.indexOf(DOOR))).toEqual(['decorator:@leakDec']);
    const after = `{\n  const x = await ${DOOR};\n  @leakDec\n  class K {}\n}`;
    expect(preDoorViolations(after, after.indexOf(DOOR))).toEqual([]);
  });

  test('E2: `/*` inside a string does not hide a call at module level', () => {
    expect(scanOutsideBody(`const s = ['/*', leakHelper('t1'), '*/'];\n\n${PAGE_CALL}`).moduleLoad).toEqual(['leakHelper']);
  });

  test('E2: `/*` inside a string does not hide a call in the body', () => {
    const body = `{\n  const s = ['/*', leakHelper('t1'), '*/'];\n  const x = await ${DOOR};\n}`;
    expect(preDoorViolations(stripComments(body), stripComments(body).indexOf(DOOR))).toEqual(['leakHelper']);
  });

  test('E2: a template literal that spells `*/` and `/*` around a call keeps the call', () => {
    const body = '{\n  const t = `*/ ${leakHelper(\'t1\')} /*`;\n  const x = await ' + DOOR + ';\n}';
    expect(stripComments(body)).toContain("leakHelper('t1')");
  });

  test('E2: a regex literal that spells a comment and JSX text that spells one keep the code after them', () => {
    expect(stripComments("const r = /\\/\\*/; leakHelper('t1');")).toContain("leakHelper('t1')");
    expect(stripComments("const el = <p>/* open</p>;\nconst s = leakHelper('t1');")).toContain("leakHelper('t1')");
  });

  test('E2: real comments (block, JSDoc, trailing) are still removed', () => {
    const body = `{\n  // leakHelper('t1')\n  /** prisma.opportunity.findMany() */\n  const a = 1; // leakHelper('t2')\n  const x = await ${DOOR};\n}`;
    const stripped = stripComments(body);
    expect(stripped).not.toContain('leakHelper');
    expect(stripped).not.toContain('prisma');
    expect(preDoorViolations(stripped, stripped.indexOf(DOOR))).toEqual([]);
  });

  test('E3: a local declaration named like the allowlisted call is a violation', () => {
    const src = `async function getTranslations() { return prisma.opportunity.findMany(); }\n\n${PAGE_CALL}`;
    const { body, door } = scopeOf(src, 'view_proposal');
    expect(preDoorViolations(body, door, allowedFor(src))).toEqual(['getTranslations']);
  });

  test('E3: a body-level shadow of the allowlisted name is a violation even with the import', () => {
    const src = [
      "import { getTranslations } from 'next-intl/server';",
      HEAD,
      '  const getTranslations2 = () => prisma.opportunity.findMany();',
      "  const t = await getTranslations('x');",
      '  const getTranslations = () => 1;',
      `  const { tenantId } = await ${DOOR};`,
      '  return tenantId;',
      '}',
    ].join('\n');
    const { body, door } = scopeOf(src, 'view_proposal');
    expect(preDoorViolations(body, door, allowedFor(src))).toContain('getTranslations');
  });

  test('E3: the page own import of getTranslations stays allowed', () => {
    const src = `import { getTranslations } from 'next-intl/server';\n\n${PAGE_CALL}`;
    const { body, door } = scopeOf(src, 'view_proposal');
    expect(preDoorViolations(body, door, allowedFor(src))).toEqual([]);
  });

  test('E4: an `export default` spelled in a string before the page does not move the scan window', () => {
    const src = `const label = 'export default';\n\n${HEAD}\n  leakHelper('t1');\n  const { tenantId } = await ${DOOR};\n  return tenantId;\n}`;
    const { body, door } = scopeOf(src, 'view_proposal');
    expect(body.startsWith('{\n  leakHelper')).toBe(true);
    expect(preDoorViolations(body, door)).toEqual(['leakHelper']);
  });

  test('E4: a door spelled in a string before the real door does not move the door', () => {
    const src = `${HEAD}\n  const s = "${DOOR}";\n  leakHelper('t1');\n  const { tenantId } = await ${DOOR};\n  return tenantId;\n}`;
    const { body, door } = scopeOf(src, 'view_proposal');
    // The string's own text is also reported (fail-closed: it spells `name(`); the point is
    // that the door found is the real one, after the string and after leakHelper.
    expect(door).toBeGreaterThan(body.indexOf(DOOR));
    expect(preDoorViolations(body, door)).toContain('leakHelper');
  });

  test('E5: a door inside an if block is not a door', () => {
    const src = `${HEAD}\n  if (flag) {\n    await ${DOOR};\n  }\n  return null;\n}`;
    expect(scopeOf(src, 'view_proposal').door).toBe(-1);
  });

  test('E5: a door inside an arrow function is not a door', () => {
    const src = `${HEAD}\n  const f = () => ${DOOR};\n  leakHelper('t1');\n  return null;\n}`;
    expect(scopeOf(src, 'view_proposal').door).toBe(-1);
  });

  test('E3: getTranslations imported from another module (not next-intl/server) is a violation', () => {
    const src = `import { getTranslations } from '@/lib/tenant-data';\n\n${PAGE_CALL}`;
    const { body, door } = scopeOf(src, 'view_proposal');
    expect(preDoorViolations(body, door, allowedFor(src))).toEqual(['getTranslations']);
  });

  test('round-4 attack set: template, JSX expression, `//` in a string and `/*` in a string keep the call visible', () => {
    const cases = [
      "const t = `${leakHelper('t1')}`;",
      "const el = <p>{leakHelper('t1')}</p>;",
      "const u = 'http://x'; leakHelper('t1');",
      'const q = "/*"; leakHelper(\'t1\');',
      "const r = /\\/\\//; leakHelper('t1');",
    ];
    for (const line of cases) {
      const body = `{\n  ${line}\n  const x = await ${DOOR};\n}`;
      const stripped = stripComments(body);
      expect(preDoorViolations(stripped, stripped.indexOf(DOOR)), line).toContain('leakHelper');
    }
  });
});
