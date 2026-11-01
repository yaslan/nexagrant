// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import trMessages from '../messages/tr.json';

/**
 * İNCELEME-105 Ö-1 (TASK-MUOD30XARRIII). The admin console shows a failed
 * import as `adminCordis.importErrors.<code>`, and only for a listed code; a
 * thrown action shows IMPORT_FAILED. Nothing else in the gates renders this
 * component, so either could be undone unnoticed.
 */

const SECRET = 'relation "CordisProject" does not exist at /srv/secret/cordis.zip';

vi.mock('@/app/[locale]/admin/cordis/actions', () => ({
  handleRunCordisImportAction: vi.fn(),
  handleGetK2Status: vi.fn(async () => ({ lastRun: null, rowCounts: {} })),
  handleRunCordisSync: vi.fn(),
  handleRunCordisLiveDelta: vi.fn(),
  handleTestRagQuery: vi.fn(),
}));

import { handleRunCordisImportAction } from '@/app/[locale]/admin/cordis/actions';
import { CordisRagAdminClient } from '@/app/[locale]/admin/cordis/client';

const METRICS = {
  totalProjectsCount: 0,
  totalEcContributionEUR: 0,
  topCountriesBreakdown: [],
  averageGrantPerProjectEUR: 0,
  lastSyncTimestamp: '2026-09-30T10:00:00Z',
};

async function runImportAndReadAlert(): Promise<string> {
  render(
    <NextIntlClientProvider locale="tr" messages={trMessages} onError={() => {}}>
      <CordisRagAdminClient metrics={METRICS} initialK2Status={{ lastRun: null, rowCounts: {} }} />
    </NextIntlClientProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: /Şimdi Çalıştır/ }));
  return (await screen.findByRole('alert')).textContent ?? '';
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CordisRagAdminClient — import failure message', () => {
  test('a thrown action shows IMPORT_FAILED, not the error text', async () => {
    vi.mocked(handleRunCordisImportAction).mockRejectedValueOnce(new Error(SECRET));

    const text = await runImportAndReadAlert();

    expect(text).toBe(trMessages.adminCordis.importErrors.IMPORT_FAILED);
    expect(text).not.toMatch(/CordisProject|\/srv\/secret/);
  });

  test('an unlisted code from the server shows IMPORT_FAILED, not the code', async () => {
    vi.mocked(handleRunCordisImportAction).mockResolvedValueOnce({ success: false, errorCode: SECRET } as never);

    const text = await runImportAndReadAlert();

    expect(text).toBe(trMessages.adminCordis.importErrors.IMPORT_FAILED);
    expect(text).not.toMatch(/CordisProject|\/srv\/secret/);
  });

  test('a listed code shows its own sentence', async () => {
    vi.mocked(handleRunCordisImportAction).mockResolvedValueOnce({ success: false, errorCode: 'SKIP_LIMIT_EXCEEDED' });

    await expect(runImportAndReadAlert()).resolves.toBe(trMessages.adminCordis.importErrors.SKIP_LIMIT_EXCEEDED);
  });
});
