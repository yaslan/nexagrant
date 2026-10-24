import crypto from 'crypto';
import { defineJob } from '../define';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { SediaAdapter } from '@/lib/adapters/sedia';
import { EurostarsAdapter } from '@/lib/adapters/eurostars';
import { TubitakAdapter } from '@/lib/adapters/tubitak';
import type { AdapterResult, BaseTopic } from '@/lib/adapters/schemas/common';
import { recordAlert } from '@/lib/observability/system-alert';
import { enqueueJob } from '../enqueue';
import {
  K1DailyCallsOutputSchema,
  type K1DailyCallsOutput,
  type K1SourceResult,
} from '../events';

/**
 * Event emission for the partner-search incremental run (FO-60). Only the enqueue
 * is new; k1-daily-calls behaviour is unchanged. A failure here is logged and
 * never fails K1: the nightly partner-search full scan (03:00) covers the topics too.
 * Deduped by enqueueJob's `partner-search:manual` key, so a run already queued wins.
 */
async function queuePartnerSearchIncremental(topicIdentifiers: string[]): Promise<void> {
  if (topicIdentifiers.length === 0) return;
  try {
    await enqueueJob('partner-search', { trigger: 'INCREMENTAL', topicIdentifiers });
  } catch (error) {
    logger.warn(`[k1-daily-calls] could not queue partner-search incremental run: ${String(error)}`);
  }
}

/** Map a topic to the Programme row it belongs to. */
function getProgrammeIdFromTopic(callId?: string, source?: string): string {
  if (callId?.startsWith('EUROSTARS')) return 'EUROSTARS';
  if (callId?.startsWith('TUBITAK')) return 'TUBITAK';
  if (callId?.startsWith('HORIZON') || callId?.startsWith('HE-')) return 'HE';
  if (callId?.startsWith('EUREKA')) return 'EUREKA';
  if (source?.toLowerCase().includes('eurostars')) return 'EUROSTARS';
  if (source?.toLowerCase().includes('tubitak')) return 'TUBITAK';
  return 'HE'; // default to Horizon Europe
}

/** Extract the call identifier used to group topics. */
function extractCallIdentifier(topic: BaseTopic): string {
  if (topic.callIdentifier) return topic.callIdentifier;

  if (topic.identifier) {
    // HORIZON-CL5-2026-09-D4-01 → HORIZON-CL5-2026-09
    const match = topic.identifier.match(/^([A-Z]+-[A-Z0-9]+-\d{4}-\d{2})/);
    if (match?.[1]) return match[1];
  }
  return `DEFAULT-${new Date().getFullYear()}`;
}

/** Human-readable programme name from its id. */
function getProgrammeName(programmeId: string): string {
  const names: Record<string, string> = {
    HE: 'Horizon Europe',
    EUROSTARS: 'Eurostars',
    EUREKA: 'Eureka',
    TUBITAK: 'TÜBİTAK',
    CETP: 'CET Partnership',
    DUT: 'Digital Europe',
    ERASMUS: 'Erasmus+',
    EIT: 'EIT',
  };
  return names[programmeId] ?? programmeId;
}

function countFor(sources: AdapterResult<BaseTopic>[], source: string): number {
  return sources.find((s) => s.source === source)?.topicsProcessed ?? 0;
}

function toSourceResult(result: AdapterResult<BaseTopic>): K1SourceResult {
  return {
    source: result.source,
    status: result.status,
    topicsProcessed: result.topicsProcessed,
    reason: result.reason,
    schemaDrift: result.schemaDrift,
  };
}

/**
 * Collapse repeated identifiers inside one run.
 *
 * SEDIA answers for a handful of topics twice — once from the search listing and
 * once from `data/topicDetails` — with different bodies under the same
 * `identifier`. Processing both wrote the second row over the first in `Topic`
 * (no net effect, the last one already won) and, worse, appended a fresh
 * `RawFetch` row on *every* nightly run: the change-detection hash flip-flopped
 * between the two bodies forever. Measured on 2026-09-07: two identifiers,
 * +4 `RawFetch` rows per pair of runs, growing without bound.
 *
 * Last-one-wins is deliberate — it is exactly what the un-deduplicated loop
 * already persisted, so no `Topic` content changes. Which of the two bodies is
 * the *right* one is an adapter question (src/lib/adapters/sedia.ts); this job
 * only stops the duplicate from compounding and names the ids in an alert.
 */
