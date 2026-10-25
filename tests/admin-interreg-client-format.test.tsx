// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import trMessages from '../messages/tr.json';
import enMessages from '../messages/en.json';
import type { KeepEuMetrics } from '@/lib/keep-eu-sync';

vi.mock('@/app/[locale]/admin/interreg/actions', () => ({
  handleRunKeepEuSyncAction: vi.fn(),
  handleGetKeepEuMetricsAction: vi.fn(),
  handleTestInterregRagQuery: vi.fn(),
}));

const { KeepEuAdminClient } = await import('@/app/[locale]/admin/interreg/client');

/**
 * /admin/interreg hydration (CE-699…CE-702).
 *
 * "Son Senkronizasyon" and the counters were printed with a bare
 * `toLocaleString()`: the server rendered en-US in its process zone
 * ("10/21/2026, 9:05:00 AM", "12,345") and a Turkish browser rendered
 * "21.10.2026 09:05:00" / "12.345", so React threw a hydration error. The text
 * has to depend on the UI locale only — never on the process locale or zone.
 */
const METRICS: KeepEuMetrics = {
  totalProjectsCount: 12345,
  totalPartnersCount: 67890,
  turkishPartnersCount: 1234,
  totalEuFundingEUR: 0,
  totalBudgetEUR: 0,
  averageGrantPerProjectEUR: 0,
  topProgrammesBreakdown: [],
  topCountriesBreakdown: [],
  lastSyncTimestamp: '2026-10-21T06:05:00.000Z',
};

function renderedText(locale: 'tr' | 'en', processZone: string): string {
  const previous = process.env.TZ;
  process.env.TZ = processZone;
  try {
    const { container } = render(
      <NextIntlClientProvider locale={locale} messages={locale === 'tr' ? trMessages : enMessages} timeZone="UTC">
        <KeepEuAdminClient initialMetrics={METRICS} />
      </NextIntlClientProvider>
    );
    const text = container.textContent ?? '';
    cleanup();
    return text;
  } finally {
    process.env.TZ = previous;
  }
}

afterEach(cleanup);

describe('admin interreg — locale-pinned formatting', () => {
  it('prints the sync time in the UI locale and a fixed zone', () => {
    render(
      <NextIntlClientProvider locale="tr" messages={trMessages} timeZone="UTC">
        <KeepEuAdminClient initialMetrics={METRICS} />
      </NextIntlClientProvider>
    );
    const header = screen.getByText(/21\.10\.2026/);
    expect(header.textContent).toMatch(/21\.10\.2026 09:05/);
    expect(header.textContent).toMatch(/GMT\+3/);
    expect(document.body.textContent).toContain('12.345');
  });

  it.each(['tr', 'en'] as const)('renders the same %s text whatever the process zone is', (locale) => {
    const utc = renderedText(locale, 'UTC');
    const ny = renderedText(locale, 'America/New_York');
    expect(ny).toBe(utc);
  });

  it('uses English digits and date order for en', () => {
    const text = renderedText('en', 'UTC');
    expect(text).toContain('12,345');
    expect(text).toMatch(/10\/21\/2026, 09:05\s?AM GMT\+3/);
  });
});
