import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import { writeZip } from './helpers/stored-zip';
import { parseCordisCsv } from '../src/lib/k2-cordis/csv';

/**
 * TASK-MUMH7CVD8P2J0. The real HORIZON dump (cordis-HORIZONprojects-csv.zip,
 * sha256 1496a16e…, 28.08.2026) broke csv-parse at project.csv line 24 and the
 * importer wrote 22 of 23,613 projects. The rows below are shortened copies of
 * the records that broke it; only the free text in the middle was cut.
 */
const PROJECT_HEADER =
  '"id";"acronym";"status";"title";"startDate";"endDate";"totalCost";"ecMaxContribution";"topics";"ecSignatureDate";"frameworkProgramme";"masterCall";"subCall";"fundingScheme";"nature";"objective";"contentUpdateDate";"rcn";"grantDoi";"keywords";"Human-validated";"legalBasis"';

/** project.csv line 24: objective starts with a quote and has no outer wrapper. */
const ROW_UNWRAPPED_OBJECTIVE =
  '"101069905";"REPAIR";"SIGNED";"Removing non-CO2 greenhouse gas emissions to support ambitious climate transitions";"2022-10-01";"2026-09-30";"2996941,25";"2996941,25";"HORIZON-CL5-2021-D2-01-10";"2022-06-03";"HORIZON";"HORIZON-CL5-2021-D2-01";"HORIZON-CL5-2021-D2-01";"HORIZON-RIA";"";""Non-CO2 greenhouse gases are responsible for 28% of total anthropogenic emissions. From 2030 as indicated in the ""Fit for 55"" plan. The project consortium has expertise to create socio-economic impact."";"2026-04-20 12:21:04";"237940";"10.3030/101069905";"removing non-CO2 greenhouse gas emissions; material development";"true";"HORIZON.2.5"';

/** project.csv line 1896: a doubled quote right before `;` inside the objective. */
const ROW_QUOTE_BEFORE_SEMICOLON =
  '"101040297";"MUSICOVID";"SIGNED";"Music and emotions in pandemics";"2022-10-01";"2027-09-30";"1498920";"1498920";"ERC-2021-STG";"2022-06-15";"HORIZON";"ERC-2021-STG";"ERC-2021-STG";"HORIZON-ERC";"";""Within day of Covid-19 reaching Europe, music had emerged. It combines ""music as emotional practice"" and ""emotions as embodied practices"";-to generate ground-breaking historical insight, including Covid-19."";"2026-01-10 10:00:00";"241000";"10.3030/101040297";"History of Emotions,  Music and Emotions";"false";"HORIZON.1.1"';

/** project.csv line 1649: keywords wrapped in a quoted list with `""; ""` separators. */
const ROW_QUOTED_KEYWORD_LIST =
  '"101070321";"XRAYWEEE";"SIGNED";"X-ray sorting of batteries";"2022-09-01";"2025-08-31";"2528422,5";"2078673";"HORIZON-CL4-2021-DIGITAL-EMERGING-01-01";"2022-05-25";"HORIZON";"HORIZON-CL4-2021-DIGITAL-EMERGING-01";"HORIZON-CL4-2021-DIGITAL-EMERGING-01";"HORIZON-IA";"";"The project builds a stand-alone product for recycling facilities.";"2026-01-23 12:41:06";"239726";"10.3030/101070321";""""X-Ray imaging""; ""battery fires in WEEE""; ""zombie batteries"""";"false";"HORIZON.2.4"';

/** A plain, well-formed row (line 2) with a multi-line objective. */
const ROW_PLAIN =
  '"101069359";"SolDAC";"SIGNED";"Full spectrum SOLar Direct Air Capture & conversion";"2022-09-01";"2025-08-31";"2073781,25";"2073781,25";"HORIZON-CL5-2021-D2-01-11";"2022-05-12";"HORIZON";"HORIZON-CL5-2021-D2-01";"HORIZON-CL5-2021-D2-01";"HORIZON-RIA";"";"Ethylene is the chemical industry’s primary building block.\nSolDAC’s ""solar"" route closes the loop.";"2026-03-27 15:10:23";"241911";"10.3030/101069359";"direct air capture";"false";"HORIZON.2.5"';

