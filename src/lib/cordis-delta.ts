/**
 * Incremental CORDIS ingestion — the projects an upstream delta feed reports as
 * new or changed since a cut-off date.
 *
 * Why this file was rewritten
 * ───────────────────────────
 * 1. It called `prisma.organization.upsert`. No `Organization` model exists in
 *    prisma/schema.prisma, so the delegate is `undefined` and every call threw
 *    a TypeError that the surrounding `catch` swallowed. Nothing was ever
 *    written. See the header of ./cordis-sync.ts for the full account; writes
 *    now go through `persistCordisRecord` there, against the real K2 tables.
 *
 * 2. When the upstream call failed it substituted two invented Horizon
 *    projects ("QUANTUM-SENSING-EV", "BIOMED-CHIP-PILOT") with `Date.now()`
 *    RCNs, and reported them as ingested. Combined with (1) that produced a
 *    screen full of projects that existed nowhere. A feed that cannot be
 *    reached now yields zero items and a `SystemAlert`, which is the honest
 *    answer and the one an operator can act on.
 *
 * 3. The endpoint it hard-coded
 *    (ec.europa.eu/info/funding-tenders/opportunities/data/cordis/projects_delta.json)
 *    redirects to commission.europa.eu and answers HTTP 404 — measured
 *    2026-09-07. There is no default any more: the caller passes the endpoint,
 *    and with none configured the run reports that rather than pretending.
 *    The dataset CORDIS actually publishes is the full CSV bundle, already
 *    handled by src/lib/k2-cordis/importer.ts.
 *
 * CLAUDE.md #6 governs the whole file: a field this importer does not
 * recognise, or an item it cannot key, raises a `SystemAlert` and is skipped —
 * it never breaks the run.
 */

import {
  persistCordisRecord,
  buildCordisRagBody,
  type CordisProjectRecord,
} from './cordis-sync';
import { prisma } from './db';
import { ingestDocument } from './rag';
import { errorMessage } from '@/lib/errors';
import { recordAlert } from '@/lib/observability/system-alert';

/** Stable `SystemAlert.source` for everything this module reports. */
export const CORDIS_DELTA_ALERT_SOURCE = 'cordis-delta';

/** Seconds before an unreachable feed is abandoned. */
const FETCH_TIMEOUT_MS = 10_000;

/**
 * One project as a delta feed reports it.
 *
 * `projectId` is the CORDIS project id and is required — it is the primary key
 * the row is written under. `coordinatorPic` is the coordinator's PIC; without
 * it the project is still stored, but no organisation or participation row can
 * be keyed (see `persistCordisRecord`).
 *
 * Every other field is `| null` rather than optional: `readDeltaItem` sets all
 * of them, so a consumer reading `item.acronym` gets `string | null` and never
 * has to distinguish "absent" from "empty upstream".
 */
export interface LiveCordisDeltaItem {
  projectId: string;
  rcn: string | null;
  acronym: string | null;
  title: string;
  ecContributionEUR: number | null;
  updatedAt: string | null;
  coordinatorPic: string | null;
  coordinatorName: string | null;
  coordinatorCountry: string | null;
  topicCode: string | null;
  objectiveText: string | null;
}

export interface CordisDeltaSyncResult {
  success: boolean;
  deltaCount: number;
  /** Items the feed returned that could not be ingested; each has a `SystemAlert`. */
  skippedCount: number;
  sinceDays: number;
  totalNewGrantEUR: number;
  ingestedProjects: LiveCordisDeltaItem[];
  syncedAt: string;
}

export interface FetchLiveCordisDeltaOptions {
  /**
   * Absolute URL of the delta feed. There is deliberately no default: the URL
   * this file used to hard-code answers 404, and guessing one produces a run
   * that looks successful and ingests nothing.
   */
  endpoint?: string;
}

/** The fields `readDeltaItem` maps. Anything else on a feed item is drift. */
const KNOWN_FEED_FIELDS: ReadonlySet<string> = new Set([
  'projectId',
  'rcn',
  'acronym',
  'title',
  'ecContributionEUR',
  'updatedAt',
  'coordinatorPic',
  'coordinatorName',
  'coordinatorCountry',
  'topicCode',
  'objectiveText',
]);

