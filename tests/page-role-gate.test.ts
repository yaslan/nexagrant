import { readFileSync } from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Role } from '@prisma/client';

import { can, type Action } from '@/lib/rbac';

/**
 * NG-64 — a tenant page the menu hides for a role is also closed to that role on
 * the server. Three parts:
 *   1. `requireTenantPageRole` lets through exactly the roles `can()` lets
 *      through (the answer is read from rbac.ts, never restated here) and
 *      refuses an unknown or missing role;
 *   2. the two downloads behind those pages refuse a role without
 *      `view_proposal` before any tenant read;
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

const ROLES: Role[] = ['TENANT_OWNER', 'TENANT_ADMIN', 'PIPELINE_MANAGER', 'WRITER', 'MEMBER', 'GUEST_PARTNER'];
const ACTIONS: Action[] = ['view_proposal', 'view_partner_search', 'request_dual_approval', 'manage_users'];

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
  'settings/api-keys/page.tsx': 'view_partner_search',
  'approvals/page.tsx': 'request_dual_approval',
  'settings/members/page.tsx': 'manage_users',
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
