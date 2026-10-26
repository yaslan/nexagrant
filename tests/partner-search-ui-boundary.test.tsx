// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import trMessages from '../messages/tr.json';

import { AnnouncementBrowser } from '@/modules/m1/ui/partner-search/AnnouncementBrowser';
import { PartnerSearchBoundary } from '@/modules/m1/ui/partner-search/PartnerSearchBoundary';
import { PartnerSignalBox } from '@/modules/m1/ui/partner-search/PartnerSignalBox';

/**
 * FO-62 review Ö1 (TASK-MVCH2YSRRM28N): an FO-61 answer of an unforeseen shape
 * costs the Partner Search widget, never the call detail or partner page around
 * it. The pure readers are covered in tests/partner-search-ui-model.test.ts;
 * this renders the components on top of them.
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const links = { partnerHref: '/tr/ws/ortaklar/:pic' };

function renderTr(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="tr" messages={trMessages} timeZone="UTC">
      <main>
        <h1>Çağrı detayı</h1>
        {ui}
      </main>
    </NextIntlClientProvider>
  );
}

function answer(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })));
}

function Thrower(): React.ReactElement {
  throw new TypeError("Cannot read properties of undefined (reading 'pic')");
}

describe('Partner Search widgets under malformed data (FO-62 Ö1)', () => {
  test('a render error stays inside the boundary; the page around it keeps rendering', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined); // React logs the caught error
    renderTr(
      <PartnerSearchBoundary>
        <Thrower />
      </PartnerSearchBoundary>
    );
    expect(screen.getByRole('heading', { name: 'Çağrı detayı' })).toBeTruthy();
    expect(screen.getByTestId('ps-boundary').textContent).toBe('İlanlar yüklenemedi. Biraz sonra tekrar deneyin.');
  });

  test('fallback={null} (the M1 table badge) renders nothing on error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { container } = renderTr(
      <PartnerSearchBoundary fallback={null}>
        <Thrower />
      </PartnerSearchBoundary>
    );
    expect(screen.queryByTestId('ps-boundary')).toBeNull();
    expect(container.querySelector('main')?.children).toHaveLength(1);
  });

  test('list: renamed fields drop the row, an unknown org type and a bad reset date render safely', async () => {
    answer(200, {
      success: true,
      meta: { page: 1, pageSize: 20, total: 3, quota: { limit: 10, used: 10, resetsAt: 'soon' } },
      data: [
        // FO-61 renames `organization` → `org`: dropped, no TypeError.
        { id: 'r1', topicIdentifier: 'T-1', type: 'EXPERTISE_REQUEST', org: { name: 'Renamed Org' } },
        {
          id: 'r2',
          topicIdentifier: 'T-1',
          type: 'EXPERTISE_REQUEST',
          publishedAt: 'not a date',
          organization: { name: 'New Type Org', type: 'PRV', pic: null },
        },
      ],
    });
    renderTr(<AnnouncementBrowser topic="T-1" links={links} upgradeHref="/tr/ws/ayarlar/faturalama" />);

    const cards = await screen.findAllByTestId('ps-announcement');
    expect(cards).toHaveLength(1);
    expect(cards[0]?.textContent).toContain('New Type Org');
    expect(cards[0]?.textContent).toContain('Belirsiz'); // orgTypesShort.unknown, not the raw key
    expect(cards[0]?.textContent).toContain('Yayın tarihi yok');
    expect(screen.queryByText('Renamed Org')).toBeNull();

    // `remaining` missing → limit − used = 0: the spent notice shows, with no "Invalid Date" reset line.
    const spent = screen.getByTestId('ps-quota-exceeded');
    expect(spent.textContent).toContain('Bu ay 10/10 sorgu kullanıldı');
    expect(spent.textContent).not.toMatch(/Invalid Date|yenilenir/);
    expect(document.body.textContent).not.toContain('PartnerSignal.');
  });

  test('signal box: a 200 whose counts are not numbers shows the box error, not a crash', async () => {
    answer(200, { data: { total: '14', requests: 9 } });
    renderTr(<PartnerSignalBox topicIdentifier="T-1" links={links} upgradeHref="/tr/ws/ayarlar/faturalama" />);
    expect(await screen.findByText('Partner sinyali şu an yüklenemedi.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Çağrı detayı' })).toBeTruthy();
  });

  test('signal box: a missing byCountry still prints the summary', async () => {
    answer(200, { data: { total: 2, requests: 1, offers: 1, trCount: 0 } });
    renderTr(<PartnerSignalBox topicIdentifier="T-1" links={links} upgradeHref="/tr/ws/ayarlar/faturalama" />);
    expect((await screen.findByTestId('partner-signal-summary')).textContent).toBe(
      'Bu topic için 2 ilan: 1 partner arıyor, 1 uzmanlık sunuyor'
    );
  });
});
