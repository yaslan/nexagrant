// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import trMessages from '../messages/tr.json';
import enMessages from '../messages/en.json';

/**
 * İNCELEME-18 K-4b (TASK-MUMJ9M19CZY56) — a pilot tenant cannot change plan
 * (billing says "pilot süresince yükseltme kapalı"), yet the M7/M9/M10/M11
 * cards offered an amber "Planı Yükselt" link. A pilot now sees a plain
 * "Pilotta kapalı · kurum paketinde açılır" instead; a non-pilot tenant keeps
 * the link. The header's "Planı Değiştir" stays for both (patron, 29.09).
 */

vi.mock('@/app/[locale]/(app)/[workspace]/settings/modules/actions', () => ({ toggleModuleState: vi.fn() }));

import { ModulesClient } from '@/app/[locale]/(app)/[workspace]/settings/modules/client';
import type { ModulesPlanView } from '@/app/[locale]/(app)/[workspace]/settings/modules/plan-view';

afterEach(cleanup);

// The pilot's Pro grant: M7, M9, M10 and M11 sit outside it (ultra only).
const PRO_GRANT = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M8', 'M17'] as ModulesPlanView['entitledModules'];
const LOCKED = ['M7', 'M9', 'M10', 'M11'];

const pilotPlan: ModulesPlanView = {
  planId: 'kamu-ekip',
  planName: 'Belediye Ekip',
  badgeTier: 'pro',
  pilot: { lastDay: '28.12.2026', expired: false },
  entitledModules: PRO_GRANT,
  activeModules: [],
  switchedOnOutsidePlan: [],
  previewOpen: [],
};
const proPlan: ModulesPlanView = { ...pilotPlan, planId: 'pro', planName: 'Pro', pilot: null };

function renderModules(plan: ModulesPlanView, locale: 'tr' | 'en' = 'tr') {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'tr' ? trMessages : enMessages}>
      <ModulesClient plan={plan} workspace="default" locale={locale} />
    </NextIntlClientProvider>
  );
}

/** The card is the nearest ancestor holding both the id badge and the footer. */
function card(id: string): HTMLElement {
  const [badge] = screen.getAllByText(id, { selector: 'span.font-mono' });
  return badge!.closest('div.rounded-2xl') as HTMLElement;
}

describe('modules page — upgrade offer on locked cards', () => {
  test('pilot: no "Planı Yükselt" anywhere, locked cards say "Pilotta kapalı", header link stays', () => {
    renderModules(pilotPlan);

    expect(screen.queryAllByRole('link', { name: trMessages.settings.modules.upgradeCta })).toHaveLength(0);
    for (const id of LOCKED) {
      const c = within(card(id));
      expect(c.getByText(trMessages.settings.modules.pilotLocked)).toBeTruthy();
      expect(c.queryByRole('link')).toBeNull();
    }
    expect(screen.getAllByText(trMessages.settings.modules.pilotLocked)).toHaveLength(LOCKED.length);

    // Entitled cards keep their switch.
    expect(within(card('M1')).getByRole('button')).toBeTruthy();
    // Header: "Planı Değiştir" is still a link to billing.
    const change = screen.getByRole('link', { name: /Planı Değiştir/ });
    expect(change.getAttribute('href')).toBe('/tr/default/settings/billing');
  });

  test('expired pilot: still no upgrade offer', () => {
    renderModules({ ...pilotPlan, pilot: { lastDay: '28.12.2026', expired: true } });
    expect(screen.queryAllByRole('link', { name: trMessages.settings.modules.upgradeCta })).toHaveLength(0);
    expect(screen.getAllByText(trMessages.settings.modules.pilotLocked)).toHaveLength(LOCKED.length);
  });

  test('paying tenant: locked cards keep the "Planı Yükselt" link to billing', () => {
    renderModules(proPlan);

    expect(screen.queryAllByText(trMessages.settings.modules.pilotLocked)).toHaveLength(0);
    for (const id of LOCKED) {
      const link = within(card(id)).getByRole('link', { name: trMessages.settings.modules.upgradeCta });
      expect(link.getAttribute('href')).toBe('/tr/default/settings/billing');
    }
    expect(screen.getByRole('link', { name: /Planı Değiştir/ })).toBeTruthy();
  });

  test('English catalog carries both strings', () => {
    renderModules(pilotPlan, 'en');
    expect(screen.getAllByText(enMessages.settings.modules.pilotLocked)).toHaveLength(LOCKED.length);
    expect(enMessages.settings.modules.upgradeCta).toBe('Upgrade Plan');
  });
});

/**
 * NG-135 (patron K-581676, option A): M18 "Müşteri Satış Hattı" is a beta module that is
 * never sold (`planTiers: []`, no add-on). Two rules follow, and both are decided on the
 * server (`decideModuleAccess`) or in the shared state machine (`isUnsoldBeta`), never
 * copied into the page:
 *   - a pilot manager sees M18 open (`previewOpen`), so its card is not "Pilotta kapalı";
 *   - an unsold module offers no upgrade to anyone: a closed M18 card has no
 *     "Planı Yükselt" and no "kurum paketinde açılır" line, pilot or paying.
 */
describe('unsold beta M18 — open to pilot managers, never an upgrade offer', () => {
  const m18Open: ModulesPlanView = {
    ...pilotPlan,
    previewOpen: ['M18'] as ModulesPlanView['entitledModules'],
    switchedOnOutsidePlan: ['M18'] as ModulesPlanView['entitledModules'],
  };

  test('pilot with M18 open: the card is ACTIVE, says neither "Pilotta kapalı" nor offers a link', () => {
    renderModules(m18Open);
    const c = within(card('M18'));
    expect(c.getByTestId('module-status').textContent).toContain(trMessages.settings.modules.status.ACTIVE);
    expect(c.queryByText(trMessages.settings.modules.pilotLocked)).toBeNull();
    expect(c.queryByRole('link')).toBeNull();
  });

  test('pilot with M18 closed: no upgrade offer and no "kurum paketinde açılır" line', () => {
    renderModules(pilotPlan);
    const c = within(card('M18'));
    expect(c.queryByText(trMessages.settings.modules.pilotLocked)).toBeNull();
    expect(c.queryByRole('link')).toBeNull();
  });

  test('paying tenant with M18 closed: no upgrade link on the M18 card', () => {
    renderModules(proPlan);
    expect(within(card('M18')).queryByRole('link')).toBeNull();
  });
});