/**
 * Narrows one element of an untyped feed payload, or explains why it cannot.
 *
 * Keys this importer does not map are returned in `extra` rather than dropped.
 * A delta feed is precisely where upstream schema drift shows up first, and
 * CLAUDE.md #6 requires it to be reported and preserved, not quietly discarded
 * on the way into a typed object.
 */
function readDeltaItem(
  raw: unknown
): { item: LiveCordisDeltaItem; extra: Record<string, unknown> } | { reason: string } {
  if (typeof raw !== 'object' || raw === null) {
    return { reason: 'item is not an object' };
  }
  const source = raw as Record<string, unknown>;

  const projectId = typeof source.projectId === 'string' ? source.projectId.trim() : '';
  const title = typeof source.title === 'string' ? source.title.trim() : '';

  if (!projectId) return { reason: 'item has no projectId' };
  if (!title) return { reason: 'item has no title' };

  const str = (key: string): string | null => {
    const value = source[key];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  };
  const num = (key: string): number | null => {
    const value = source[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  };

  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!KNOWN_FEED_FIELDS.has(key) && value !== undefined && value !== null && value !== '') {
      extra[key] = value;
    }
  }

  return {
    extra,
    item: {
      projectId,
      title,
      rcn: str('rcn'),
      acronym: str('acronym'),
      ecContributionEUR: num('ecContributionEUR'),
      updatedAt: str('updatedAt'),
      coordinatorPic: str('coordinatorPic'),
      coordinatorName: str('coordinatorName'),
      coordinatorCountry: str('coordinatorCountry'),
      topicCode: str('topicCode'),
      objectiveText: str('objectiveText'),
    },
  };
}

/**
 * Calls the feed.
 *
 * `reached` is false whenever the feed did not deliver a usable payload. It is
 * kept separate from `items.length` because "the feed answered with an empty
 * delta" and "the feed is broken" are different facts, and only the second one
 * makes the run a failure.
 */
async function fetchDeltaPayload(
  endpoint: string,
  since: Date
): Promise<{ items: unknown[]; reached: boolean }> {
  const url = new URL(endpoint);
  url.searchParams.set('since', since.toISOString().slice(0, 10));

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) {
      await recordAlert({
        level: 'warn',
        source: CORDIS_DELTA_ALERT_SOURCE,
        message: `CORDIS delta feed returned HTTP ${res.status}`,
        meta: { host: url.host, path: url.pathname, status: res.status },
      });
      return { items: [], reached: false };
    }

    const data: unknown = await res.json();
    if (!Array.isArray(data)) {
      await recordAlert({
        level: 'warn',
        source: CORDIS_DELTA_ALERT_SOURCE,
        message: 'CORDIS delta feed did not return a JSON array',
        meta: { host: url.host, path: url.pathname, receivedType: typeof data },
      });
      return { items: [], reached: false };
    }

    return { items: data, reached: true };
  } catch (e) {
    await recordAlert({
      level: 'warn',
      source: CORDIS_DELTA_ALERT_SOURCE,
      message: `CORDIS delta feed unreachable: ${errorMessage(e)}`,
      meta: { host: url.host, path: url.pathname },
    });
    return { items: [], reached: false };
  }
}

/**
 * Ingests the projects a delta feed reports as changed in the last `sinceDays`.
 *
 * Every write goes through `persistCordisRecord`, so a feed replayed twice
 * leaves one row per project behind. An unreachable feed, an unparseable
 * payload, or an item that cannot be keyed all end the same way: nothing is
 * written for it, a `SystemAlert` records why, and the run continues.
 */