function dedupeByIdentifier(topics: BaseTopic[]): {
  topics: BaseTopic[];
  duplicateIdentifiers: string[];
} {
  const byIdentifier = new Map<string, BaseTopic>();
  const duplicates = new Set<string>();

  for (const t of topics) {
    if (byIdentifier.has(t.identifier)) duplicates.add(t.identifier);
    byIdentifier.set(t.identifier, t);
  }

  return {
    topics: Array.from(byIdentifier.values()),
    duplicateIdentifiers: Array.from(duplicates),
  };
}

/**
 * K1 Daily Call Sync — 02:00 UTC.
 *
 * Pulls SEDIA, Eurostars and TÜBİTAK, normalizes, and upserts `Call`/`Topic`.
 * Idempotent: `Call` is keyed on `callIdentifier` and `Topic` on `identifier`,
 * so re-running the same day updates rows instead of duplicating them.
 * A source that fails is reported in `sources[]` and alerted on; the other
 * sources still land (CLAUDE.md rule 6 — never break the job on upstream drift).
 */
export const k1DailyCallsTask = defineJob('k1-daily-calls', async (): Promise<K1DailyCallsOutput> => {
  // No step memo under graphile-worker: a retry fetches all three sources
  // again. The upsert is idempotent, so that costs time, not data (ADR-0008 §6.2).
  const sedia = await new SediaAdapter().fetchSediaTopics();
  const eurostars = await new EurostarsAdapter().fetchEurostarsTopics();
  const tubitak = await new TubitakAdapter().fetchTubitakTopics();
  return syncK1Topics([sedia, eurostars, tubitak] as AdapterResult<BaseTopic>[]);
});

/**
 * Normalize + persist the topics an adapter run produced.
 *
 * Split out of the job wrapper so `pnpm jobs:k1` and the unit tests can drive
 * the exact same code path. Idempotent by construction: `Call` upserts on
 * `callIdentifier`, `Topic` on `identifier`.
 */