describe('parseCordisCsv — real HORIZON dump shapes', () => {
  test('reads every broken record with the header field count and the intended text', () => {
    const csv = [
      PROJECT_HEADER,
      ROW_PLAIN,
      ROW_UNWRAPPED_OBJECTIVE,
      ROW_QUOTE_BEFORE_SEMICOLON,
      ROW_QUOTED_KEYWORD_LIST,
      '',
    ].join('\n');

    const { rows, malformed } = parseCordisCsv(csv);

    expect(malformed).toEqual([]);
    expect(rows.map((r) => r.id)).toEqual(['101069359', '101069905', '101040297', '101070321']);

    const [plain, unwrapped, semicolon, keywords] = rows;
    expect(plain!.objective).toBe(
      'Ethylene is the chemical industry’s primary building block.\nSolDAC’s "solar" route closes the loop.'
    );
    expect(unwrapped!.objective).toMatch(/^"Non-CO2 greenhouse gases/);
    expect(unwrapped!.objective).toContain('the "Fit for 55" plan');
    expect(unwrapped!.contentUpdateDate).toBe('2026-04-20 12:21:04');
    expect(unwrapped!.legalBasis).toBe('HORIZON.2.5');
    expect(semicolon!.objective).toContain('"emotions as embodied practices";-to generate');
    expect(semicolon!.rcn).toBe('241000');
    expect(keywords!.keywords).toBe(
      '""X-Ray imaging"; "battery fires in WEEE"; "zombie batteries""'
    );
    expect(keywords!['Human-validated']).toBe('false');
  });

  test('topics.csv title with undoubled inner quotes', () => {
    const { rows, malformed } = parseCordisCsv(
      '"topic";"title";"projectID"\n' +
        '"HORIZON-CL5-2024-D5-01-12";""Combining technologies contributing to the "Fit for 55" package objective by 2030 (ZEWT Partnership)"";"101192661"\n'
    );
    expect(malformed).toEqual([]);
    expect(rows[0]!.title).toBe(
      '"Combining technologies contributing to the "Fit for 55" package objective by 2030 (ZEWT Partnership)"'
    );
    expect(rows[0]!.projectID).toBe('101192661');
  });

  test('well-formed RFC 4180 fields, BOM and CRLF read as usual', () => {
    const { rows, malformed } = parseCordisCsv(
      '﻿"a";"b";"c"\r\n"""Quoted""";"";"x;y"\r\n'
    );
    expect(malformed).toEqual([]);
    expect(rows).toEqual([{ a: '"Quoted"', b: '', c: 'x;y' }]);
  });

  test('a record it cannot split is reported with its line, not dropped', () => {
    const { rows, malformed } = parseCordisCsv(
      '"a";"b"\n"1";"one"\n"2";"t";"wo"\n"3";"three"\n'
    );
    expect(rows.map((r) => r.a)).toEqual(['1', '3']);
    expect(malformed).toEqual([{ line: 3, reason: 'expected 2 fields, got 3' }]);
  });
});

// ─── Importer: skipped records fail the run ───────────────────────────────

const writes = {
  projects: 0,
  participations: 0,
  runs: new Map<string, Record<string, unknown>>(),
  alerts: [] as Array<Record<string, unknown>>,
};

vi.mock('../src/lib/db', () => {
  const upsertCounter = (key: 'projects' | 'participations' | null) =>
    vi.fn(async (args: { create: unknown }) => {
      if (key) writes[key]++;
      return args.create;
    });
  return {
    prisma: {
      rawFetch: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }: { data: unknown }) => data),
      },
      cordisImportRun: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const runId = `run-${writes.runs.size + 1}`;
          writes.runs.set(runId, { runId, ...data });
          return { runId };
        }),
        update: vi.fn(
          async ({ where, data }: { where: { runId: string }; data: Record<string, unknown> }) => {
            const row = { ...writes.runs.get(where.runId), ...data };
            writes.runs.set(where.runId, row);
            return row;
          }
        ),
        findFirst: vi.fn(async () => null),
      },
      cordisProject: { upsert: upsertCounter('projects'), count: vi.fn(async () => 0) },
      cordisOrganization: { upsert: upsertCounter(null), count: vi.fn(async () => 0) },
      cordisParticipation: { upsert: upsertCounter('participations'), count: vi.fn(async () => 0) },
      cordisPartnerProfile: { count: vi.fn(async () => 0) },
      cordisProjectTopic: { upsert: upsertCounter(null) },
      cordisProjectSciVoc: { upsert: upsertCounter(null) },
      systemAlert: {
        findMany: vi.fn(async () => []),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          writes.alerts.push(data);
          return { id: `alert-${writes.alerts.length}` };
        }),
      },
      $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    },
  };
});

