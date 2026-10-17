// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import trMessages from '../messages/tr.json';
import enMessages from '../messages/en.json';

/**
 * TASK-MVBCE3QTT3X67 (FO-6) — the ways into a module, rendered from the module
 * decision the server hands the app shell (`ModuleProvider`), not from a fixed list.
 *
 * The catalogues are the real ones, so a renamed key fails here instead of shipping
 * a raw `detail.modules.x` label.
 */

const nav = vi.hoisted(() => ({ pathname: '/tr/main/panel' }));
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
// The detail client's server actions pull in NextAuth and Prisma; only the names matter here.
vi.mock('@/app/[locale]/(app)/[workspace]/pipeline/actions', () => ({
  archiveOpportunity: vi.fn(),
  declareApplication: vi.fn(),
  evaluateOpportunityGate: vi.fn(),
  logEffort: vi.fn(),
}));

import SidebarNav from '@/components/SidebarNav';
import { ModuleLink } from '@/components/ModuleLink';
import { ModuleProvider } from '@/lib/modules/hooks';
import type { ModuleId } from '@/lib/modules/types';
import { OpportunityDetailClient } from '@/app/[locale]/(app)/[workspace]/pipeline/[id]/client';

afterEach(cleanup);

function shell(active: ModuleId[], node: React.ReactNode, locale: 'tr' | 'en' = 'tr') {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'tr' ? trMessages : enMessages} timeZone="Europe/Istanbul">
      <ModuleProvider activeModules={active}>{node}</ModuleProvider>
    </NextIntlClientProvider>,
  );
}

const sidebarLabels = () => screen.getAllByRole('link').map((a) => a.textContent?.trim());

describe('SidebarNav — module entries from manifest nav[]', () => {
  it('shows M2 Konsept Notlar and hides a closed M7, keeping core items in place', () => {
    shell(['M1', 'M2', 'M3', 'M4', 'M5', 'M8'], <SidebarNav locale="tr" canManageUsers />);

    expect(sidebarLabels()).toEqual([
      'Panel',
      'Çağrılar',
      'Fırsatlar',
      'Ortaklar',
      'Konsept Notlar',
      'Kanıtlar',
      'İlişkiler',
      'Onay Merkezi (4-Eyes)',
      'Partner REST API',
      'Üyeler',
      'Ayarlar',
    ]);
    expect(screen.queryByText(/TTO/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Konsept Notlar' }).getAttribute('href')).toBe('/tr/main/konsept-notlar');
  });

  it('adds TTO once M7 is open, at its manifest position', () => {
    shell(['M5', 'M7'], <SidebarNav locale="en" />, 'en');
    expect(sidebarLabels()).toEqual(['Dashboard', 'Calls', 'Pipeline', expect.stringContaining('TTO'), 'Approvals (4-Eyes)', 'Partner REST API', 'Settings']);
  });

  it('shows only the core items when no module is open', () => {
    shell([], <SidebarNav locale="tr" />);
    expect(sidebarLabels()).toEqual(['Panel', 'Çağrılar', 'Onay Merkezi (4-Eyes)', 'Partner REST API', 'Ayarlar']);
  });
});

const OPPORTUNITY = {
  id: 'opp-1',
  title: 'Test opportunity',
  topicId: null,
  stage: 'G0' as const,
  status: 'ACTIVE',
  intendedRole: null,
};
const G0 = { score: null, decision: null, measuredSources: 0, totalSources: 0, reasons: [], minScore: 70 };

function detail(active: ModuleId[], locale: 'tr' | 'en' = 'tr') {
  return shell(
    active,
    <OpportunityDetailClient
      opportunity={OPPORTUNITY}
      g0={G0}
      efforts={[]}
      canArchive={false}
      backHref={`/${locale}/main/pipeline`}
      locale={locale}
      workspace="main"
    />,
    locale,
  );
}

describe('opportunity detail — module tabs', () => {
  it('ultra with every module open: all seven per-opportunity pages, in order, with real hrefs', () => {
    detail(['M2', 'M5', 'M6', 'M8', 'M9', 'M10', 'M11']);
    const tabs = within(screen.getByTestId('opportunity-module-tabs')).getAllByRole('link');
    expect(tabs.map((a) => a.getAttribute('href'))).toEqual([
      '/tr/main/opportunities/opp-1/m2',
      '/tr/main/opportunities/opp-1/evaluations',
      '/tr/main/opportunities/opp-1/matching',
      '/tr/main/pipeline/opp-1/consortium',
      '/tr/main/opportunities/opp-1/briefs',
      '/tr/main/opportunities/opp-1/documents',
      '/tr/main/opportunities/opp-1/application',
    ]);
    expect(tabs[0]?.textContent).toContain('Konsept Notu');
  });

  it('pro: M9, M10 and M11 are not offered', () => {
    detail(['M1', 'M2', 'M5', 'M6', 'M8'], 'en');
    const tabs = within(screen.getByTestId('opportunity-module-tabs')).getAllByRole('link');
    expect(tabs.map((a) => a.getAttribute('data-testid'))).toEqual([
      'opportunity-module-tab-conceptNote',
      'opportunity-module-tab-evaluations',
      'opportunity-module-tab-matching',
      'opportunity-module-tab-consortium',
    ]);
    expect(screen.queryByTestId('opportunity-module-tab-briefs')).toBeNull();
  });

  it('renders no module row at all when none of them is open', () => {
    detail(['M5']);
    expect(screen.queryByTestId('opportunity-module-tabs')).toBeNull();
  });
});

describe('ModuleLink', () => {
  it('renders only for an open module', () => {
    shell(['M1'], <ModuleLink module="M5" href="/x">person-days</ModuleLink>);
    expect(screen.queryByText('person-days')).toBeNull();
    cleanup();
    shell(['M5'], <ModuleLink module="M5" href="/x">person-days</ModuleLink>);
    expect(screen.getByRole('link', { name: 'person-days' }).getAttribute('href')).toBe('/x');
  });
});