export async function syncK1Topics(
  sources: AdapterResult<BaseTopic>[]
): Promise<K1DailyCallsOutput> {
  const { topics: allTopics, duplicateIdentifiers } = dedupeByIdentifier(
    sources.flatMap((s) => s.topics)
  );
  const errors: Array<{ identifier: string; message: string }> = [];

  // A feed that answered twice for one identifier is an upstream signal, not a
  // data error: the run still lands, an operator gets told which ids collided.
  if (duplicateIdentifiers.length > 0) {
    // Was a direct `prisma.systemAlert.create`, which skipped the single
    // writer altogether: no dedup of any kind, no meta sanitising. Both the
    // count in the message and the id list in `meta` change every run, so this
    // alert could never have folded even on the default identity — measured at
    // 6 open `k1_daily_calls` warn rows. The defect is one: a feed answered
    // twice for an identifier. This run's ids stay on the row as detail.
    await recordAlert({
      level: 'warn',
      source: 'k1_daily_calls',
      message:
        `K1 sources returned ${duplicateIdentifiers.length} identifier(s) more than once ` +
        'in a single run; only the last record for each was kept.',
      meta: { duplicateIdentifiers: duplicateIdentifiers.slice(0, 20) },
      dedupeKey: 'k1:duplicate-identifiers',
    });
  }
  let insertedCount = 0;
  let updatedCount = 0;
  // FO-60: the topics this run created, handed to the partner-search incremental run.
  const insertedIdentifiers: string[] = [];

  // A source that came back `error` is an operational alert, not a data error.
  for (const s of sources.filter((s) => s.status === 'error')) {
    // Which of the three feeds failed is the problem and stays in the key —
    // a broken SEDIA is not a broken TÜBİTAK. The failure text is not: it
    // changes between attempts against the same dead feed.
    await recordAlert({
      level: 'error',
      source: 'k1_daily_calls',
      message: `K1 source "${s.source}" failed: ${s.reason ?? 'unknown reason'}`,
      meta: { source: s.source, reason: s.reason },
      dedupeKey: `k1:source-failed:${s.source}`,
    });
  }

  for (const t of allTopics) {
    try {
      const callId = extractCallIdentifier(t);
      const programmeId = getProgrammeIdFromTopic(callId);
      const source =
        programmeId === 'EUROSTARS'
          ? 'eurostars'
          : programmeId === 'TUBITAK'
            ? 'tubitak'
            : 'sedia';

      const rawHash = crypto.createHash('sha256').update(JSON.stringify(t)).digest('hex');

      // Keep the raw payload only when the content actually changed —
      // re-storing an identical payload every night would grow RawFetch
      // by ~1000 rows/day with no audit value.
      const lastFetch = await prisma.rawFetch.findFirst({
        where: { source, key: t.identifier },
        orderBy: { fetchedAt: 'desc' },
        select: { hash: true },
      });

      if (!lastFetch || lastFetch.hash !== rawHash) {
        await prisma.rawFetch
          .create({ data: { source, key: t.identifier, hash: rawHash, payload: t } })
          .catch(() => {});
      }

      await prisma.programme.upsert({
        where: { id: programmeId },
        update: {},
        create: {
          id: programmeId,
          name: getProgrammeName(programmeId),
          sourceKey: programmeId.toLowerCase(),
        },
      });

      const openDate = t.plannedOpeningDate ? new Date(t.plannedOpeningDate) : null;

      const call = await prisma.call.upsert({
        where: { callIdentifier: callId },
        update: {
          title: t.callTitle || t.title,
          ...(openDate ? { openDate } : {}),
          ...(t.sourceUrl ? { url: t.sourceUrl } : {}),
        },
        create: {
          callIdentifier: callId,
          title: t.callTitle || `Call ${callId}`,
          programmeId,
          openDate,
          url: t.sourceUrl || undefined,
        },
      });

      // `ageInDays` is intentionally NOT stored: it is derived from
      // `Call.openDate` at read time so it can never go stale.
      const topicData = {
        title: t.title,
        status: t.status,
        typeOfAction: t.typeOfAction || undefined,
        isLumpSum: t.isLumpSum,
        isTwoStage: t.isTwoStage,
        budgetPerProjectCents:
          t.budgetPerProjectCents !== undefined ? BigInt(t.budgetPerProjectCents) : null,
        deadlines: t.deadlines,
        nextDeadlineAt: t.nextDeadlineAt ? new Date(t.nextDeadlineAt) : null,
        eligibility: t.eligibility,
        destination: t.destination || undefined,
        keywords: t.keywords,
        description: t.description || undefined,
        sourceUrl: t.sourceUrl || undefined,
        rawHash,
        callId: call.id,
      };

      const existing = await prisma.topic.findUnique({
        where: { identifier: t.identifier },
        select: { id: true },
      });

      if (existing) {
        await prisma.topic.update({ where: { id: existing.id }, data: topicData });
        updatedCount++;
      } else {
        await prisma.topic.create({ data: { identifier: t.identifier, ...topicData } });
        insertedCount++;
        insertedIdentifiers.push(t.identifier);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to upsert topic ${t.identifier}:`, error);
      errors.push({ identifier: t.identifier, message: msg });
    }
  }

  await queuePartnerSearchIncremental(insertedIdentifiers);

  const drift = sources.flatMap((s) => s.schemaDrift);
  if (drift.length > 0) {
    // The count in the message and the sample in `meta` both move as the
    // upstream payload evolves; that K1's contract has drifted is one standing
    // item until an operator maps the new fields and resolves it.
    await recordAlert({
      level: 'warn',
      source: 'k1_daily_calls',
      message: `API schema change detected in ${drift.length} place(s) across K1 sources.`,
      meta: { drift: drift.slice(0, 10) },
      dedupeKey: 'k1:schema-drift',
    });
  }

  const output: K1DailyCallsOutput = {
    success: errors.length === 0 && sources.every((s) => s.status === 'ok'),
    totalProcessed: allTopics.length,
    inserted: insertedCount,
    updated: updatedCount,
    sediaCount: countFor(sources, 'sedia'),
    eurostarsCount: countFor(sources, 'eurostars'),
    tubitakCount: countFor(sources, 'tubitak'),
    sources: sources.map(toSourceResult),
    schemaChangeDetected: drift.length > 0,
  };

  if (errors.length > 0) {
    output.errors = errors;
    logger.warn(`[k1-daily-calls] ${errors.length} topics failed to process`);
  }

  logger.info(
    `[k1-daily-calls] Completed: ${insertedCount} inserted, ${updatedCount} updated, ${errors.length} errors`
  );

  return K1DailyCallsOutputSchema.parse(output);
}
