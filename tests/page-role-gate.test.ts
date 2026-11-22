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

/** Comments stripped the same way the evaluation-panel check does (block + full-line). */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
