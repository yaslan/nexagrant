import { describe, test, expect, vi, beforeEach } from 'vitest';

/**
 * İNCELEME-105 Ö-1 (TASK-MUOD30XARRIII). The CORDIS fix (8ca11f55) keeps the
 * importer's failure text on the server behind two layers: the importer picks
 * a fixed code, and `handleRunCordisImportAction` passes it through
 * `cordisImportFailureCode` again. tests/cordis-csv.test.ts runs the real
 * importer under the action, so there the second layer never sees a bad code
 * and could be deleted unnoticed. Here the importer is a stub that returns
 * exactly what the second layer exists for: a failure whose code is raw text.
 */

const SECRET = 'relation "CordisProject" does not exist at /srv/secret/cordis.zip';

vi.mock('@/lib/k2-cordis/importer', () => ({ runCordisImport: vi.fn() }));
vi.mock('@/lib/db', () => ({
  prisma: {
    cordisImportRun: { findFirst: vi.fn(async () => null) },
    cordisProject: { count: vi.fn(async () => 1) },
    cordisOrganization: { count: vi.fn(async () => 2) },
    cordisParticipation: { count: vi.fn(async () => 3) },
    cordisPartnerProfile: { count: vi.fn(async () => 4) },
  },
}));
vi.mock('@/lib/tenant', () => ({ requirePlatformAdmin: vi.fn(async () => ({})) }));
vi.mock('@/lib/k2-cordis/partnerProfileJob', () => ({
  generatePartnerProfiles: vi.fn(async () => ({ updatedProfiles: 0, updatedCoParticipations: 0, durationMs: 0 })),
}));
vi.mock('@/lib/cordis-sync', () => ({ syncCordisBigData: vi.fn(), aggregateCordisMetrics: vi.fn() }));
vi.mock('@/lib/cordis-delta', () => ({ fetchLiveCordisDelta: vi.fn(), getCordisLiveStreamLogs: vi.fn() }));
vi.mock('@/lib/rag', () => ({ retrieveChunks: vi.fn(), formatRagContext: vi.fn() }));

import { prisma } from '@/lib/db';
import { runCordisImport } from '@/lib/k2-cordis/importer';
import { CORDIS_IMPORT_FAILURE_CODES, cordisImportFailureCode } from '@/lib/k2-cordis/failure-codes';
import { handleGetK2Status, handleRunCordisImportAction } from '@/app/[locale]/admin/cordis/actions';

/** A failed importer result, as the type allows it plus what a regression could add. */
function failedImport(errorCode: unknown) {
  return {
    success: false,
    runId: 'run-7',
    rowCounts: { projects: 0, organizations: 0, participations: 0, topics: 0, scivocs: 0 },
    durationMs: 12,
    errorCode,
    error: SECRET,
    skippedRecords: [{ file: 'project.csv', records: 2, skipped: 1, samples: [{ line: 4, reason: SECRET }] }],
  } as never;
}

beforeEach(() => {
  vi.mocked(runCordisImport).mockReset();
});

describe('cordisImportFailureCode — the whitelist on its own', () => {
  test('a listed code passes unchanged', () => {
    for (const code of CORDIS_IMPORT_FAILURE_CODES) expect(cordisImportFailureCode(code)).toBe(code);
  });

  test.each([
    ['a raw message', SECRET],
    ['a fetch error text', 'fetch failed'],
    ['a translation-key lookalike', 'importErrors.IMPORT_FAILED'],
    ['a listed code in another case', 'skip_limit_exceeded'],
    ['an Object.prototype name', 'toString'],
    ['an empty string', ''],
    ['undefined', undefined],
    ['null', null],
    ['a number', 42],
    ['an Error', new Error(SECRET)],
  ])('%s becomes IMPORT_FAILED', (_label, input) => {
    expect(cordisImportFailureCode(input)).toBe('IMPORT_FAILED');
  });
});

describe('handleRunCordisImportAction — second layer (action whitelist)', () => {
  test('a raw text in errorCode is replaced by IMPORT_FAILED; nothing else of the result leaves', async () => {
    vi.mocked(runCordisImport).mockResolvedValue(failedImport(SECRET));

    const res = await handleRunCordisImportAction('HORIZON');

    expect(res).toStrictEqual({ success: false, errorCode: 'IMPORT_FAILED' });
    expect(JSON.stringify(res)).not.toMatch(/CordisProject|\/srv\/secret/);
  });

  test('a failure without a code is IMPORT_FAILED', async () => {
    vi.mocked(runCordisImport).mockResolvedValue(failedImport(undefined));

    await expect(handleRunCordisImportAction('H2020')).resolves.toStrictEqual({
      success: false,
      errorCode: 'IMPORT_FAILED',
    });
  });

  test('a listed code reaches the console as it is', async () => {
    vi.mocked(runCordisImport).mockResolvedValue(failedImport('SKIP_LIMIT_EXCEEDED'));

    await expect(handleRunCordisImportAction('HORIZON')).resolves.toStrictEqual({
      success: false,
      errorCode: 'SKIP_LIMIT_EXCEEDED',
    });
  });
});

describe('handleGetK2Status — the stored run error stays in the database', () => {
  test('lastRun carries only the listed columns', async () => {
    vi.mocked(prisma.cordisImportRun.findFirst).mockResolvedValueOnce({
      runId: 'run-9',
      dataset: 'HORIZON',
      startedAt: new Date('2026-09-30T10:00:00Z'),
      finishedAt: new Date('2026-09-30T10:01:00Z'),
      status: 'FAILED',
      fileHash: null,
      // A failed run writes no counts; a fallback to `error` here would leak it.
      rowCounts: null,
      error: SECRET,
    } as never);

    const res = await handleGetK2Status();

    expect(Object.keys(res.lastRun ?? {}).sort()).toEqual(
      ['dataset', 'fileHash', 'finishedAt', 'rowCounts', 'runId', 'startedAt', 'status'].sort()
    );
    expect(res.lastRun).toMatchObject({ runId: 'run-9', status: 'FAILED', rowCounts: null });
    expect(JSON.stringify(res)).not.toMatch(/CordisProject|\/srv\/secret/);
  });
});