// The admin console action, for the tests at the end of this file. Only the
// importer runs for real; its neighbours in the action module are stubbed.
vi.mock('@/lib/tenant', () => ({ requirePlatformAdmin: vi.fn(async () => ({})) }));
vi.mock('@/lib/k2-cordis/partnerProfileJob', () => ({
  generatePartnerProfiles: vi.fn(async () => ({ updatedProfiles: 0, updatedCoParticipations: 0, durationMs: 0 })),
}));
vi.mock('@/lib/cordis-sync', () => ({ syncCordisBigData: vi.fn(), aggregateCordisMetrics: vi.fn() }));
vi.mock('@/lib/cordis-delta', () => ({ fetchLiveCordisDelta: vi.fn(), getCordisLiveStreamLogs: vi.fn() }));
vi.mock('@/lib/rag', () => ({ retrieveChunks: vi.fn(), formatRagContext: vi.fn() }));

const ORG_HEADER =
  '"projectID";"projectAcronym";"organisationID";"vatNumber";"name";"shortName";"SME";"activityType";"street";"postCode";"city";"country";"nutsCode";"geolocation";"organizationURL";"contactForm";"contentUpdateDate";"rcn";"order";"role";"ecContribution";"netEcContribution";"totalCost";"endOfParticipation";"active"';
const orgRow = (projectId: string, orgId: string) =>
  `"${projectId}";"X";"${orgId}";"";"ORG ${orgId}";"";"true";"PRC";"";"";"ANKARA";"TR";"";"";"";"";"2026-03-27 15:10:23";"1";"1";"coordinator";"1000";"1000";"1000";"false";""`;

describe('runCordisImport — skipped records', () => {
  beforeEach(() => {
    writes.projects = 0;
    writes.participations = 0;
    writes.runs.clear();
    writes.alerts.length = 0;
  });

  test('a record it cannot read, over the limit, fails the run before any write', async () => {
    const { runCordisImport } = await import('../src/lib/k2-cordis/importer');
    const zipPath = writeZip({
      'project.csv': [PROJECT_HEADER, ROW_PLAIN, '"999";"broken";"row"', ''].join('\n'),
      'organization.csv': [ORG_HEADER, orgRow('101069359', '900000001'), ''].join('\n'),
    });

    const res = await runCordisImport({ dataset: 'HORIZON', localZipPath: zipPath });

    expect(res.success).toBe(false);
    // The result carries a code only; it reaches the admin console through a
    // server action. The reason is on the run row (İNCELEME-100 Y-1).
    expect(res.errorCode).toBe('SKIP_LIMIT_EXCEEDED');
    // The thrown message is not in the result. `skippedRecords` still is, as
    // structure (`{ line: 4, reason: 'expected 22 fields, got 3' }`): nothing
    // passes it on, and the action returns the code only (İNCELEME-105 Ö-3).
    expect(JSON.stringify(res)).not.toContain('CORDIS dump rejected');
    expect(writes.projects).toBe(0);
    expect(writes.participations).toBe(0);
    const run = writes.runs.get(res.runId)!;
    expect(run.status).toBe('FAILED');
    expect(run.error).toContain('project.csv: 1/2 skipped');
    // ROW_PLAIN spans two lines, so the broken record starts on line 4.
    expect(run.error).toContain('line 4: expected 22 fields, got 3');
    expect(writes.alerts).toHaveLength(1);
    expect(writes.alerts[0]).toMatchObject({ level: 'error', source: 'k2_cordis_import' });
  });

  test('a participation of an unknown project is skipped, counted, and fails at the default limit', async () => {
    const { runCordisImport } = await import('../src/lib/k2-cordis/importer');
    const zipPath = writeZip({
      'project.csv': [PROJECT_HEADER, ROW_PLAIN, ROW_UNWRAPPED_OBJECTIVE, ''].join('\n'),
      'organization.csv': [
        ORG_HEADER,
        orgRow('101069359', '900000001'),
        orgRow('101069905', '900000002'),
        orgRow('555555555', '900000003'),
        '',
      ].join('\n'),
    });

    const failed = await runCordisImport({ dataset: 'HORIZON', localZipPath: zipPath });
    expect(failed.success).toBe(false);
    expect(failed.errorCode).toBe('SKIP_LIMIT_EXCEEDED');
    expect(writes.runs.get(failed.runId)?.error).toContain('organization.csv: 1/3 skipped (unknown project 555555555)');
    expect(writes.participations).toBe(0);

    // With a budget that allows it, the rest lands and the skip is still reported.
    writes.alerts.length = 0;
    const ok = await runCordisImport({
      dataset: 'HORIZON',
      localZipPath: zipPath,
      maxSkippedRatio: 0.5,
    });
    expect(ok.success).toBe(true);
    expect(ok.rowCounts).toMatchObject({ projects: 2, participations: 2 });
    expect(ok.skippedRecords?.find((s) => s.file === 'organization.csv')?.skipped).toBe(1);
    expect(writes.runs.get(ok.runId)).toMatchObject({
      status: 'SUCCESS',
      rowCounts: { skipped: { 'project.csv': 0, 'organization.csv': 1 } },
    });
    expect(writes.alerts).toHaveLength(1);
    expect(writes.alerts[0]).toMatchObject({ level: 'warn', source: 'k2_cordis_import' });
  });
});

