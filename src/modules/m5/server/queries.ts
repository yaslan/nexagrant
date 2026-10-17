import { withTenant, type TenantTx } from '@/lib/db';

import {
  averageG0ToG2Days,
  averageLensScore,
  hitRate,
  personDaysPerProposal,
  thresholdRate,
  type MetricValue,
} from './metrics';

export type { MetricValue } from './metrics';

export interface KpiMetrics {
  /** A count. Zero is a real answer here: "no opportunities in this range" is measured. */
  totalOffers: number;
  /** A count. Zero is a real answer here. */
  activeModules: number;
  /** 0-100. Unmeasured until an opportunity clears G0 scoring. */
  successRate: MetricValue;
  /** Mean of the three lens criteria. Unmeasured until a reader completes one. */
  averageScore: MetricValue;
  /** Person-days per proposal. Unmeasured until a proposal exists. */
  personDays: MetricValue;
  /** Unmeasured until one opportunity has both a G0 and a G2 decision. */
  g0ToG2Days: MetricValue;
  /** 0-100. Unmeasured until a proposal is submitted. */
  thresholdRate: MetricValue;
  /**
   * Tenant-wide and range-independent. Separates "new workspace, nothing to show yet"
   * from "this date range happens to be quiet" — two different things to say.
   */
  hasAnyOpportunity: boolean;
}

export async function getKpiMetrics(
  tenantId: string,
  from: Date,
  to: Date
): Promise<KpiMetrics> {
  return withTenant(tenantId, (tx) => getKpiMetricsIn(tx, tenantId, from, to));
}

/** The KPI cards inside a transaction the caller has already bound to `tenantId`. */
export async function getKpiMetricsIn(
  tx: TenantTx,
  tenantId: string,
  from: Date,
  to: Date
): Promise<KpiMetrics> {
  const [
    totalOffers,
    opportunitiesEver,
    submittedProposals,
    g0ScoredOpportunities,
    totalProposals,
    evaluations,
    efforts,
    activeModules,
    g0ToG2Times,
    aboveThresholdProposals,
    submittedProposalsInRange,
  ] = await Promise.all([
    // 1. Total open offers/opportunities in date range
    tx.opportunity.count({
      where: {
        tenantId,
        // Archived opportunities are off the board, so they are off the KPI too. Without
        // `deletedAt: null` every count and every ratio below keeps counting a card the
        // user can no longer see.
        deletedAt: null,
        createdAt: { gte: from, lte: to },
      },
    }),

    // 1b. Range-independent: is this workspace new, or just quiet in this range?
    // The two deserve different copy, and only a tenant-wide count can tell them apart.
    tx.opportunity.count({ where: { tenantId, deletedAt: null } }),

    // 2. Hit rate numerator: proposals actually submitted
    tx.proposal.count({
      where: {
        tenantId,
        submittedAt: { not: null },
        opportunity: {
          deletedAt: null,
          createdAt: { gte: from, lte: to },
        },
      },
    }),

    // 3. Hit rate denominator: opportunities that cleared G0 scoring
    tx.opportunity.count({
      where: {
        tenantId,
        deletedAt: null,
        g0Score: { not: null },
        createdAt: { gte: from, lte: to },
      },
    }),

    // 4. Total proposals (used for person-days-per-proposal below)
    tx.proposal.count({
      where: {
        tenantId,
        opportunity: {
          deletedAt: null,
          createdAt: { gte: from, lte: to },
        },
      },
    }),

    // 5. Average evaluation score (excellence, impact, implementation).
    // Only rows that actually carry lens marks. `readerType: PANEL` rows keep their
    // marks in Reviewer/Score on a 1-5 scale and leave these three columns at their
    // schema default of 0 forever; a `draft` row has not been filled in at all.
    // Averaging either in reports a 0 nobody measured.
    tx.evaluation.findMany({
      where: {
        tenantId,
        status: 'completed',
        readerType: { not: 'PANEL' },
        createdAt: { gte: from, lte: to },
      },
      select: {
        excellence: true,
        impact: true,
        implementation: true,
      },
    }) as Promise<Array<{ excellence: number; impact: number; implementation: number }>>,

    // 6. Person-days: sum(hours) / 8
    tx.effort.aggregate({
      where: {
        tenantId,
        // Effort logged against an archived opportunity leaves the person-days figure with
        // it; the denominator (proposals) already excludes archived rows.
        opportunity: { deletedAt: null },
        date: { gte: from, lte: to },
      },
      _sum: {
        hours: true,
      },
    }),

    // 7. Active modules (on state)
    tx.moduleState.count({
      where: {
        tenantId,
        status: 'ON',
      },
    }),

    // 8. G0→G2 timeline: find last gate decisions
    tx.gateDecision.findMany({
      where: {
        tenantId,
        opportunity: { deletedAt: null },
        decidedAt: { gte: from, lte: to },
        gate: { in: ['G0', 'G2'] },
      },
      select: {
        opportunityId: true,
        gate: true,
        decidedAt: true,
      },
      orderBy: { decidedAt: 'desc' },
    }),

    // 9a. Proposals with outcome 'above_threshold' in range
    tx.proposal.count({
      where: {
        tenantId,
        outcome: 'above_threshold',
        opportunity: {
          deletedAt: null,
          createdAt: { gte: from, lte: to },
        },
      },
    }),

    // 9b. All submitted proposals in range (denominator for threshold rate)
    tx.proposal.count({
      where: {
        tenantId,
        submittedAt: { not: null },
        opportunity: {
          deletedAt: null,
          createdAt: { gte: from, lte: to },
        },
      },
    }),
  ]);

  // Every figure below is derived by a pure function in ./metrics so the
  // absence-vs-zero rule is unit-testable without a database.
  const successRate = hitRate(submittedProposals, g0ScoredOpportunities);
  const averageScore = averageLensScore(evaluations);
  const personDays = personDaysPerProposal(efforts._sum.hours ?? 0, totalProposals);
  const g0ToG2Days = averageG0ToG2Days(g0ToG2Times);
  const thresholdRateMetric = thresholdRate(aboveThresholdProposals, submittedProposalsInRange);

  return {
    totalOffers,
    activeModules,
    successRate,
    averageScore,
    personDays,
    g0ToG2Days,
    thresholdRate: thresholdRateMetric,
    hasAnyOpportunity: opportunitiesEver > 0,
  };
}

