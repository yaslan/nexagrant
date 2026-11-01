import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TASK-MUNWZA26VGK0B (İNCELEME-68 Y-1) — a session without a tenant has no
 * role either, so the dashboard's role check told someone removed from their
 * tenant "Erişim Reddedildi — Pipeline Yöneticisi gerekli". The page now sends
 * a tenantless session to /no-workspace, like requireTenantPage does, and keeps
 * the role refusal for a member whose role is really too low.
 */

const { session, redirect } = vi.hoisted(() => ({
  session: { value: null as unknown },
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('next/navigation', () => ({ redirect }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('@/lib/auth', () => ({ auth: async () => session.value }));
vi.mock('@/modules/m5/ui/Dashboard', () => ({ Dashboard: () => null }));
vi.mock('@/modules/m5/server/queries', () => ({
  getKpiMetrics: vi.fn(async () => ({})),
  getKpiTrend: vi.fn(async () => []),
}));
vi.mock('@/app/[locale]/(app)/[workspace]/dashboard/readiness-card', () => ({ ReadinessCard: () => null }));

async function render(s: unknown) {
  session.value = s;
  const { default: DashboardPage } = await import('@/app/[locale]/(app)/[workspace]/dashboard/page');
  return DashboardPage({
    params: Promise.resolve({ locale: 'tr', workspace: 'default' }),
    searchParams: Promise.resolve({}),
  });
}

/** The Notice's title prop, if the page returned one. */
function noticeTitle(el: unknown): string | undefined {
  return (el as { props?: { title?: string } } | null)?.props?.title;
}

beforeEach(() => {
  redirect.mockClear();
});

describe('dashboard without a tenant', () => {
  it('a signed-in user with no tenant goes to /no-workspace, not to "access denied"', async () => {
    await expect(render({ user: { id: 'u1' }, tenantId: null, role: null })).rejects.toThrow('NEXT_REDIRECT:/tr/no-workspace');
    expect(redirect).toHaveBeenCalledWith('/tr/no-workspace');
  });

  it('a member whose role is too low is sent to the screen their role can open, not refused (QA Y-1)', async () => {
    await expect(render({ user: { id: 'u1' }, tenantId: 't1', role: 'MEMBER' })).rejects.toThrow(
      'NEXT_REDIRECT:/tr/default/firsatlar'
    );
    await expect(render({ user: { id: 'u1' }, tenantId: 't1', role: 'WRITER' })).rejects.toThrow(
      'NEXT_REDIRECT:/tr/default/firsatlar'
    );
    await expect(render({ user: { id: 'u1' }, tenantId: 't1', role: 'GUEST_PARTNER' })).rejects.toThrow(
      'NEXT_REDIRECT:/tr/default/bildirimler'
    );
  });

  it('a role the table does not know still gets the role refusal', async () => {
    const el = await render({ user: { id: 'u1' }, tenantId: 't1', role: 'LEGACY_ROLE' });
    expect(redirect).not.toHaveBeenCalled();
    expect(noticeTitle(el)).toBe('accessDeniedTitle');
  });

  it('a pipeline manager sees the dashboard', async () => {
    const el = await render({ user: { id: 'u1' }, tenantId: 't1', role: 'PIPELINE_MANAGER' });
    expect(redirect).not.toHaveBeenCalled();
    expect(noticeTitle(el)).toBeUndefined();
  });
});
