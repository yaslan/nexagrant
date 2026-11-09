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
import { ModuleProvider, type ModulePreviewStatus } from '@/lib/modules/hooks';
import { getAllManifests } from '@/lib/modules/registry';
import type { ModuleId } from '@/lib/modules/types';
import { OpportunityDetailClient } from '@/app/[locale]/(app)/[workspace]/pipeline/[id]/client';

afterEach(cleanup);

function shell(
  active: ModuleId[],
  node: React.ReactNode,
  locale: 'tr' | 'en' = 'tr',
  nav: { previewStatus?: Partial<Record<ModuleId, ModulePreviewStatus>>; upgradeModules?: ModuleId[] } = {},
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'tr' ? trMessages : enMessages} timeZone="Europe/Istanbul">
      <ModuleProvider activeModules={active} {...nav}>{node}</ModuleProvider>
    </NextIntlClientProvider>,
  );
}

// Entries a user can follow; a locked feature entry is a disabled link and is asserted separately.
const sidebarLabels = () =>
  screen
    .getAllByRole('link')
    .filter((a) => a.getAttribute('aria-disabled') !== 'true')
    .map((a) => a.textContent?.trim());

describe('SidebarNav — module entries from manifest nav[]', () => {
  it('shows M2 Konsept Notlar and hides a closed M7, keeping core items in place', () => {
    shell(['M1', 'M2', 'M3', 'M4', 'M5', 'M8'], <SidebarNav locale="tr" canManageUsers />);

    expect(sidebarLabels()).toEqual([
      'Panel',
      'Çağrılar',
      'Fırsatlar',
      'Ortaklar',
      'Ortak Arama Kaynakları',
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
    // M1 is off, so Partner REST API (an M1 feature) is locked rather than linked.
    expect(sidebarLabels()).toEqual(['Dashboard', 'Calls', 'Pipeline', expect.stringContaining('TTO'), 'Approvals (4-Eyes)', 'Settings']);
    expect(screen.getByTestId('sidebar-nav-apiKeys').getAttribute('data-locked')).toBe('true');
  });

  // FO-176: a top-level entry right after Partners (not a sub-entry); its path sits
  // under /partners, yet only it is highlighted while it is open.
  it('lists Partner Search Resources as a top-level entry and highlights it alone', () => {
    nav.pathname = '/en/main/partners/resources';
    try {
      shell(['M1'], <SidebarNav locale="en" />, 'en');
      const labels = sidebarLabels();
      expect(labels[labels.indexOf('Partners') + 1]).toBe('Partner Search Resources');
      const entry = screen.getByTestId('sidebar-nav-partnerResources');
      const partners = screen.getByTestId('sidebar-nav-partners');
      expect(entry.getAttribute('href')).toBe('/en/main/partners/resources');
      expect(entry.parentElement).toBe(partners.parentElement);
      expect(entry.className).not.toMatch(/\bml-|\btext-xs\b/);
      expect(entry.className).toContain('bg-accent/10');
      expect(partners.className).not.toContain('bg-accent/10');
    } finally {
      nav.pathname = '/tr/main/panel';
    }
  });

  // FO-176: in Turkish the entry links the Turkish slug and is still the only one lit.
  it('links the Turkish slug for Partner Search Resources and highlights it alone', () => {
    nav.pathname = '/tr/main/ortaklar/kaynaklar';
    try {
      shell(['M1'], <SidebarNav locale="tr" />);
      const entry = screen.getByTestId('sidebar-nav-partnerResources');
      const partners = screen.getByTestId('sidebar-nav-partners');
      expect(entry.getAttribute('href')).toBe('/tr/main/ortaklar/kaynaklar');
      expect(entry.className).toContain('bg-accent/10');
      expect(partners.className).not.toContain('bg-accent/10');
    } finally {
      nav.pathname = '/tr/main/panel';
    }
  });

  it('shows only the core items when no module is open', () => {
    shell([], <SidebarNav locale="tr" />);
    expect(sidebarLabels()).toEqual(['Panel', 'Çağrılar', 'Ayarlar']);
  });
});

/**
 * FO-164 (Y-1) — a preview module is badged, a module only the plan keeps closed is
 * listed locked and leads to its page, whose gate names the plans that include it.
 */
describe('SidebarNav — preview badge and plan lock', () => {
  it('badges a PILOT module and leaves an ON one unbadged', () => {
    shell(['M2', 'M5'], <SidebarNav locale="tr" />, 'tr', { previewStatus: { M2: 'PILOT' } });
    expect(screen.getByTestId('sidebar-nav-conceptNotes-preview').textContent).toBe('Pilot');
    expect(screen.queryByTestId('sidebar-nav-pipeline-preview')).toBeNull();
  });

  it('labels a DEV preview in English', () => {
    shell(['M7'], <SidebarNav locale="en" />, 'en', { previewStatus: { M7: 'DEV' } });
    expect(screen.getByTestId('sidebar-nav-tto-preview').textContent).toBe('Dev');
  });

  it('lists a plan-locked module as a locked link to its own page, reason as description', () => {
    shell(['M1', 'M5'], <SidebarNav locale="tr" />, 'tr', { upgradeModules: ['M7', 'M9'] });
    const reason = trMessages.Navigation.planLocked.replace('{module}', `M7 ${trMessages.modules.tto.name}`);
    const tto = screen.getByRole('link', { name: /TTO/, description: reason });
    expect(tto.getAttribute('href')).toBe('/tr/main/tto-hizlandirici');
    expect(tto.getAttribute('data-locked')).toBe('upgrade');
    expect(tto.getAttribute('aria-disabled')).toBeNull();
    // M9 has no sidebar entry of its own; nothing is invented for it.
    expect(sidebarLabels()).toEqual([
      'Panel',
      'Çağrılar',
      'Fırsatlar',
      'Ortaklar',
      'Ortak Arama Kaynakları',
      expect.stringContaining('TTO'),
      'Onay Merkezi (4-Eyes)',
      'Partner REST API',
      'Ayarlar',
    ]);
  });
});

/**
 * FO-39 (TASK-MVC4JEKT5KX5C) — Onay Merkezi is an M5 feature and Partner REST API
 * an M1 one (`navFeatureModule`): with the module off the entry stays in the menu,
 * locked, with a tooltip naming the module, and is no link.
 */
describe('SidebarNav — feature entries locked while their module is off', () => {
  it('locks Onay Merkezi without M5 and Partner REST API without M1', () => {
    shell([], <SidebarNav locale="tr" />);

    const locked = (module: string) => trMessages.Navigation.featureLocked.replace('{module}', module);
    // Name is the label, the lock reason is the description: what a screen reader announces.
    const approvals = screen.getByRole('link', {
      name: 'Onay Merkezi (4-Eyes)',
      description: locked(`M5 ${trMessages.modules.workflows.name}`),
    });
    const apiKeys = screen.getByRole('link', {
      name: 'Partner REST API',
      description: locked(`M1 ${trMessages.modules['partner-intel'].name}`),
    });
    for (const entry of [approvals, apiKeys]) {
      expect(entry.tagName).toBe('SPAN');
      expect(entry.hasAttribute('href')).toBe(false);
      expect(entry.getAttribute('aria-disabled')).toBe('true');
      expect(entry.getAttribute('data-locked')).toBe('true');
      expect(entry.tabIndex).toBe(0);
    }
    expect(approvals.getAttribute('title')).toBe(locked(`M5 ${trMessages.modules.workflows.name}`));
    // The reason is only reachable as a description; browse mode does not read it again.
    const reason = document.getElementById(approvals.getAttribute('aria-describedby') ?? '');
    expect(reason?.hidden).toBe(true);
    expect(approvals.contains(reason)).toBe(false);
  });

  it('keeps reason ids unique when the desktop aside and mobile drawer both render', () => {
    shell([], <><SidebarNav locale="tr" /><SidebarNav locale="tr" /></>);
    const ids = screen.getAllByRole('link', { name: /Onay Merkezi|Partner REST API/ }).map((a) => a.getAttribute('aria-describedby'));
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    for (const id of ids) expect(document.getElementById(id ?? '')).not.toBeNull();
  });

  it('links both once M5 and M1 are on', () => {
    shell(['M1', 'M5'], <SidebarNav locale="tr" />);
    expect(screen.getByRole('link', { name: 'Onay Merkezi (4-Eyes)' }).getAttribute('href')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Partner REST API' })).toBeTruthy();
    expect(screen.queryByTitle(/modülü kapalı/)).toBeNull();
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
const G0 = {
  score: null,
  decision: null,
  measuredSources: 0,
  totalSources: 0,
  reasons: [],
  minScore: 70,
  scoringBasis: 'standard' as const,
  denominator: null,
};

function detail(active: ModuleId[], locale: 'tr' | 'en' = 'tr') {
  return shell(
    active,
    <OpportunityDetailClient
      opportunity={OPPORTUNITY}
      g0={G0}
      savedG0={null}
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

  it('takes its tabs from the manifests: every opportunityTabs[] entry, nothing else', () => {
    const all = getAllManifests();
    detail(all.map((m) => m.id));
    const shown = within(screen.getByTestId('opportunity-module-tabs'))
      .getAllByRole('link')
      .map((a) => a.getAttribute('data-testid'));
    const declared = all
      .flatMap((m) => m.opportunityTabs ?? [])
      .sort((a, b) => a.order - b.order)
      .map((tab) => `opportunity-module-tab-${tab.labelKey}`);
    expect(shown).toEqual(declared);
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
