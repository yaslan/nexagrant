import { prisma } from '@/lib/db';
import type { Opportunity } from '@prisma/client';

export interface MetricsFilters {
  tenantId: string;
  from?: Date;
  to?: Date;
}

/**
 * An Opportunity as this query loads it: the scalar columns plus the two
 * relations in the `include`. Derived from `ReturnType<findMany>` before, which
 * is `any` here — `prisma generate` does not run in this repo, so the shape has
 * to be stated rather than inferred (see src/types/prisma-override.d.ts).
 */
export interface OppWithRelations extends Opportunity {
  proposal: { outcome: string | null } | null;
  efforts: { hours: number }[];
}

export async function fetchDashboardMetrics(filters: MetricsFilters) {
  const { tenantId, from, to } = filters;

  const where: Record<string, unknown> = { tenantId };
  if (from || to) {
    where.createdAt = {};
    if (from) (where.createdAt as Record<string, Date>).gte = from;
    if (to) (where.createdAt as Record<string, Date>).lte = to;
  }

  const opportunities = (await prisma.opportunity.findMany({
    where,
    include: { proposal: true, efforts: true },
  })) as OppWithRelations[];

  // Calculate KPIs
  const totalOpps = opportunities.length;
  const submittedOpps = opportunities.filter(
    (o: OppWithRelations) => o.proposal && ['SUBMITTED', 'FUNDED', 'ABOVE_THRESHOLD'].includes(o.proposal.outcome || '')
  ).length;
  const fundedOpps = opportunities.filter((o: OppWithRelations) => o.proposal?.outcome === 'FUNDED').length;

  const avgIsabet = totalOpps > 0
    ? (opportunities.reduce((sum: number, o) => sum + (o.g0Score || 0), 0) / totalOpps).toFixed(1)
    : '0';

  const totalEffortDays = opportunities.reduce(
    (sum: number, o) => sum + (o.efforts.reduce((s: number, e) => s + e.hours, 0) || 0) / 8,
    0
  );

  const avgG2Days = opportunities
    .filter((o) => ['G2', 'G3', 'G4'].includes(o.stage))
    .reduce((sum: number, o) => {
      const diff = (o.updatedAt.getTime() - o.createdAt.getTime()) / (1000 * 3600 * 24);
      return sum + diff;
    }, 0) / Math.max(opportunities.filter((o) => ['G2', 'G3', 'G4'].includes(o.stage)).length, 1);

  const activeModules = await prisma.moduleState.count({
    where: { tenantId, status: { in: ['ON', 'PILOT'] } },
  });

  return {
    totalOpps,
    submittedOpps,
    fundedOpps,
    avgIsabet: parseFloat(avgIsabet as string),
    totalEffortDays: totalEffortDays.toFixed(1),
    avgG2Days: Math.round(avgG2Days),
    activeModules,
    stageBreakdown: [
      { stage: 'G0', count: opportunities.filter((o) => o.stage === 'G0').length },
      { stage: 'G1', count: opportunities.filter((o) => o.stage === 'G1').length },
      { stage: 'G2', count: opportunities.filter((o) => o.stage === 'G2').length },
      { stage: 'G3', count: opportunities.filter((o) => o.stage === 'G3').length },
      { stage: 'G4', count: opportunities.filter((o) => o.stage === 'G4').length },
    ],
    opportunities,
  };
}

/** The KPI block {@link fetchDashboardMetrics} returns, as the CSV writer reads it. */
export interface DashboardMetricsCsvInput {
  totalOpps: number;
  submittedOpps: number;
  avgIsabet: number;
  totalEffortDays: string;
  avgG2Days: number;
  activeModules: number;
  stageBreakdown: Array<{ stage: string; count: number }>;
}

export function generateCSV(metrics: DashboardMetricsCsvInput, from?: Date, to?: Date): string {
  const headers = ['KPI', 'Değer', 'Birim', 'Dönem'];
  const metricsTyped = metrics;
  const rows = [
    headers.join(','),
    `Toplam Teklif,${metricsTyped.totalOpps},adet,"${from?.toLocaleDateString('tr-TR')} - ${to?.toLocaleDateString('tr-TR')}"`,
    `Başarı Oranı,${((metricsTyped.submittedOpps / metricsTyped.totalOpps) * 100).toFixed(1)},%`,
    `İsabet Oranı,${metricsTyped.avgIsabet},skor`,
    `Kişi-Gün,${metricsTyped.totalEffortDays},gün`,
    `G0→G2 Süresi,${metricsTyped.avgG2Days},gün`,
    `Açık Modüller,${metricsTyped.activeModules},modül`,
    '',
    'Stage,Sayı',
    ...metricsTyped.stageBreakdown.map((s) => `${s.stage},${s.count}`),
  ];

  return rows.join('\n');
}
