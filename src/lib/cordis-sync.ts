/**
 * CORDIS ingestion into the real K2 tables, plus the RAG mirror of what landed.
 *
 * Why this file was rewritten
 * ──────────────────────────
 * Both entry points used to call `prisma.organization.upsert`. There is no
 * `Organization` model in prisma/schema.prisma, so `prisma.organization` is
 * `undefined` at runtime and every call threw `TypeError: Cannot read
 * properties of undefined (reading 'upsert')`. The surrounding `catch`
 * swallowed the throw *and still incremented the counter*, so the admin screen
 * reported "3 projects synced" while zero rows had been written. The
 * hand-written src/types/prisma-override.d.ts types every delegate as `any`, so
 * `pnpm typecheck` could not see the call at all.
 *
 * The old fallback dataset (three invented Horizon projects with invented RCNs)
 * and the hard-coded OLAP figures are gone with it: writing invented rows into
 * the tables M8 partner search reads would have been worse than the crash, and
 * CLAUDE.md #7 forbids showing a figure that is not backed by a record.
 *
 * Rules this file is bound by (CLAUDE.md):
 *   #6  Schema/field drift raises a `SystemAlert` and does NOT break the job.
 *   #7  Every figure shown to a user comes from a row, never from a literal.
 *   #9  CORDIS money is whole EUR in a `BigInt` column, matching
 *       `parseBigIntEur` in src/lib/k2-cordis/cordisSchema.ts.
 */

import { prisma } from './db';
import { ingestDocument } from './rag';
import { errorMessage } from '@/lib/errors';
import { recordAlert } from '@/lib/observability/system-alert';
import type { Prisma } from '@prisma/client';

/** Stable `SystemAlert.source` for everything this module reports. */
export const CORDIS_SYNC_ALERT_SOURCE = 'cordis-sync';

/** How many already-imported projects a no-argument sync mirrors into RAG. */
const DEFAULT_DATABASE_BATCH = 200;

/**
 * One CORDIS project as this module accepts it.
 *
 * `projectId` is `CordisProject.id` and `coordinatorPic` is
 * `CordisOrganization.organisationId` (the PIC). Both are real CORDIS
 * identifiers: without them a record cannot be written to the real tables
 * without inventing a primary key, so a record missing `projectId` is skipped
 * with an alert rather than persisted under a made-up id.
 */
export interface CordisProjectRecord {
  projectId: string;
  framework?: string | null;
  rcn?: string | null;
  acronym?: string | null;
  title: string;
  objectiveText?: string | null;
  ecContributionEUR?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  coordinatorPic?: string | null;
  coordinatorName?: string | null;
  coordinatorCountry?: string | null;
  topicCode?: string | null;
}

export interface CordisSyncResult {
  success: boolean;
  /** `input` when records were supplied, `database` when already-imported rows were mirrored. */
  source: 'input' | 'database';
  syncedProjectsCount: number;
  /** Records that could not be processed. Each one has a `SystemAlert` behind it. */
  skippedCount: number;
  totalEcContributionEUR: number;
  syncedAt: string;
}

export interface CordisCountryBreakdown {
  country: string;
  name: string;
  projectCount: number;
  totalGrantEUR: number;
}

export interface CordisMetrics {
  totalProjectsCount: number;
  totalEcContributionEUR: number;
  topCountriesBreakdown: CordisCountryBreakdown[];
  averageGrantPerProjectEUR: number;
  /** ISO timestamp of the newest real ingestion, or `''` when nothing is imported yet. */
  lastSyncTimestamp: string;
}

/**
 * The fields this module understands. Anything else on an incoming record is
 * upstream schema drift: it is preserved in `CordisProject.rawJson` (the same
 * thing mapProjectRow does for unknown CSV columns) and reported once per
 * record, never dropped silently and never a reason to fail the run.
 */
const KNOWN_RECORD_FIELDS: ReadonlySet<string> = new Set([
  'projectId',
  'framework',
  'rcn',
  'acronym',
  'title',
  'objectiveText',
  'ecContributionEUR',
  'startDate',
  'endDate',
  'coordinatorPic',
  'coordinatorName',
  'coordinatorCountry',
  'topicCode',
]);

