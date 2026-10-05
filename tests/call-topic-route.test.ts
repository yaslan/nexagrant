import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * TASK-MUO12A7NHANOT (İNCELEME-76 Y-1) — /[locale]/calls/topic/[id], the
 * workspace-free target of the public /calls cards, and the call detail page
 * that no longer trusts its `[workspace]` segment.
 */

const state = vi.hoisted(() => ({
  session: null as Record<string, unknown> | null,
  workspace: null as { id: string; slug: string } | null,
  lookups: [] as Array<{ tenantId: string; workspaceIds: string[]; slug: string | null }>,
}));

vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => state.session) }));
vi.mock('@/lib/workspaces', () => ({
  resolveScopedWorkspace: vi.fn(async (scope: { tenantId: string; workspaceIds: string[] }, slug: string | null) => {
    state.lookups.push({ tenantId: scope.tenantId, workspaceIds: scope.workspaceIds, slug });
    return state.workspace;
  }),
}));

import { GET } from '@/app/[locale]/calls/topic/[id]/route';
import { callTopicTarget } from '@/app/[locale]/calls/topic/[id]/target';

const call = async (locale: string, id: string) => {
  const res = await GET(new NextRequest(`http://localhost:3000/${locale}/calls/topic/${encodeURIComponent(id)}`), {
    params: Promise.resolve({ locale, id }),
  });
  const location = res.headers.get('location');
  return { status: res.status, location: location ? new URL(location) : null, cache: res.headers.get('cache-control') };
};

beforeEach(() => {
  state.session = null;
  state.workspace = null;
  state.lookups.length = 0;
});

describe('callTopicTarget', () => {
  it('signed out → sign-in, coming back to the workspace-free route', () => {
    expect(callTopicTarget('tr', 'H-1', { kind: 'signed-out' })).toBe('/tr/giris?callbackUrl=%2Ftr%2Fcalls%2Ftopic%2FH-1');
    expect(callTopicTarget('en', 'H-1', { kind: 'signed-out' })).toBe('/en/login?callbackUrl=%2Fen%2Fcalls%2Ftopic%2FH-1');
  });

  it('no live workspace → /no-workspace', () => {
    expect(callTopicTarget('tr', 'H-1', { kind: 'no-workspace' })).toBe('/tr/no-workspace');
  });

  it('member → the detail in the workspace the server picked', () => {
    expect(callTopicTarget('tr', 'H-1', { kind: 'member', workspaceSlug: 'ws-b' })).toBe('/tr/ws-b/cagrilar/H-1');
    expect(callTopicTarget('en', 'A/B?c', { kind: 'member', workspaceSlug: 'ws-b' })).toBe('/en/ws-b/calls/A%2FB%3Fc');
  });
});

describe('GET /[locale]/calls/topic/[id]', () => {
  it('signed out: 307 to sign-in with this route as callbackUrl, no workspace lookup', async () => {
    const r = await call('tr', 'HORIZON-1');
    expect(r.status).toBe(307);
    expect(r.location?.pathname).toBe('/tr/giris');
    expect(r.location?.searchParams.get('callbackUrl')).toBe('/tr/calls/topic/HORIZON-1');
    expect(state.lookups).toEqual([]);
    expect(r.cache).toBe('private, no-store');
  });

  it('restricted member: asks for a workspace inside the membership, redirects there', async () => {
    state.session = { user: { id: 'u' }, tenantId: 't2', role: 'PIPELINE_MANAGER', workspaceIds: ['ws-b'] };
    state.workspace = { id: 'ws-b', slug: 'ws-b' };
    const r = await call('en', 'HORIZON-1');
    expect(state.lookups).toEqual([{ tenantId: 't2', workspaceIds: ['ws-b'], slug: null }]);
    expect(r.status).toBe(307);
    expect(r.location?.pathname).toBe('/en/ws-b/calls/HORIZON-1');
  });

  it('signed in with no live workspace → /no-workspace', async () => {
    state.session = { user: { id: 'u' }, tenantId: 't3', role: 'TENANT_OWNER' };
    state.workspace = null;
    expect((await call('tr', 'HORIZON-1')).location?.pathname).toBe('/tr/no-workspace');
  });

  it('signed in without a tenant → /no-workspace, no lookup', async () => {
    state.session = { user: { id: 'u' } };
    expect((await call('tr', 'HORIZON-1')).location?.pathname).toBe('/tr/no-workspace');
    expect(state.lookups).toEqual([]);
  });

  it.each([
    ['de', 'HORIZON-1'],
    ['tr', 'x'.repeat(201)],
  ])('404s for locale %s / an oversized id', async (locale, id) => {
    const r = await call(locale, id);
    expect(r.status).toBe(404);
    expect(r.location).toBeNull();
  });
});

describe('the call detail page checks its [workspace] segment (Y-1)', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '..', 'src/app/[locale]/(app)/[workspace]/calls/[id]/page.tsx'),
    'utf8'
  );

  it('resolves the segment against the membership before anything renders', () => {
    const check = src.indexOf('resolveScopedWorkspace(scope, requested)');
    expect(check).toBeGreaterThan(-1);
    // O-1 (TASK-MUO64UQJUWEBI): the segment is normalised first, and one that is not a slug is a 404
    const normalised = src.indexOf('const requested = normalizeWorkspaceSlug(workspace);');
    expect(normalised).toBeGreaterThan(-1);
    expect(normalised).toBeLessThan(check);
    expect(src).toMatch(/if \(!requested\) notFound\(\);/);
    expect(src.indexOf('requireTenantPage(locale)')).toBeGreaterThan(-1);
    expect(check).toBeLessThan(src.indexOf('prisma.topic.findFirst'));
    expect(src).toMatch(/if \(!scoped\) redirect\(publicCallDetailHref\(locale, id\)\)/);
    expect(src).toMatch(/if \(scoped\.slug !== workspace\) \{\s*redirect\(getWorkspaceRoute\('callDetail', locale, scoped\.slug/);
  });

  it('the add button stops on a refused write instead of opening the board', () => {
    const button = fs.readFileSync(
      path.resolve(__dirname, '..', 'src/app/[locale]/(app)/[workspace]/calls/[id]/add-button.tsx'),
      'utf8'
    );
    expect(button).toMatch(/if \(!res\.success\) \{[\s\S]*?return;\s*\}\s*router\.push/);
  });

  it('the pipeline board tells the user when a create was refused', () => {
    const board = fs.readFileSync(
      path.resolve(__dirname, '..', 'src/app/[locale]/(app)/[workspace]/pipeline/board.tsx'),
      'utf8'
    );
    expect(board).toMatch(/\} else if \(!res\.success\) \{[\s\S]*?showToast\(t\('createRefused'\), 'error'\)/);
  });
});
