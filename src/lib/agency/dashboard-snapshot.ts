/**
 * NG-340 (HUKUK-5 5b, data controller decision 23.11.2026): the agency dashboard
 * shows the month-end snapshot, never a live count.
 *
 * The time channel it closes: a dashboard counted live changed the moment a
 * number crossed a boundary — a cell going from "<10" to "10", or a rounded
 * value stepping from 10 to 20. An agency reloading the page could tell WHEN
 * an organisation registered or took a step, and with the code it handed out,
 * which one. Now every number the agency sees comes from the last report
 * stored by the monthly job (agency-monthly-report, 1st of the month 06:00 UTC):
 * the response is the same byte for byte all month, and the only change an
 * agency can observe is at the start of a month, once.
 *
 * No new table: the snapshot is the monthly report (`AuditEvent`
 * `agency.report.generated`, ./report.ts), already masked, rounded and checked
 * by its schema. It carries the totals and the organisation-type breakdown,
 * which are the only two views the dashboard offers since NG-339.
 *
 * The live count (./funnel.ts) stays on the server for the monthly job and
 * for tests; no agency-facing response
 * reads it (tests/agency-dashboard-no-live-read.test.ts is the guard).
 */
import type { OrgType } from '@prisma/client';
import type { TenantTx } from '@/lib/db';
import { FUNNEL_ROUND_STEP, FUNNEL_STEPS, ORG_TYPES, SMALL_CELL_THRESHOLD, type AgencyFunnel, type FunnelBreakdown, type FunnelView } from './funnel';
import { AGENCY_REPORT_EVENT, AgencyReportSnapshotSchema, type AgencyReportSnapshot } from './report';

/** What the dashboard renders: the closed month it shows, and that month's funnel. */
export interface AgencyDashboardFunnel {
  /** `YYYY-MM`, the last closed month a snapshot exists for. */
  period: string;
  funnel: AgencyFunnel;
}

/**
 * A snapshot made under today's rules: every grand total withheld (NG-339,
 * K-585957 = A) and every shown count a multiple of {@link FUNNEL_ROUND_STEP}
 * of at least {@link SMALL_CELL_THRESHOLD}. A report stored before NG-339
 * (threshold 5, the total published) still reads as a report, but the
 * dashboard does not republish it: it waits for the next month-end instead.
 */
export function followsCurrentRules(s: AgencyReportSnapshot): boolean {
  const countOk = (v: FunnelView) =>
    FUNNEL_STEPS.every((st) => {
      const c = v[st];
      return c.state !== 'count' || (c.value >= SMALL_CELL_THRESHOLD && c.value % FUNNEL_ROUND_STEP === 0);
    });
  const totalWithheld = FUNNEL_STEPS.every((st) => s.all[st].state === 'withheld' || s.all[st].state === 'unmeasured');
  return totalWithheld && countOk(s.all) && ORG_TYPES.every((t) => countOk(s.byOrgType[t])) && !s.byProvince?.length;
}

/** Pure: the dashboard response for one breakdown, read off a stored snapshot. Nothing is counted here. */
export function funnelFromSnapshot(s: AgencyReportSnapshot, breakdown: FunnelBreakdown): AgencyFunnel {
  if (breakdown.dimension === 'orgType') {
    const byOrgType = Object.fromEntries(ORG_TYPES.map((t) => [t, s.byOrgType[t]])) as Record<OrgType, FunnelView>;
    return { all: s.all, breakdown: { dimension: 'orgType', byOrgType } };
  }
  // No province view since NG-339 (5e); a province asked for gets the totals, as the page does.
  return { all: s.all, breakdown: { dimension: 'none' } };
}

/**
 * The agency's newest snapshot by period (`target` is `YYYY-MM`, so the text
 * order is the month order), or null when there is none yet, or when the newest
 * one does not validate or predates the current rules. `tx` is
 * `withTenant(agencyTenantId)`; RLS keeps another agency's rows out.
 */
export async function readLatestAgencySnapshotIn(
  tx: TenantTx,
  agencyTenantId: string
): Promise<{ period: string; snapshot: AgencyReportSnapshot } | null> {
  const row = await tx.auditEvent.findFirst({
    where: { tenantId: agencyTenantId, type: AGENCY_REPORT_EVENT, target: { not: null } },
    orderBy: [{ target: 'desc' }, { createdAt: 'desc' }],
    select: { target: true, data: true },
  });
  if (!row?.target) return null;
  const parsed = AgencyReportSnapshotSchema.safeParse(row.data);
  if (!parsed.success || parsed.data.period !== row.target || !followsCurrentRules(parsed.data)) return null;
  return { period: row.target, snapshot: parsed.data };
}

/** The dashboard's one read: the newest month-end snapshot, as the funnel for `breakdown`. */
export async function getAgencyDashboardFunnelIn(
  tx: TenantTx,
  agencyTenantId: string,
  breakdown: FunnelBreakdown
): Promise<AgencyDashboardFunnel | null> {
  const latest = await readLatestAgencySnapshotIn(tx, agencyTenantId);
  return latest ? { period: latest.period, funnel: funnelFromSnapshot(latest.snapshot, breakdown) } : null;
}
