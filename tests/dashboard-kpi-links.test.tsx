// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import trMessages from '../messages/tr.json';
import enMessages from '../messages/en.json';

/**
 * FO-69 (TASK-MVCPDQA43WNMS) — each panel KPI card is one link to the page its figure is
 * worked on; the active-modules card links only for a reader who may manage modules, and a
 * card with no measurement yet still links (that page is where the data comes from).
 * Targets are spelled out, not built with getWorkspaceRoute.
 */

const pathname = vi.hoisted(() => ({ value: '/tr/main/panel' }));
vi.mock('next/navigation', () => ({
  usePathname: () => pathname.value,
  useRouter: () => ({ push: vi.fn() }),
}));

import { Dashboard } from '@/modules/m5/ui/Dashboard';
import type { KpiMetrics } from '@/modules/m5/server/queries';

afterEach(cleanup);

const metrics = (over: Partial<KpiMetrics> = {}): KpiMetrics => ({
  totalOffers: 4,
  activeModules: 6,
  successRate: { measured: true, value: 25 },
  averageScore: { measured: true, value: 3.5 },
  personDays: { measured: true, value: 2 },
  g0ToG2Days: { measured: true, value: 12 },
  thresholdRate: { measured: true, value: 50 },
  hasAnyOpportunity: true,
  ...over,
});

function renderPanel(locale: 'tr' | 'en', opts: { canManageModules?: boolean; metrics?: KpiMetrics } = {}) {
  pathname.value = locale === 'tr' ? '/tr/main/panel' : '/en/main/dashboard';
  render(
    <NextIntlClientProvider locale={locale} messages={locale === 'tr' ? trMessages : enMessages}>
      <Dashboard
        metrics={opts.metrics ?? metrics()}
        trendData={[]}
        from="2026-09-17"
        to="2026-10-17"
        canManageModules={opts.canManageModules}
      />
    </NextIntlClientProvider>,
  );
}

const hrefOf = (name: string) => screen.getByRole('link', { name }).getAttribute('href');

describe('panel KPI card links', () => {
  test('tr: every card opens its page, the owner also gets Settings › Modules', () => {
    renderPanel('tr', { canManageModules: true });
    const go = ' — ayrıntıya git';
    expect(hrefOf(`Toplam Teklif${go}`)).toBe('/tr/main/firsatlar');
    expect(hrefOf(`İsabet Oranı${go}`)).toBe('/tr/main/firsatlar');
    expect(hrefOf(`Eşik Üstü Oranı${go}`)).toBe('/tr/main/firsatlar');
    expect(hrefOf(`Ortalama Puan${go}`)).toBe('/tr/main/firsatlar');
    expect(hrefOf(`Kişi-Gün / Teklif${go}`)).toBe('/tr/main/reports/person-days');
    expect(hrefOf(`Ort. G2 Süresi (gün)${go}`)).toBe('/tr/main/firsatlar');
    expect(hrefOf(`Açık Modüller${go}`)).toBe('/tr/main/ayarlar/moduller');
  });

  test('en: the same mapping on the English routes', () => {
    renderPanel('en', { canManageModules: true });
    const go = ' — go to details';
    expect(hrefOf(`Total Proposals${go}`)).toBe('/en/main/pipeline');
    expect(hrefOf(`Person-Days / Proposal${go}`)).toBe('/en/main/reports/person-days');
    expect(hrefOf(`Active Modules${go}`)).toBe('/en/main/settings/modules');
  });

  test('without manage_modules the active-modules card is a plain block, not a link', () => {
    renderPanel('tr');
    expect(screen.getByRole('heading', { name: 'Açık Modüller' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Açık Modüller/ })).toBeNull();
    // Six cards still link; nothing else in the overview is a link.
    expect(screen.getAllByRole('link')).toHaveLength(6);
  });

  test('an unmeasured card still links to where its data is produced', () => {
    renderPanel('tr', { metrics: metrics({ personDays: { measured: false } }) });
    const card = screen.getByRole('link', { name: 'Kişi-Gün / Teklif — ayrıntıya git' });
    expect(card.getAttribute('href')).toBe('/tr/main/reports/person-days');
    expect(card.textContent).toContain('Henüz veri yok');
  });

  test('the figure and description are the link description, and no link is nested', () => {
    renderPanel('tr');
    const card = screen.getByRole('link', { name: 'Toplam Teklif — ayrıntıya git' });
    const describedBy = (card.getAttribute('aria-describedby') ?? '').split(' ');
    const described = describedBy.map((id) => document.getElementById(id)?.textContent).join(' ');
    expect(described).toContain('4');
    expect(described).toContain('Bu dönemdeki aktif fırsatlar');
    expect(card.querySelector('a')).toBeNull();
  });
});