// ─── Admin console action: the importer's failure text stays on the server ─

/**
 * İNCELEME-100 Y-1 (TASK-MUOBNYACFPLPF). The importer caught a failure, turned
 * it into its message, and returned it; `handleRunCordisImportAction` passed
 * that field straight to the browser. The action-leak guard reads one file at
 * a time, so a message made in `src/lib` and returned from an action looked
 * clean to it. These run the real importer under the real action.
 */
describe('handleRunCordisImportAction — failure text', () => {
  beforeEach(() => {
    writes.projects = 0;
    writes.participations = 0;
    writes.runs.clear();
    writes.alerts.length = 0;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('a download error returns IMPORT_FAILED; the message stays on the run row', async () => {
    const secret = 'connect ECONNREFUSED 10.0.0.5:443 at /srv/secret/cordis.zip';
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error(secret))));
    const { handleRunCordisImportAction } = await import('../src/app/[locale]/admin/cordis/actions');

    const res = await handleRunCordisImportAction('HORIZON');

    expect(res).toStrictEqual({ success: false, errorCode: 'IMPORT_FAILED' });
    expect(JSON.stringify(res)).not.toMatch(/ECONNREFUSED|10\.0\.0\.5|\/srv/);
    const [run] = [...writes.runs.values()];
    expect(run).toMatchObject({ status: 'FAILED', error: secret });
  });

  test('a dump over the skip limit returns SKIP_LIMIT_EXCEEDED, without the CSV lines', async () => {
    const zip = fs.readFileSync(
      writeZip({
        'project.csv': [PROJECT_HEADER, ROW_PLAIN, '"999";"broken";"row"', ''].join('\n'),
        'organization.csv': [ORG_HEADER, orgRow('101069359', '900000001'), ''].join('\n'),
      })
    );
    vi.stubGlobal('fetch', vi.fn(async () => new Response(zip)));
    const { handleRunCordisImportAction } = await import('../src/app/[locale]/admin/cordis/actions');

    const res = await handleRunCordisImportAction('HORIZON');

    expect(res).toStrictEqual({ success: false, errorCode: 'SKIP_LIMIT_EXCEEDED' });
    const [run] = [...writes.runs.values()];
    expect(run?.error).toContain('line 4: expected 22 fields, got 3');
  });

  test('the status read does not return the last run\'s stored error text', async () => {
    const { prisma } = await import('../src/lib/db');
    vi.mocked(prisma.cordisImportRun.findFirst).mockResolvedValueOnce({
      runId: 'run-9',
      dataset: 'HORIZON',
      startedAt: new Date(),
      finishedAt: new Date(),
      status: 'FAILED',
      fileHash: null,
      rowCounts: null,
      error: 'relation "CordisProject" does not exist',
    } as never);
    const { handleGetK2Status } = await import('../src/app/[locale]/admin/cordis/actions');

    const res = await handleGetK2Status();

    expect(res.lastRun).toMatchObject({ runId: 'run-9', status: 'FAILED' });
    expect(JSON.stringify(res)).not.toContain('CordisProject');
  });
});

