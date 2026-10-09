import { withTenant } from '@/lib/db';
import { isAboveThreshold, isFunded } from '@/lib/proposal-outcome';
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

const G2_AND_BEYOND = ['G2', 'G3', 'G4'];

/** Just enough of a loaded row for {@link countOutcomes} to be testable without a database. */
export interface OutcomeBearingRow {
  proposal: { outcome: string | null } | null;
}

/**
 * The two counts that read `Proposal.outcome`, kept pure so the case rule they depend on can
 * be pinned by a unit test (tests/proposal-outcome.test.ts). Both go through
 * src/lib/proposal-outcome rather than comparing the raw column: the spelling stored by the
 * seeds and by the ESR calibration script is snake_case, and the SCREAMING_CASE literals that
 * used to sit here matched no row ever written — which is why this KPI reported 0 % on data
 * whose real answer was 20 % (docs/ROADMAP.md, TASK-MTQTYXC0NUT0B).
 */
export function countOutcomes(rows: readonly OutcomeBearingRow[]) {
  return {
    aboveThreshold: rows.filter((r) => isAboveThreshold(r.proposal?.outcome)).length,
    funded: rows.filter((r) => isFunded(r.proposal?.outcome)).length,
  };
}

export async function fetchDashboardMetrics(filters: MetricsFilters) {
  const { tenantId, from, to } = filters;

  // `deletedAt: null` is part of the base filter, not an afterthought: every KPI below is a
  // count or an average over this result set, so an archived opportunity left in it would keep
  // inflating the hit rate and the person-day totals after it left the board.
  const where: Record<string, unknown> = { tenantId, deletedAt: null };
  if (from || to) {
    where.createdAt = {};
    if (from) (where.createdAt as Record<string, Date>).gte = from;
    if (to) (where.createdAt as Record<string, Date>).lte = to;
  }

  const opportunities = (await withTenant(tenantId, (tx) =>
    tx.opportunity.findMany({
      where,
      include: { proposal: true, efforts: true },
    })
  )) as OppWithRelations[];

  // Calculate KPIs
  const totalOpps = opportunities.length;

  const { aboveThreshold: aboveThresholdOpps, funded: fundedOpps } = countOutcomes(opportunities);

  const avgIsabet = totalOpps > 0
    ? (opportunities.reduce((sum: number, o) => sum + (o.g0Score || 0), 0) / totalOpps).toFixed(1)
    : '0';

  const totalEffortDays = opportunities.reduce(
    (sum: number, o) => sum + (o.efforts.reduce((s: number, e) => s + e.hours, 0) || 0) / 8,
    0
  );

  const g2Opps = opportunities.filter((o) => G2_AND_BEYOND.includes(o.stage));
  const avgG2Days = g2Opps.length > 0
    ? g2Opps.reduce(
        (sum: number, o) => sum + (o.updatedAt.getTime() - o.createdAt.getTime()) / (1000 * 3600 * 24),
        0
      ) / g2Opps.length
    : 0;

  const activeModules = await withTenant(tenantId, (tx) =>
    tx.moduleState.count({
      where: { tenantId, status: { in: ['ON', 'PILOT'] } },
    })
  );

  return {
    totalOpps,
    aboveThresholdOpps,
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
  aboveThresholdOpps: number;
  avgIsabet: number;
  totalEffortDays: string;
  avgG2Days: number;
  activeModules: number;
  stageBreakdown: Array<{ stage: string; count: number }>;
}

/**
 * An empty cell, for a KPI with no inputs.
 *
 * Same rule the on-screen cards follow (src/modules/m5/server/metrics.ts): a ratio over no
 * opportunities is not "0 %", it is a figure that does not exist yet. A spreadsheet reads an
 * empty cell as "no value" and a `0` as a measurement, so absence gets the empty cell.
 */
const ratio = (numerator: number, denominator: number) =>
  denominator > 0 ? ((numerator / denominator) * 100).toFixed(1) : '';

const orBlank = (value: number | string, denominator: number) => (denominator > 0 ? value : '');

export function generateCSV(metrics: DashboardMetricsCsvInput, from?: Date, to?: Date): string {
  const headers = ['KPI', 'Değer', 'Birim', 'Dönem'];
  const period = `${from?.toLocaleDateString('tr-TR') ?? 'Başlangıç'} - ${to?.toLocaleDateString('tr-TR') ?? 'Günümüz'}`;
  const rows = [
    headers.join(','),
    `Toplam Teklif,${metrics.totalOpps},adet,"${period}"`,
    `Başarı Oranı,${ratio(metrics.aboveThresholdOpps, metrics.totalOpps)},%`,
    `İsabet Oranı,${orBlank(metrics.avgIsabet, metrics.totalOpps)},skor`,
    `Kişi-Gün,${metrics.totalEffortDays},gün`,
    `G0→G2 Süresi,${orBlank(metrics.avgG2Days, metrics.totalOpps)},gün`,
    `Açık Modüller,${metrics.activeModules},modül`,
    '',
    'Stage,Sayı',
    ...metrics.stageBreakdown.map((s) => `${s.stage},${s.count}`),
  ];

  return rows.join('\n');
}
