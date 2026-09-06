import crypto from 'crypto';
import { inngest } from '../client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { SediaAdapter } from '@/lib/adapters/sedia';
import { EurostarsAdapter } from '@/lib/adapters/eurostars';
import { TubitakAdapter } from '@/lib/adapters/tubitak';
import type { AdapterResult, BaseTopic } from '@/lib/adapters/schemas/common';
import {
  K1DailyCallsOutputSchema,
  type K1DailyCallsOutput,
  type K1SourceResult,
} from '../events';

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
 * K1 Daily Call Sync — 02:00 UTC.
 *
 * Pulls SEDIA, Eurostars and TÜBİTAK, normalizes, and upserts `Call`/`Topic`.
 * Idempotent: `Call` is keyed on `callIdentifier` and `Topic` on `identifier`,
 * so re-running the same day updates rows instead of duplicating them.
 * A source that fails is reported in `sources[]` and alerted on; the other
 * sources still land (CLAUDE.md rule 6 — never break the job on upstream drift).
 */
export const k1DailyCalls = inngest.createFunction(
  { id: 'k1-daily-calls', triggers: [{ cron: '0 2 * * *' }] },
  async ({ step }): Promise<K1DailyCallsOutput> => {
    const sedia = await step.run('fetch-sedia-topics', async () =>
      new SediaAdapter().fetchSediaTopics()
    );

    const eurostars = await step.run('fetch-eurostars-topics', async () =>
      new EurostarsAdapter().fetchEurostarsTopics()
    );

    const tubitak = await step.run('fetch-tubitak-topics', async () =>
      new TubitakAdapter().fetchTubitakTopics()
    );

    return step.run('normalize-and-upsert', async () =>
      syncK1Topics([sedia, eurostars, tubitak] as AdapterResult<BaseTopic>[])
    );
  }
);

/**
 * Normalize + persist the topics an adapter run produced.
 *
 * Split out of the Inngest step so `pnpm jobs:k1` and the unit tests can drive
 * the exact same code path. Idempotent by construction: `Call` upserts on
 * `callIdentifier`, `Topic` on `identifier`.
 */
export async function syncK1Topics(
  sources: AdapterResult<BaseTopic>[]
): Promise<K1DailyCallsOutput> {
  const allTopics: BaseTopic[] = sources.flatMap((s) => s.topics);
  const errors: Array<{ identifier: string; message: string }> = [];
  let insertedCount = 0;
  let updatedCount = 0;

  // A source that came back `error` is an operational alert, not a data error.
  for (const s of sources.filter((s) => s.status === 'error')) {
    await prisma.systemAlert
      .create({
        data: {
          level: 'error',
          source: 'k1_daily_calls',
          message: `K1 source "${s.source}" failed: ${s.reason ?? 'unknown reason'}`,
          meta: { source: s.source, reason: s.reason },
        },
      })
      .catch(() => {});
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
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to upsert topic ${t.identifier}:`, error);
      errors.push({ identifier: t.identifier, message: msg });
    }
  }

  const drift = sources.flatMap((s) => s.schemaDrift);
  if (drift.length > 0) {
    await prisma.systemAlert
      .create({
        data: {
          level: 'warn',
          source: 'k1_daily_calls',
          message: `API schema change detected in ${drift.length} place(s) across K1 sources.`,
          meta: { drift: drift.slice(0, 10) },
        },
      })
      .catch(() => {});
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
