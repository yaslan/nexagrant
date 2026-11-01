// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import trMessages from '../messages/tr.json';
import enMessages from '../messages/en.json';

/**
 * FO-39 (TASK-MVC4JEKT5KX5C) — the modules page shows each card in one of the
 * four states `moduleStatus` returns, with that state's own offer:
 *   ACTIVE    → Kapat               AVAILABLE → Aç
 *   LOCKED    → Planı Yükselt only  ORPHANED  → Planı Yükselt + Kapat
 * and reads plans, requirement chain, category counts and pipeline coverage
 * from the catalogue instead of lists of its own.
 */

const toggle = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
vi.mock('@/app/[locale]/(app)/[workspace]/settings/modules/actions', () => ({ toggleModuleState: toggle }));

import { ModulesClient } from '@/app/[locale]/(app)/[workspace]/settings/modules/client';
import type { ModulesPlanView } from '@/app/[locale]/(app)/[workspace]/settings/modules/plan-view';
import { grantsFor } from '@/lib/billing/catalog';
import type { ModuleId } from '@/lib/modules/types';

afterEach(() => {
  cleanup();
  toggle.mockClear();
});

const M = trMessages.settings.modules;
const grant = (planId: string) => (grantsFor(planId)?.moduleIds ?? []) as ModuleId[];

const discover: ModulesPlanView = {
  planId: 'free',
  planName: 'Discover',
  badgeTier: null,
  pilot: null,
  entitledModules: grant('free'),
  activeModules: [],
  switchedOnOutsidePlan: [],
};
const pro: ModulesPlanView = {
  ...discover,
  planId: 'pro',
  planName: 'Pro',
  badgeTier: 'pro',
  entitledModules: grant('pro'),
  activeModules: ['M1', 'M3'],
};
// Was on Ultra with M6 switched on, now on Basic: M6 is left outside the plan.
const downgraded: ModulesPlanView = {
  ...pro,
  planId: 'basic',
  planName: 'Basic',
  badgeTier: 'basic',
  entitledModules: grant('basic'),
  activeModules: ['M3'],
  switchedOnOutsidePlan: ['M6'],
};

function renderModules(plan: ModulesPlanView | null, locale: 'tr' | 'en' = 'tr') {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'tr' ? trMessages : enMessages}>
      <ModulesClient
        plan={plan}
        workspace="default"
        locale={locale}
        englishNames={{ M6: enMessages.modules.evaluator.name, M2: enMessages.modules['concept-note'].name }}
      />
    </NextIntlClientProvider>
  );
}

const card = (id: string) => screen.getByTestId(`module-card-${id}`);
const buttons = (id: string) => within(card(id)).queryAllByRole('button').map((b) => b.textContent);
const links = (id: string) => within(card(id)).queryAllByRole('link').map((a) => a.textContent);