function trimmed(value?: string | null): string | undefined {
  const s = typeof value === 'string' ? value.trim() : '';
  return s.length > 0 ? s : undefined;
}

/** `null` for anything that is not a finite, parseable calendar date. */
function parseDate(value?: string | null): Date | null {
  const s = trimmed(value);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Whole EUR as a BigInt, matching `parseBigIntEur` in cordisSchema.ts. */
function toEurBigInt(value?: number | null): bigint | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return BigInt(Math.round(value));
}

/** Unknown keys on a record, so drift can be preserved and reported. */
function unknownFieldsOf(record: CordisProjectRecord): Record<string, unknown> {
  const drift: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record as unknown as Record<string, unknown>)) {
    if (!KNOWN_RECORD_FIELDS.has(key) && value !== undefined && value !== null && value !== '') {
      drift[key] = value;
    }
  }
  return drift;
}

/**
 * Writes one record into the real CORDIS tables.
 *
 * Idempotent by construction: every write is an `upsert` on the table's own
 * natural key (`CordisProject.id`, `CordisOrganization.organisationId`,
 * `CordisParticipation(projectId, organisationId)`,
 * `CordisProjectTopic(projectId, topicCode)`), so running the same record twice
 * leaves the same single row behind.
 *
 * Returns `false` when the record could not be written; the caller counts it as
 * skipped. Every `false` has a `SystemAlert` behind it.
 */
export async function persistCordisRecord(record: CordisProjectRecord): Promise<boolean> {
  const projectId = trimmed(record.projectId);
  const title = trimmed(record.title);

  if (!projectId || !title) {
    await recordAlert({
      level: 'warn',
      source: CORDIS_SYNC_ALERT_SOURCE,
      message: 'CORDIS record skipped: missing project id or title',
      meta: { projectId: projectId ?? null, hasTitle: Boolean(title) },
    });
    return false;
  }

  const drift = unknownFieldsOf(record);
  if (Object.keys(drift).length > 0) {
    // CLAUDE.md #6 — report the drift, keep the payload, do not fail the run.
    await recordAlert({
      level: 'warn',
      source: CORDIS_SYNC_ALERT_SOURCE,
      message: 'CORDIS record carried fields this importer does not map',
      meta: { projectId, unknownFields: Object.keys(drift) },
    });
  }

  const ecContribution = toEurBigInt(record.ecContributionEUR);
  const projectCore = {
    rcn: trimmed(record.rcn) ?? null,
    acronym: trimmed(record.acronym) ?? null,
    title,
    objective: trimmed(record.objectiveText) ?? null,
    startDate: parseDate(record.startDate),
    endDate: parseDate(record.endDate),
    ecMaxContribution: ecContribution,
    rawJson: (Object.keys(drift).length > 0 ? drift : {}) as unknown as Prisma.InputJsonObject,
  };

  await prisma.cordisProject.upsert({
    where: { id: projectId },
    create: {
      id: projectId,
      framework: trimmed(record.framework) ?? 'HORIZON',
      ...projectCore,
    },
    update: projectCore,
  });

  const topicCode = trimmed(record.topicCode);
  if (topicCode) {
    await prisma.cordisProjectTopic.upsert({
      where: { projectId_topicCode: { projectId, topicCode } },
      create: { projectId, topicCode },
      update: {},
    });
  }

  const organisationId = trimmed(record.coordinatorPic);
  const coordinatorName = trimmed(record.coordinatorName);

  if (organisationId && coordinatorName) {
    const country = trimmed(record.coordinatorCountry) ?? null;
    await prisma.cordisOrganization.upsert({
      where: { organisationId },
      create: {
        organisationId,
        name: coordinatorName,
        nameNormalized: coordinatorName.toLocaleUpperCase('en-US'),
        country,
        isTurkish: country === 'TR',
      },
      update: {
        name: coordinatorName,
        nameNormalized: coordinatorName.toLocaleUpperCase('en-US'),
        country,
        isTurkish: country === 'TR',
      },
    });

    await prisma.cordisParticipation.upsert({
      where: { projectId_organisationId: { projectId, organisationId } },
      create: {
        projectId,
        organisationId,
        role: 'coordinator',
        ecContribution,
      },
      update: { role: 'coordinator', ecContribution },
    });
  } else if (coordinatorName) {
    // A coordinator without a PIC cannot be keyed; inventing one would poison
    // the table M8 partner search reads. Keep the project, report the gap.
    await recordAlert({
      level: 'warn',
      source: CORDIS_SYNC_ALERT_SOURCE,
      message: 'CORDIS coordinator has no organisation id (PIC); participation not written',
      meta: { projectId },
    });
  }

  return true;
}