export async function getKpiTrend(
  tenantId: string,
  from: Date,
  to: Date,
  intervalDays: number = 7
): Promise<{ date: string; metric: string; value: number }[]> {
  return withTenant(tenantId, (tx) => getKpiTrendIn(tx, tenantId, from, to, intervalDays));
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** A UTC instant as the `timestamp` literal Prisma's `DateTime` columns hold. */
function pgTimestamp(d: Date): string {
  return d.toISOString().replace('T', ' ').replace('Z', '');
}

/**
 * The trend inside a transaction the caller has already bound to `tenantId`.
 *
 * One query for the whole range, whatever its length. It used to be three
 * `count`s per bucket, one after another: a five-year range was ~780 round trips
 * and a long custom range ran past the 5 s interactive-transaction timeout,
 * taking the whole dashboard down with it (TASK-MVCU7MP8JK1V5).
 *
 * Buckets start at `from` and step `intervalDays`; the last one starts on or
 * before `to` and is cut off at `to`, the same `createdAt <= to` the "total
 * offers" card uses, so the trend never sums to more than that card. Each bucket
 * is half-open, so an opportunity created exactly on a boundary counts once, in
 * the later bucket.
 * The filters are the ones {@link getKpiMetrics} uses for the same figures, and
 * `tenantId` is in the WHERE as well as in RLS: locally the app connects as a
 * BYPASSRLS role, and there the WHERE is the only fence.
 */
export async function getKpiTrendIn(
  tx: TenantTx,
  tenantId: string,
  from: Date,
  to: Date,
  intervalDays: number = 7
): Promise<{ date: string; metric: string; value: number }[]> {
  const intervalMs = intervalDays * DAY_MS;
  const buckets = to < from ? 0 : Math.floor((to.getTime() - from.getTime()) / intervalMs) + 1;
  if (buckets === 0) return [];

  // Proposal.opportunityId is unique, so the join cannot multiply opportunities.
  const rows = await tx.$queryRaw<Array<{ bucket: number; offers: number; submitted: number; g0Scored: number }>>`
    SELECT floor(extract(epoch FROM (o."createdAt" - ${pgTimestamp(from)}::timestamp)) / ${intervalMs / 1000})::int AS bucket,
           count(*)::int AS offers,
           count(p."id") FILTER (WHERE p."submittedAt" IS NOT NULL)::int AS submitted,
           count(*) FILTER (WHERE o."g0Score" IS NOT NULL)::int AS "g0Scored"
    FROM "Opportunity" o
    LEFT JOIN "Proposal" p ON p."opportunityId" = o."id" AND p."tenantId" = ${tenantId}
    WHERE o."tenantId" = ${tenantId}
      AND o."deletedAt" IS NULL
      AND o."createdAt" >= ${pgTimestamp(from)}::timestamp
      AND o."createdAt" <= ${pgTimestamp(to)}::timestamp
    GROUP BY 1
  `;
  const byBucket = new Map(rows.map((r) => [Number(r.bucket), r]));

  const data: { date: string; metric: string; value: number }[] = [];
  for (let k = 0; k < buckets; k++) {
    const row = byBucket.get(k);
    const offerCount = Number(row?.offers ?? 0);
    const submittedCount = Number(row?.submitted ?? 0);
    const g0ScoredCount = Number(row?.g0Scored ?? 0);

    const successRate =
      g0ScoredCount > 0 ? (submittedCount / g0ScoredCount) * 100 : 0;

    // `slice` rather than `split('T')[0]`: identical output for an ISO string,
    // and it is typed `string`. Same idiom as src/lib/fx/tcmb.ts.
    const dateStr = new Date(from.getTime() + k * intervalMs).toISOString().slice(0, 10);

    data.push({
      date: dateStr,
      metric: 'offers',
      value: offerCount,
    });
    data.push({
      date: dateStr,
      metric: 'success_rate',
      value: Math.round(successRate * 100) / 100,
    });
  }

  return data;
}
