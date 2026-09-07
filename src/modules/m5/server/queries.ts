import { prisma, withTenant } from '@/lib/db';
import type { PrismaClient } from '@prisma/client';

import {
  averageG0ToG2Days,
  averageLensScore,
  hitRate,
  personDaysPerProposal,
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
  return withTenant(tenantId, async (tx) => {
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
    ]);

    // Every figure below is derived by a pure function in ./metrics so the
    // absence-vs-zero rule is unit-testable without a database.
    const successRate = hitRate(submittedProposals, g0ScoredOpportunities);
    const averageScore = averageLensScore(evaluations);
    const personDays = personDaysPerProposal(efforts._sum.hours ?? 0, totalProposals);
    const g0ToG2Days = averageG0ToG2Days(g0ToG2Times);

    return {
      totalOffers,
      activeModules,
      successRate,
      averageScore,
      personDays,
      g0ToG2Days,
      hasAnyOpportunity: opportunitiesEver > 0,
    };
  });
}

export async function getKpiTrend(
  tenantId: string,
  from: Date,
  to: Date,
  intervalDays: number = 7
): Promise<{ date: string; metric: string; value: number }[]> {
  return withTenant(tenantId, async (tx) => {
    const data: { date: string; metric: string; value: number }[] = [];

    // Generate date intervals
    const current = new Date(from);
    while (current <= to) {
      const intervalEnd = new Date(
        current.getTime() + intervalDays * 24 * 60 * 60 * 1000
      );

      // Count opportunities created in this interval
      const offerCount = await tx.opportunity.count({
        where: {
          tenantId,
          deletedAt: null,
          createdAt: { gte: current, lte: intervalEnd },
        },
      });

      const submittedCount = await tx.proposal.count({
        where: {
          tenantId,
          submittedAt: { not: null },
          opportunity: {
            deletedAt: null,
            createdAt: { gte: current, lte: intervalEnd },
          },
        },
      });

      const g0ScoredCount = await tx.opportunity.count({
        where: {
          tenantId,
          deletedAt: null,
          g0Score: { not: null },
          createdAt: { gte: current, lte: intervalEnd },
        },
      });

      const successRate =
        g0ScoredCount > 0 ? (submittedCount / g0ScoredCount) * 100 : 0;

      const dateStr = current.toISOString().split('T')[0];

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

      current.setDate(current.getDate() + intervalDays);
    }

    return data;
  });
}