describe('modules page — four card states', () => {
  test('Discover without a subscription: never ORPHANED; LOCKED cards offer only an upgrade', () => {
    renderModules(discover);

    const statuses = screen.getAllByTestId(/^module-card-/).map((c) => c.getAttribute('data-status'));
    expect(statuses).not.toContain('ORPHANED');
    expect(screen.queryByText(M.status.ORPHANED)).toBeNull();

    const locked = screen.getAllByTestId(/^module-card-/).filter((c) => c.getAttribute('data-status') === 'LOCKED');
    expect(locked.length).toBeGreaterThan(0);
    for (const c of locked) {
      expect(within(c).getByText(M.status.LOCKED)).toBeTruthy();
      expect(within(c).queryByRole('button', { name: M.disable })).toBeNull();
      expect(within(c).getByRole('link', { name: M.upgradeCta }).getAttribute('href')).toBe('/tr/default/settings/billing');
    }
  });

  test('Yakında cards: no switch, no upgrade, only the notice and the placeholder page (FO-40)', () => {
    for (const plan of [discover, pro]) {
      renderModules(plan);
      for (const [id, key] of [
        ['M0', 'call-fit'],
        ['M12', 'expert-pool'],
        ['M13', 'budget-wp'],
        ['M14', 'compliance'],
        ['M15', 'post-award'],
        ['M16', 'tr-layer'],
      ] as const) {
        expect(card(id).getAttribute('data-status')).toBe('SOON');
        expect(within(card(id)).getByText(M.statusBadge.soon)).toBeTruthy();
        expect(within(card(id)).getByText(M.status.SOON)).toBeTruthy();
        expect(within(card(id)).getByTestId('module-soon-notice').textContent).toBe(M.soonNotice);
        expect(buttons(id)).toEqual([]);
        expect(links(id)).toEqual([M.soonLink]);
        expect(within(card(id)).getByRole('link').getAttribute('href')).toBe(`/tr/default/modules/${key}`);
      }
      cleanup();
    }
  });

  test('Pro: ACTIVE offers Kapat, AVAILABLE offers Aç', () => {
    renderModules(pro);

    expect(card('M1').getAttribute('data-status')).toBe('ACTIVE');
    expect(within(card('M1')).getByText(M.status.ACTIVE)).toBeTruthy();
    expect(buttons('M1')).toEqual([M.disable]);
    expect(links('M1')).toEqual([]);

    expect(card('M2').getAttribute('data-status')).toBe('AVAILABLE');
    expect(within(card('M2')).getByText(M.status.AVAILABLE)).toBeTruthy();
    expect(buttons('M2')).toEqual([M.enable]);
    expect(links('M2')).toEqual([]);
  });

  test('downgrade: ORPHANED offers both Planı Yükselt and Kapat, and Kapat switches it off', async () => {
    renderModules(downgraded);

    expect(card('M6').getAttribute('data-status')).toBe('ORPHANED');
    expect(within(card('M6')).getByText(M.status.ORPHANED)).toBeTruthy();
    expect(buttons('M6')).toEqual([M.disable]);
    expect(links('M6')).toEqual([M.upgradeCta]);

    // A module never switched on and outside Basic stays LOCKED, without Kapat.
    expect(card('M7').getAttribute('data-status')).toBe('LOCKED');
    expect(buttons('M7')).toEqual([]);

    fireEvent.click(within(card('M6')).getByRole('button', { name: M.disable }));
    await waitFor(() => expect(toggle).toHaveBeenCalledWith('M6', 'OFF'));
    await waitFor(() => expect(card('M6').getAttribute('data-status')).toBe('LOCKED'));
  });

  test('unread plan: no status is claimed and nothing is offered', () => {
    renderModules(null);
    expect(screen.getAllByText(M.status.UNKNOWN)).toHaveLength(screen.getAllByTestId(/^module-card-/).length);
    expect(screen.queryByRole('link', { name: M.upgradeCta })).toBeNull();
    expect(screen.queryByRole('button', { name: M.enable })).toBeNull();
  });
});

describe('modules page — catalogue-driven card details', () => {
  test('plans list includes Discover where the free plan grants the module', () => {
    renderModules(discover);
    const freeModules = grant('free');
    expect(freeModules.length).toBeGreaterThan(0);
    for (const id of freeModules) {
      expect(within(card(id)).getByTestId('module-plans').textContent).toContain('Discover');
    }
    const notFree = (['M6', 'M11'] as ModuleId[]).filter((id) => !freeModules.includes(id));
    for (const id of notFree) {
      expect(within(card(id)).getByTestId('module-plans').textContent).not.toContain('Discover');
    }
  });

  test('M11 shows its full requirement chain in order, ✓ for active and ✕ for missing', () => {
    renderModules(pro);
    const chain = within(card('M11')).getByTestId('requirement-chain');
    expect(chain.textContent).toMatch(/✓M1.*→.*✕M2.*→.*✓M3.*→.*✕M5.*→.*✕M8/);
  });

  test('category cards and pipeline coverage count active modules', () => {
    renderModules(pro);
    expect(screen.getByTestId('category-summary-core').textContent).toContain(M.category.core);
    expect(screen.getByTestId('category-summary-core').textContent).toMatch(/2\s*\/ 8/);
    expect(screen.getByTestId('category-summary-ai').textContent).toMatch(/0\s*\/ 4/);
    expect(screen.getByTestId('pipeline-coverage').textContent).toMatch(/\d\/5 aşama/);
    expect(screen.queryByText(/Kapsam Oranı/)).toBeNull();
  });

  test('Turkish name large with the English name under it; English page shows the English name only', () => {
    renderModules(pro);
    expect(within(card('M6')).getByRole('heading').textContent).toBe(trMessages.modules.evaluator.name);
    expect(within(card('M6')).getByText(enMessages.modules.evaluator.name)).toBeTruthy();
    cleanup();

    renderModules(pro, 'en');
    expect(within(card('M2')).getByRole('heading').textContent).toBe('Concept Note Builder');
    expect(within(card('M2')).getAllByText('Concept Note Builder')).toHaveLength(1);
  });

  test('category tabs filter by the manifest category', () => {
    renderModules(pro);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${M.category.ai}`) }));
    expect(screen.getAllByTestId(/^module-card-/).map((c) => c.dataset.testid)).toEqual([
      'module-card-M6',
      'module-card-M8',
      'module-card-M14',
      'module-card-M17',
    ]);
  });
});