export async function fetchLiveCordisDelta(
  sinceDays: number = 7,
  options: FetchLiveCordisDeltaOptions = {}
): Promise<CordisDeltaSyncResult> {
  const since = new Date();
  since.setDate(since.getDate() - sinceDays);

  if (!options.endpoint) {
    await recordAlert({
      level: 'warn',
      source: CORDIS_DELTA_ALERT_SOURCE,
      message: 'CORDIS delta run skipped: no delta feed endpoint configured',
      meta: { sinceDays },
    });
    return {
      success: false,
      deltaCount: 0,
      skippedCount: 0,
      sinceDays,
      totalNewGrantEUR: 0,
      ingestedProjects: [],
      syncedAt: new Date().toISOString(),
    };
  }

  const { items: payload, reached } = await fetchDeltaPayload(options.endpoint, since);

  const ingested: LiveCordisDeltaItem[] = [];
  let skippedCount = 0;
  let totalNewGrantEUR = 0;

  for (const raw of payload) {
    const parsed = readDeltaItem(raw);

    if ('reason' in parsed) {
      skippedCount++;
      await recordAlert({
        level: 'warn',
        source: CORDIS_DELTA_ALERT_SOURCE,
        message: `CORDIS delta item skipped: ${parsed.reason}`,
        meta: { sinceDays },
      });
      continue;
    }

    const { item, extra } = parsed;
    // Spreading the unmapped keys lets `persistCordisRecord` alert on them and
    // keep them in `CordisProject.rawJson`.
    const record: CordisProjectRecord = {
      ...(extra as Partial<CordisProjectRecord>),
      projectId: item.projectId,
      rcn: item.rcn,
      acronym: item.acronym,
      title: item.title,
      objectiveText: item.objectiveText,
      ecContributionEUR: item.ecContributionEUR,
      coordinatorPic: item.coordinatorPic,
      coordinatorName: item.coordinatorName,
      coordinatorCountry: item.coordinatorCountry,
      topicCode: item.topicCode,
    };

    try {
      const written = await persistCordisRecord(record);
      if (!written) {
        skippedCount++;
        continue;
      }

      // Shared public corpus, same as cordis-sync: logged at platform scope.
      await ingestDocument(
        `CORDIS Live Delta: ${item.acronym ?? item.projectId} - ${item.title}`,
        item.updatedAt
          ? `${buildCordisRagBody(record)}\nUpdated: ${item.updatedAt}`
          : buildCordisRagBody(record),
        'CORDIS_PROJECT_DELTA'
      );

      ingested.push(item);
      if (typeof item.ecContributionEUR === 'number') {
        totalNewGrantEUR += item.ecContributionEUR;
      }
    } catch (e) {
      skippedCount++;
      await recordAlert({
        level: 'error',
        source: CORDIS_DELTA_ALERT_SOURCE,
        message: `CORDIS delta item failed to ingest: ${errorMessage(e)}`,
        meta: { projectId: item.projectId },
      });
    }
  }

  return {
    success: reached && skippedCount === 0,
    deltaCount: ingested.length,
    skippedCount,
    sinceDays,
    totalNewGrantEUR,
    ingestedProjects: ingested,
    syncedAt: new Date().toISOString(),
  };
}

/** The columns `getCordisLiveStreamLogs` selects from `CordisImportRun`. */
interface CordisImportRunRow {
  runId: string;
  dataset: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  rowCounts: unknown;
}

/** One CORDIS ingestion attempt, as the audit list renders it. */
export interface CordisStreamLogEntry {
  id: string;
  event: string;
  projectsCount: number;
  status: string;
  timestamp: string;
}

/**
 * The recent CORDIS ingestion audit trail, read from `CordisImportRun`.
 *
 * This used to return two invented entries with fixed grant totals and a
 * hard-coded `COMPLETED` status. The rows are real now; an empty list means no
 * import has run yet. `totalGrantEUR` is gone from the shape rather than
 * invented — `CordisImportRun` does not record a per-run grant total, and no
 * caller reads the field.
 */
export async function getCordisLiveStreamLogs(limit: number = 20): Promise<CordisStreamLogEntry[]> {
  // Annotated because the prisma-override shim types the delegate as `any`.
  const runs: CordisImportRunRow[] = await prisma.cordisImportRun.findMany({
    take: limit,
    orderBy: { startedAt: 'desc' },
    select: {
      runId: true,
      dataset: true,
      status: true,
      startedAt: true,
      finishedAt: true,
      rowCounts: true,
    },
  });

  return runs.map((run: CordisImportRunRow): CordisStreamLogEntry => {
    const counts = run.rowCounts as { projects?: number } | null;
    return {
      id: run.runId,
      event: `CORDIS_IMPORT_${run.dataset}`,
      projectsCount: typeof counts?.projects === 'number' ? counts.projects : 0,
      status: run.status,
      timestamp: (run.finishedAt ?? run.startedAt).toISOString(),
    };
  });
}
