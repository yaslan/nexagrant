// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import trMessages from '../messages/tr.json';

/**
 * NG-109 (TASK-MW8KFYW9GXI76). When the server answer lacks a field, the admin
 * Cordis console must show an explicit placeholder `—`. The old fallbacks wrote
 * `0` ("0 kayıt"), an empty pair of parentheses and a bare `€`, which read as real
 * figures.
 */

vi.mock('@/app/[locale]/admin/cordis/actions', () => ({
  handleRunCordisImportAction: vi.fn(),
  handleGetK2Status: vi.fn(async () => ({ lastRun: null, rowCounts: {} })),
  handleRunCordisSync: vi.fn(),
  handleRunCordisLiveDelta: vi.fn(),
  handleTestRagQuery: vi.fn(),
}));

import {
  handleRunCordisImportAction,
  handleRunCordisSync,
  handleRunCordisLiveDelta,
} from '@/app/[locale]/admin/cordis/actions';
import { CordisRagAdminClient } from '@/app/[locale]/admin/cordis/client';

const METRICS = {
  totalProjectsCount: 0,
  totalEcContributionEUR: 0,
  topCountriesBreakdown: [],
  averageGrantPerProjectEUR: 0,
  lastSyncTimestamp: '2026-09-30T10:00:00Z',
};

const cordis = trMessages.adminCordis;

function renderClient() {
  return render(
    <NextIntlClientProvider locale="tr" messages={trMessages} onError={() => {}}>
      <CordisRagAdminClient metrics={METRICS} initialK2Status={{ lastRun: null, rowCounts: {} }} />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CordisRagAdminClient — missing server fields show a placeholder', () => {
  test('an import answer without rowCounts shows —, not 0 records', async () => {
    vi.mocked(handleRunCordisImportAction).mockResolvedValueOnce({ success: true } as never);
    renderClient();

    fireEvent.click(screen.getByRole('button', { name: cordis.k2.runImport }));

    const line = await screen.findByText(/İşlenen:/);
    expect(line.textContent).toBe('İşlenen: — Proje, — Kuruluş, — Katılım. Süre: —ms.');
    expect(line.textContent).not.toMatch(/İşlenen: 0/);
  });

  test('a sync answer without totalEcContributionEUR shows — and no bare €', async () => {
    vi.mocked(handleRunCordisSync).mockResolvedValueOnce({ syncedProjectsCount: 3 } as never);
    renderClient();

    fireEvent.click(screen.getByRole('button', { name: cordis.tabs.sync }));
    fireEvent.click(screen.getByRole('button', { name: cordis.sync.run }));

    const line = await screen.findByText(/Toplam Hibe:/);
    expect(line.textContent).toBe('İşlenen Proje Sayısı: 3 — Toplam Hibe: —');
    expect(line.textContent).not.toMatch(/€\s*$/);
  });

  test('a delta project without coordinator fields shows — in both places', async () => {
    vi.mocked(handleRunCordisLiveDelta).mockResolvedValueOnce({
      deltaCount: 1,
      ingestedProjects: [
        {
          acronym: 'ACR',
          title: 'Proje',
          topicCode: 'HORIZON-X',
          coordinatorName: null,
          coordinatorCountry: null,
          ecContributionEUR: 1000,
        },
      ],
    } as never);
    renderClient();

    fireEvent.click(screen.getByRole('button', { name: cordis.tabs.delta }));
    fireEvent.click(screen.getByRole('button', { name: cordis.delta.run }));

    expect(await screen.findByText('Koordinatör: — (—)')).toBeTruthy();
    expect(screen.queryByText(/Koordinatör: \(/)).toBeNull();
  });
});