/** The RAG document body for one project. Kept identical in both entry points. */
export function buildCordisRagBody(record: CordisProjectRecord): string {
  return [
    `CORDIS project id: ${record.projectId}`,
    record.rcn ? `RCN: ${record.rcn}` : null,
    record.topicCode ? `Topic: ${record.topicCode}` : null,
    record.coordinatorName
      ? `Coordinator: ${record.coordinatorName}${record.coordinatorCountry ? ` (${record.coordinatorCountry})` : ''}`
      : null,
    typeof record.ecContributionEUR === 'number'
      ? `EC contribution: EUR ${record.ecContributionEUR.toLocaleString('en-US')}`
      : null,
    record.objectiveText ? `Objective: ${record.objectiveText}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

/**
 * The columns `loadRecordsFromDatabase` selects.
 *
 * src/types/prisma-override.d.ts types every Prisma delegate as `any`, so
 * `findMany` infers nothing and the row shape has to be stated here. That is
 * also the reason this whole task exists: an `any` delegate is why a call to a
 * table that does not exist typechecked cleanly for months.
 */
interface CordisProjectRowWithCoordinator {
  id: string;
  framework: string;
  rcn: string | null;
  acronym: string | null;
  title: string;
  objective: string | null;
  ecMaxContribution: bigint | null;
  startDate: Date | null;
  endDate: Date | null;
  topics: Array<{ topicCode: string }>;
  participations: Array<{
    organisationId: string;
    organization: { name: string; country: string | null };
  }>;
}

/** Already-imported projects, shaped as records, newest import first. */
async function loadRecordsFromDatabase(take: number): Promise<CordisProjectRecord[]> {
  const rows: CordisProjectRowWithCoordinator[] = await prisma.cordisProject.findMany({
    take,
    orderBy: { importedAt: 'desc' },
    include: {
      topics: { take: 1 },
      participations: {
        where: { role: 'coordinator' },
        take: 1,
        include: { organization: true },
      },
    },
  });

  return rows.map((row: CordisProjectRowWithCoordinator): CordisProjectRecord => {
    const coordinator = row.participations[0];
    return {
      projectId: row.id,
      framework: row.framework,
      rcn: row.rcn,
      acronym: row.acronym,
      title: row.title,
      objectiveText: row.objective,
      ecContributionEUR: row.ecMaxContribution === null ? null : Number(row.ecMaxContribution),
      startDate: row.startDate ? row.startDate.toISOString() : null,
      endDate: row.endDate ? row.endDate.toISOString() : null,
      coordinatorPic: coordinator?.organisationId ?? null,
      coordinatorName: coordinator?.organization.name ?? null,
      coordinatorCountry: coordinator?.organization.country ?? null,
      topicCode: row.topics[0]?.topicCode ?? null,
    };
  });
}

/**
 * Persists CORDIS project records and mirrors them into the RAG index.
 *
 * With `records`, each one is written to the real CORDIS tables and indexed.
 * Without them, the already-imported rows are re-indexed — there is nothing to
 * write, and no dataset is invented to stand in for one. The bulk CSV import
 * itself lives in src/lib/k2-cordis/importer.ts; this is the RAG side of it.
 */
export async function syncCordisBigData(
  records?: CordisProjectRecord[]
): Promise<CordisSyncResult> {
  const source: 'input' | 'database' = records ? 'input' : 'database';
  const dataset = records ?? (await loadRecordsFromDatabase(DEFAULT_DATABASE_BATCH));

  let syncedCount = 0;
  let skippedCount = 0;
  let totalEcContributionEUR = 0;

  for (const record of dataset) {
    try {
      // Rows read back from the database are already persisted; re-upserting
      // them would only overwrite `rawJson` with an empty object.
      if (source === 'input') {
        const written = await persistCordisRecord(record);
        if (!written) {
          skippedCount++;
          continue;
        }
      }

      // No tenant argument: the CORDIS corpus is shared public data
      // (`Document.tenantId IS NULL`). The embedding calls are still logged —
      // under PLATFORM_SCOPE_TENANT_ID; see `embedText` in src/lib/llm.ts.
      await ingestDocument(
        `CORDIS Project: ${record.acronym ?? record.projectId} - ${record.title}`,
        buildCordisRagBody(record),
        'CORDIS_PROJECT'
      );

      syncedCount++;
      if (typeof record.ecContributionEUR === 'number' && Number.isFinite(record.ecContributionEUR)) {
        totalEcContributionEUR += record.ecContributionEUR;
      }
    } catch (e) {
      // A failed record is a skipped record. Counting it as synced is what let
      // the old TypeError report "3 projects synced" against an empty table.
      skippedCount++;
      await recordAlert({
        level: 'error',
        source: CORDIS_SYNC_ALERT_SOURCE,
        message: `CORDIS record failed to sync: ${errorMessage(e)}`,
        meta: { projectId: record.projectId },
      });
    }
  }

  return {
    success: skippedCount === 0,
    source,
    syncedProjectsCount: syncedCount,
    skippedCount,
    totalEcContributionEUR,
    syncedAt: new Date().toISOString(),
  };
}

interface CountryAggregateRow {
  country: string | null;
  projectCount: bigint | number;
  totalGrantEUR: bigint | number | null;
}

/** ISO-3166 alpha-2 rendered in Turkish, falling back to the raw code. */
function countryDisplayName(code: string): string {
  try {
    return new Intl.DisplayNames(['tr'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * Aggregated CORDIS figures, computed from the imported rows.
 *
 * These numbers used to be literals (185 420 projects, EUR 14.25 bn, a fixed
 * four-country table) rendered straight onto the admin screen. CLAUDE.md #7
 * requires every displayed figure to trace to a record, so they are now
 * measured. An empty database therefore reports zeros, which is the honest
 * answer before an import has run.
 */
export async function aggregateCordisMetrics(): Promise<CordisMetrics> {
  const [totalProjectsCount, contribution, countryRows, lastRun, newestProject] =
    await Promise.all([
      prisma.cordisProject.count(),
      prisma.cordisProject.aggregate({ _sum: { ecMaxContribution: true } }),
      prisma.$queryRaw<CountryAggregateRow[]>`
        SELECT o."country" AS "country",
               COUNT(DISTINCT p."projectId") AS "projectCount",
               COALESCE(SUM(p."ecContribution"), 0) AS "totalGrantEUR"
        FROM "CordisParticipation" p
        JOIN "CordisOrganization" o ON o."organisationId" = p."organisationId"
        WHERE o."country" IS NOT NULL
        GROUP BY o."country"
        ORDER BY COUNT(DISTINCT p."projectId") DESC
        LIMIT 10
      `,
      prisma.cordisImportRun.findFirst({
        where: { finishedAt: { not: null } },
        orderBy: { finishedAt: 'desc' },
        select: { finishedAt: true },
      }),
      prisma.cordisProject.findFirst({
        orderBy: { importedAt: 'desc' },
        select: { importedAt: true },
      }),
    ]);

  const totalEcContributionEUR = Number(contribution._sum.ecMaxContribution ?? 0);
  const lastSync = lastRun?.finishedAt ?? newestProject?.importedAt ?? null;

  return {
    totalProjectsCount,
    totalEcContributionEUR,
    topCountriesBreakdown: (countryRows as CountryAggregateRow[])
      .filter((row: CountryAggregateRow): row is CountryAggregateRow & { country: string } =>
        Boolean(row.country)
      )
      .map((row: CountryAggregateRow & { country: string }): CordisCountryBreakdown => ({
        country: row.country,
        name: countryDisplayName(row.country),
        projectCount: Number(row.projectCount),
        totalGrantEUR: Number(row.totalGrantEUR ?? 0),
      })),
    averageGrantPerProjectEUR:
      totalProjectsCount > 0 ? Math.round(totalEcContributionEUR / totalProjectsCount) : 0,
    lastSyncTimestamp: lastSync ? lastSync.toISOString() : '',
  };
}
