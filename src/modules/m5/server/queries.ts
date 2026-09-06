import { prisma, withTenant } from '@/lib/db';
import type { PrismaClient } from '@prisma/client';

export interface KpiMetrics {
  totalOffers: number;
  successRate: number; // 0-100
  averageScore: number; // 0-100
  personDays: number;
  g0ToG2Days: number;
  activeModules: number;
}

export async function getKpiMetrics(
  tenantId: string,
  from: Date,
  to: Date
): Promise<KpiMetrics> {
  return withTenant(tenantId, async (tx) => {
    const [
      totalOffers,
      successCount,
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
          createdAt: { gte: from, lte: to },
        },
      }),

      // 2. Successful proposals (submitted or above threshold)
      tx.proposal.count({
        where: {
          tenantId,
          opportunity: {
            createdAt: { gte: from, lte: to },
            status: { in: ['FUNDED', 'ABOVE_THRESHOLD'] },
          },
        },
      }),

      // 3. Total proposals for success rate denominator
      tx.proposal.count({
        where: {
          tenantId,
          opportunity: {
            createdAt: { gte: from, lte: to },
          },
        },
      }),

      // 4. Average evaluation score (excellence, impact, implementation)
      tx.evaluation.findMany({
        where: {
          tenantId,
          createdAt: { gte: from, lte: to },
        },
        select: {
          excellence: true,
          impact: true,
          implementation: true,
        },
      }) as Promise<Array<{ excellence: number; impact: number; implementation: number }>>,

      // 5. Person-days: sum(hours) / 8
      tx.effort.aggregate({
        where: {
          tenantId,
          date: { gte: from, lte: to },
        },
        _sum: {
          hours: true,
        },
      }),

      // 6. Active modules (on state)
      tx.moduleState.count({
        where: {
          tenantId,
          status: 'ON',
        },
      }),

      // 7. G0→G2 timeline: find last gate decisions
      tx.gateDecision.findMany({
        where: {
          tenantId,
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

    // Hit rate: funded / above-threshold proposals over all proposals in range.
    const successRate =
      totalProposals > 0 ? (successCount / totalProposals) * 100 : 0;

    // Calculate average score: (excellence + impact + implementation) / 3
    let averageScore = 0;
    if (evaluations.length > 0) {
      const sumScores = evaluations.reduce((acc: number, ev: { excellence: number; impact: number; implementation: number }) => {
        const avgEval =
          (ev.excellence + ev.impact + ev.implementation) / 3;
        return acc + avgEval;
      }, 0);
      averageScore = sumScores / evaluations.length;
    }

    // Person-days PER PROPOSAL (docs/ROADMAP.md: "kişi-gün/teklif"). Reporting the
    // raw total here would overstate the effort each proposal costs.
    const totalPersonDays = (efforts._sum.hours ?? 0) / 8;
    const personDays =
      totalProposals > 0
        ? Math.round((totalPersonDays / totalProposals) * 100) / 100
        : 0;

    // Calculate G0→G2 days (naive: average time between G0 and G2 decisions)
    let g0ToG2Days = 0;
    if (g0ToG2Times.length > 1) {
      const g0Map = new Map<string, Date>();
      const g2Map = new Map<string, Date>();

      g0ToG2Times.forEach((gd: { opportunityId: string; gate: string; decidedAt: Date }) => {
        if (gd.gate === 'G0') {
          g0Map.set(gd.opportunityId, gd.decidedAt);
        } else if (gd.gate === 'G2') {
          g2Map.set(gd.opportunityId, gd.decidedAt);
        }
      });

      let totalDays = 0;
      let count = 0;
      g0Map.forEach((g0Date, oppId) => {
        const g2Date = g2Map.get(oppId);
        if (g2Date) {
          const days = Math.max(
            0,
            (g2Date.getTime() - g0Date.getTime()) / (1000 * 60 * 60 * 24)
          );
          totalDays += days;
          count++;
        }
      });

      g0ToG2Days = count > 0 ? Math.round(totalDays / count) : 0;
    }

    return {
      totalOffers,
      successRate: Math.round(successRate * 100) / 100,
      averageScore: Math.round(averageScore * 100) / 100,
      personDays,
      g0ToG2Days,
      activeModules,
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
          createdAt: { gte: current, lte: intervalEnd },
        },
      });

      const proposalCount = await tx.proposal.count({
        where: {
          tenantId,
          opportunity: {
            createdAt: { gte: current, lte: intervalEnd },
          },
        },
      });

      const successCount = await tx.proposal.count({
        where: {
          tenantId,
          opportunity: {
            createdAt: { gte: current, lte: intervalEnd },
            status: { in: ['FUNDED', 'ABOVE_THRESHOLD'] },
          },
        },
      });

      const successRate =
        proposalCount > 0 ? (successCount / proposalCount) * 100 : 0;

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
