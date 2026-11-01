import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

/**
 * TASK-MVCH26OXNVLKR (FO-59, review B2) — the internal-plan badge query is the
 * badge's alone. When it fails, the tenant list still renders (without
 * badges); only a failed tenant query shows the load error.
 */

const { withSystemScope, listInternalPlans } = vi.hoisted(() => ({
  withSystemScope: vi.fn(),
  listInternalPlans: vi.fn(),
}));

vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: unknown }) => <a href={href}>{children as never}</a>,
}));
vi.mock('@/lib/system-scope', () => ({ withSystemScope }));
vi.mock('@/lib/billing/internal-plan', () => ({ listInternalPlans }));

const TENANTS = [
  { id: 't-1', name: 'Alpha Org', slug: 'alpha', country: 'TR', orgType: 'SME', pic: null, _count: { users: 2, workspaces: 1 } },
  { id: 't-2', name: 'Beta Org', slug: 'beta', country: 'DE', orgType: 'SME', pic: null, _count: { users: 1, workspaces: 1 } },
];

async function render(): Promise<string> {
  const { default: AdminTenantsPage } = await import('./page');
  const el = await AdminTenantsPage({ params: Promise.resolve({ locale: 'tr' }) });
  return renderToStaticMarkup(el as ReactElement);
}

beforeEach(() => {
  withSystemScope.mockReset();
  listInternalPlans.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('/admin/tenants', () => {
  it('a failed badge query leaves the tenant list filled, without badges or the load error', async () => {
    withSystemScope.mockResolvedValue(TENANTS);
    listInternalPlans.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:5432'));
    const html = await render();
    expect(html).toContain('Alpha Org');
    expect(html).toContain('Beta Org');
    expect(html).not.toContain('tenant-internal-');
    expect(html).not.toContain('loadError');
    expect(html).not.toContain('ECONNREFUSED');
  });

  it('a working badge query marks the tenant on an internal plan', async () => {
    withSystemScope.mockResolvedValue(TENANTS);
    listInternalPlans.mockResolvedValue(new Map([['t-2', 'pro']]));
    const html = await render();
    expect(html).toContain('data-testid="tenant-internal-beta"');
    expect(html).not.toContain('data-testid="tenant-internal-alpha"');
  });

  it('a failed tenant query still shows the load error', async () => {
    withSystemScope.mockRejectedValue(new Error('boom'));
    listInternalPlans.mockResolvedValue(new Map());
    const html = await render();
    expect(html).toContain('loadError');
  });
});
