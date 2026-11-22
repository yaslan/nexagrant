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
 *
 * NG-5 (WCAG 2.5.3 Label in Name): a card link's accessible name is its own visible text — title,
 * figure, unit, description — plus the hidden action hint. The names below are written out in
 * full for the fixed metrics, so the test states them instead of agreeing with the component.
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

// jsdom lays out no flex boxes, so the figure and its unit read "4proje" here; in a browser the
// two are separate blocks and read "4 proje" (dashboard-kpi-links.spec.ts asserts that name).
const TR = {
  total: 'Toplam Teklif 4proje Bu dönemdeki aktif fırsatlar — ayrıntıya git',
  hit: 'İsabet Oranı 25,0% G0 puanı alan fırsatlar içinde gönderilen teklif oranı — ayrıntıya git',
  threshold: 'Eşik Üstü Oranı 50,0% Gönderilen teklifler içinde eşik üstü puanlandırılanların oranı — ayrıntıya git',
  score: 'Ortalama Puan 3,5/5 Ortalama değerlendirme puanı (iç ön değerlendirme) — ayrıntıya git',
  personDays: 'Kişi-Gün / Teklif 2,0gün Teklif başına toplam efor — ayrıntıya git',
  g2: 'Ort. G2 Süresi (gün) 12,0gün Ortalama kapı ilerleme süresi — ayrıntıya git',
  modules: 'Açık Modüller 6modül Açık platform modülleri — ayrıntıya git',
};

describe('panel KPI card links', () => {
  test('tr: every card opens its page, the owner also gets Settings › Modules', () => {
    renderPanel('tr', { canManageModules: true });
    expect(hrefOf(TR.total)).toBe('/tr/main/firsatlar');
    expect(hrefOf(TR.hit)).toBe('/tr/main/firsatlar');
    expect(hrefOf(TR.threshold)).toBe('/tr/main/firsatlar');
    expect(hrefOf(TR.personDays)).toBe('/tr/main/reports/person-days');
    expect(hrefOf(TR.g2)).toBe('/tr/main/firsatlar');
    expect(hrefOf(TR.modules)).toBe('/tr/main/ayarlar/moduller');
    expect(hrefOf(TR.score)).toBe('/tr/main/firsatlar');
  });

  test('en: the same mapping on the English routes', () => {
    renderPanel('en', { canManageModules: true });
    expect(hrefOf('Total Proposals 4projects Active opportunities in this period — go to details')).toBe(
      '/en/main/pipeline',
    );
    expect(hrefOf('Person-Days / Proposal 2.0days Total effort per proposal — go to details')).toBe(
      '/en/main/reports/person-days',
    );
    expect(hrefOf('Active Modules 6modules Enabled platform modules — go to details')).toBe(
      '/en/main/settings/modules',
    );
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
    const card = screen.getByRole('link', {
      name: 'Kişi-Gün / Teklif Henüz veri yok Henüz teklif yok; teklif başına efor hesaplanamıyor. — ayrıntıya git',
    });
    expect(card.getAttribute('href')).toBe('/tr/main/reports/person-days');
    expect(card.textContent).toContain('Henüz veri yok');
  });

  test('the name is the visible text plus the hint, and no link is nested', () => {
    renderPanel('tr');
    const card = screen.getByRole('link', { name: TR.total });
    // Label in Name: the visible text (everything but the hidden hint) sits inside the name.
    const visible = Array.from(card.children)
      .filter((c) => !c.querySelector('.sr-only') && !c.classList.contains('sr-only'))
      .map((c) => c.textContent)
      .join(' ');
    expect(visible).toContain('Toplam Teklif');
    expect(visible).toContain('4');
    expect(visible).toContain('Bu dönemdeki aktif fırsatlar');
    expect(card.querySelector('.sr-only')?.textContent).toBe('— ayrıntıya git');
    expect(card.getAttribute('aria-label')).toBeNull();
    expect(card.querySelector('a')).toBeNull();
  });
});
