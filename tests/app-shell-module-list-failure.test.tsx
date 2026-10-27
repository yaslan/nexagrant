import { describe, it, expect, vi, beforeEach } from 'vitest';
import type React from 'react';

/**
 * TASK-MVBEM10PJYU0E (FO-12, Ö-1) — the app shell survives a failed module read.
 *
 * `listModuleNav` feeds the sidebar. When its read failed the whole
 * `(app)` layout threw, so the pages that belong to no module — the dashboard,
 * Settings → Modules, Members — went down with it, and an admin could not reach
 * the screen that fixes the cause. The shell now renders with an empty menu and
 * logs the error; module pages keep their own `moduleGate`.
 *
 * The layout is called as the async server component it is and the returned tree
 * is inspected; nothing below the shell is rendered.
 */

const h = vi.hoisted(() => ({
  listModuleNav: vi.fn(),
  requestSession: vi.fn(),
  loggerError: vi.fn(),
  redirect: vi.fn(),
  stub: (name: string) => ({ default: Object.assign(() => null, { displayName: name }) }),
}));

vi.mock('@/lib/modules/access', () => ({
  listModuleNav: h.listModuleNav,
  requestSession: h.requestSession,
}));
vi.mock('@/lib/logger', () => ({ logger: { error: h.loggerError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('next/navigation', () => ({ redirect: h.redirect }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('@/lib/workspaces', () => ({ listSessionWorkspaces: async () => [] }));
vi.mock('@/lib/agency/cobrand-store', () => ({
  getLinkedAgencyCoBrand: async () => null,
  toShellCoBrand: () => null,
}));
vi.mock('@/lib/tenant', () => ({
  tenantScopeOf: (s: { tenantId?: string } | null) => (s?.tenantId ? { tenantId: s.tenantId } : null),
}));

// Shell chrome: element types only, never rendered here.
vi.mock('@/components/SidebarNav', () => h.stub('SidebarNav'));
vi.mock('@/components/UserMenu', () => h.stub('UserMenu'));
vi.mock('@/components/ThemeToggle', () => h.stub('ThemeToggle'));
vi.mock('@/components/CoBrandBadge', () => h.stub('CoBrandBadge'));
vi.mock('@/components/PilotBanner', () => h.stub('PilotBanner'));
vi.mock('@/components/MobileAppHeader', () => h.stub('MobileAppHeader'));
vi.mock('@/components/FeedbackWidget', () => h.stub('FeedbackWidget'));
vi.mock('@/components/LocaleUpdater', () => ({ LocaleUpdater: () => null }));

import AppLayout from '@/app/[locale]/(app)/layout';
import { ModuleProvider } from '@/lib/modules/hooks';

const SESSION = {
  user: { id: 'user-1', name: 'Ayşe', email: 'ayse@example.test' },
  tenantId: 'tenant-1',
  role: 'TENANT_OWNER',
  workspaceIds: [],
  isPlatformAdmin: false,
};

type El = React.ReactElement<{
  activeModules?: string[];
  previewStatus?: Record<string, string>;
  upgradeModules?: string[];
  children?: React.ReactNode;
}>;

async function renderShell(): Promise<El> {
  return (await AppLayout({
    children: <p data-testid="page">page</p>,
    params: Promise.resolve({ locale: 'tr', workspace: 'main' }),
  })) as El;
}

/** The page passed in, found somewhere inside the shell tree. */
function containsPage(node: React.ReactNode): boolean {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some(containsPage);
  const el = node as El & { props: { 'data-testid'?: string } };
  if (el.props?.['data-testid'] === 'page') return true;
  return containsPage(el.props?.children);
}

describe('app shell — module list read failure (Ö-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.requestSession.mockResolvedValue(SESSION);
  });

  it('renders the page with an empty module menu when the read throws', async () => {
    const dbError = new Error('permission denied for table ModuleState');
    h.listModuleNav.mockRejectedValue(dbError);

    const shell = await renderShell();

    expect(shell.type).toBe(ModuleProvider);
    expect(shell.props.activeModules).toEqual([]);
    expect(shell.props.upgradeModules).toEqual([]);
    expect(containsPage(shell)).toBe(true);
    expect(h.loggerError).toHaveBeenCalledTimes(1);
    expect(h.loggerError).toHaveBeenCalledWith(expect.any(String), dbError, { tenantId: 'tenant-1' });
  });

  it('the raw error text reaches the log only, not the rendered tree', async () => {
    h.listModuleNav.mockRejectedValue(new Error('relation "ModuleState" does not exist'));

    const shell = await renderShell();

    const seen = new WeakSet<object>();
    const json = JSON.stringify(shell, (_k, v: unknown) => {
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v)) return undefined;
        seen.add(v);
      }
      return typeof v === 'function' ? undefined : v;
    });
    expect(json).not.toContain('ModuleState');
    expect(json).not.toContain('does not exist');
  });

  it('a healthy read still feeds the menu, and nothing is logged', async () => {
    h.listModuleNav.mockResolvedValue({ activeModules: ['M1', 'M5'], previewStatus: { M5: 'PILOT' }, upgradeModules: ['M7'] });

    const shell = await renderShell();

    expect(shell.props.activeModules).toEqual(['M1', 'M5']);
    expect(shell.props.previewStatus).toEqual({ M5: 'PILOT' });
    expect(shell.props.upgradeModules).toEqual(['M7']);
    expect(h.loggerError).not.toHaveBeenCalled();
  });
});