// ─── Importer: the first layer, and where the text goes instead ───────────

/**
 * İNCELEME-105 Ö-1 (TASK-MUOD30XARRIII). The importer's own code choice is the
 * first layer: whatever it caught, the result carries a listed code and no
 * text. The fix also promised the text is not lost: it goes to the log line,
 * the run row and the alert. Only the run row was checked before.
 */
describe('runCordisImport — failure code and where the text goes', () => {
  const SECRET = 'connect ECONNREFUSED 10.0.0.5:443 at /srv/secret/cordis.zip';
  const RESULT_KEYS = ['durationMs', 'errorCode', 'rowCounts', 'runId', 'skippedRecords', 'success'];

  beforeEach(() => {
    writes.projects = 0;
    writes.participations = 0;
    writes.runs.clear();
    writes.alerts.length = 0;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test.each([
    ['an Error', () => new Error(SECRET)],
    ['an Error with a code field', () => Object.assign(new Error(SECRET), { code: `P2021 ${SECRET}` })],
    ['an Error named like the skip-limit one', () => Object.assign(new Error(SECRET), { name: 'CordisSkipLimitError' })],
    ['a thrown string', () => SECRET],
  ])('%s from the download gives IMPORT_FAILED and no text', async (_label, thrown) => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(thrown())));
    const { runCordisImport } = await import('../src/lib/k2-cordis/importer');
    const { CORDIS_IMPORT_FAILURE_CODES } = await import('../src/lib/k2-cordis/failure-codes');

    const res = await runCordisImport({ dataset: 'HORIZON' });

    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('IMPORT_FAILED');
    expect(CORDIS_IMPORT_FAILURE_CODES).toContain(res.errorCode);
    expect(Object.keys(res).every((k) => RESULT_KEYS.includes(k))).toBe(true);
    expect(JSON.stringify(res)).not.toMatch(/ECONNREFUSED|10\.0\.0\.5|\/srv\/secret|P2021/);
  });

  test('a download error: the text is in the log line, on the run row and in the alert', async () => {
    const thrown = new Error(SECRET);
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(thrown)));
    const { logger } = await import('../src/lib/logger');
    const logError = vi.spyOn(logger, 'error');
    const { runCordisImport } = await import('../src/lib/k2-cordis/importer');

    const res = await runCordisImport({ dataset: 'HORIZON' });

    expect(logError).toHaveBeenCalledWith(
      '[k2-cordis] import failed',
      thrown,
      expect.objectContaining({ runId: res.runId, dataset: 'HORIZON', errorCode: 'IMPORT_FAILED' })
    );
    expect(writes.runs.get(res.runId)).toMatchObject({ status: 'FAILED', error: SECRET });
    expect(writes.alerts).toHaveLength(1);
    expect(writes.alerts[0]).toMatchObject({ level: 'error', source: 'k2_cordis_import' });
    expect((writes.alerts[0]!.meta as { error?: string }).error).toBe(SECRET);
  });

  test('a dump over the skip limit: the CSV lines are in the log error, the run row and the alert', async () => {
    const { logger } = await import('../src/lib/logger');
    const logError = vi.spyOn(logger, 'error');
    const { runCordisImport } = await import('../src/lib/k2-cordis/importer');
    const zipPath = writeZip({
      'project.csv': [PROJECT_HEADER, ROW_PLAIN, '"999";"broken";"row"', ''].join('\n'),
      'organization.csv': [ORG_HEADER, orgRow('101069359', '900000001'), ''].join('\n'),
    });

    const res = await runCordisImport({ dataset: 'HORIZON', localZipPath: zipPath });

    expect(res.errorCode).toBe('SKIP_LIMIT_EXCEEDED');
    const call = logError.mock.calls.find(([msg]) => msg === '[k2-cordis] import failed');
    expect(call?.[2]).toMatchObject({ runId: res.runId, errorCode: 'SKIP_LIMIT_EXCEEDED' });
    expect(String((call?.[1] as Error | undefined)?.message)).toContain('line 4: expected 22 fields, got 3');
    expect(writes.runs.get(res.runId)?.error).toContain('line 4: expected 22 fields, got 3');
    expect((writes.alerts[0]!.meta as { error?: string }).error).toContain('line 4: expected 22 fields, got 3');
  });
});
