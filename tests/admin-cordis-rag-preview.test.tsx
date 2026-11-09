// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import trMessages from '../messages/tr.json';
import enMessages from '../messages/en.json';

/**
 * NG-40 (PR #304 review, P2-5). A search that matched nothing returns an empty
 * context, and the preview read that as "not searched yet": the admin was told to
 * run the search they had just run.
 */

vi.mock('@/app/[locale]/admin/cordis/actions', () => ({
  handleRunCordisImportAction: vi.fn(),
  handleGetK2Status: vi.fn(async () => ({ lastRun: null, rowCounts: {} })),
  handleRunCordisSync: vi.fn(),
  handleRunCordisLiveDelta: vi.fn(),
  handleTestRagQuery: vi.fn(),
}));

import { handleTestRagQuery } from '@/app/[locale]/admin/cordis/actions';
import { CordisRagAdminClient } from '@/app/[locale]/admin/cordis/client';

const METRICS = {
  totalProjectsCount: 0,
  totalEcContributionEUR: 0,
  topCountriesBreakdown: [],
  averageGrantPerProjectEUR: 0,
  lastSyncTimestamp: '2026-09-30T10:00:00Z',
};
const NOT_SEARCHED = /Sol taraftan arama yaptığınızda/;

function openWorkbench(locale: 'tr' | 'en' = 'tr') {
  render(
    <NextIntlClientProvider locale={locale} messages={locale === 'tr' ? trMessages : enMessages} onError={() => {}}>
      <CordisRagAdminClient metrics={METRICS} initialK2Status={{ lastRun: null, rowCounts: {} }} />
    </NextIntlClientProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: /Vector RAG Lab/ }));
}

// The button is named in the locale under test: its label is a catalog string.
const search = (locale: 'tr' | 'en' = 'tr') =>
  fireEvent.click(
    screen.getByRole('button', {
      name: new RegExp(locale === 'tr' ? trMessages.adminCordis.rag.search : enMessages.adminCordis.rag.search),
    })
  );

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CordisRagAdminClient — RAG preview', () => {
  test('before any search it invites one and does not claim there were no matches', () => {
    openWorkbench();
    expect(screen.getByText(NOT_SEARCHED)).toBeTruthy();
    expect(screen.queryByText(trMessages.adminCordis.ragPreview.noMatches)).toBeNull();
  });

  test.each([
    ['tr', trMessages.adminCordis.ragPreview.noMatches],
    ['en', enMessages.adminCordis.ragPreview.noMatches],
  ] as const)('a search that matched nothing says so (%s)', async (locale, text) => {
    vi.mocked(handleTestRagQuery).mockResolvedValueOnce({ chunks: [], ragPrompt: '' });
    openWorkbench(locale);
    search(locale);
    expect(await screen.findByText(text)).toBeTruthy();
    expect(screen.queryByText(NOT_SEARCHED)).toBeNull();
  });

  test('a search that matched shows the context, and neither placeholder', async () => {
    vi.mocked(handleTestRagQuery).mockResolvedValueOnce({
      chunks: [{ text: 't', documentId: 'd', score: 0.9 }],
      ragPrompt: 'THE CONTEXT',
    });
    openWorkbench();
    search();
    expect(await screen.findByText('THE CONTEXT')).toBeTruthy();
    expect(screen.queryByText(NOT_SEARCHED)).toBeNull();
    expect(screen.queryByText(trMessages.adminCordis.ragPreview.noMatches)).toBeNull();
  });
});
