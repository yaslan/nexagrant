/**
 * Agency monthly report retention (NG-341, HUKUK-5 5d; veri sorumlusu kararı 23.11.2026).
 *
 * The decision, not an assumption:
 *   - an agency report is kept for {@link AGENCY_REPORT_RETENTION_MONTHS} months
 *     (KVKK md.4/2-d: only as long as its purpose needs; the purpose is the yearly comparison);
 *   - reports past that age are destroyed together, once every
 *     {@link AGENCY_REPORT_PURGE_INTERVAL_MONTHS} months (periodic destruction, Yönetmelik md.11),
 *     by the `agency-report-retention` job (src/lib/jobs/tasks/agency-report-retention.ts);
 *   - every destruction is recorded in `AgencyReportDeletionLog` (counts and metadata only),
 *     and those records are kept for at least {@link AGENCY_REPORT_DELETION_LOG_RETENTION_YEARS}
 *     years. Removing records older than that is a separate job, not written yet.
 *
 * The rows themselves are `AuditEvent`s (`agency.report.generated`, src/lib/agency/report.ts),
 * which the app role may not delete (NG-40, auditevent-immutable.sql). The delete therefore runs
 * through `public.agency_report_purge()` (prisma/migrations/add-agency-report-deletion-log.sql):
 * SECURITY DEFINER, it deletes only that event type, only in the caller's own tenant, only rows
 * older than a cutoff that is itself at least 12 months back, and writes the log row in the same
 * statement. A cutoff later than that floor is refused by the database, not only here.
 *
 * Payment or commission records tied to these numbers would fall under commercial retention
 * periods, not this rule. None exist (no payment or commission code reads agency reports), so
 * nothing else is purged here.
 */
import { prisma, withTenant } from '@/lib/db';

/** Months an agency report is kept. User decision of 23.11.2026; not a default to tune. */
export const AGENCY_REPORT_RETENTION_MONTHS = 12;
/** How often the expired reports are destroyed together: 1 January and 1 July, UTC. */
export const AGENCY_REPORT_PURGE_INTERVAL_MONTHS = 6;
/** Minimum years a deletion record is kept. Its own pruning is a separate job. */
export const AGENCY_REPORT_DELETION_LOG_RETENTION_YEARS = 3;
/** The legal basis written on every deletion record. */
export const AGENCY_REPORT_RETENTION_BASIS = 'retention-12m';

/**
 * The moment a report must be older than to be destroyed by a run at `at`: the same
 * instant {@link AGENCY_REPORT_RETENTION_MONTHS} calendar months earlier, in UTC. A day
 * the earlier month does not have (31 March → 31 February) becomes that month's last day.
 */
export function agencyReportRetentionCutoff(at: Date): Date {
  const y = at.getUTCFullYear();
  const m = at.getUTCMonth() - AGENCY_REPORT_RETENTION_MONTHS;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(y, m, Math.min(at.getUTCDate(), lastDay), at.getUTCHours(), at.getUTCMinutes(), at.getUTCSeconds(), at.getUTCMilliseconds())
  );
}

/**
 * The run id written on the deletion records. A cron run is named by its tick, so a retried
 * or backfilled tick reuses its id; a run started by hand is named by its own moment.
 */
export function agencyReportRetentionRunId(tick: Date | null, now: Date): string {
  return tick ? `cron:${tick.toISOString()}` : `manual:${now.toISOString()}`;
}

export interface AgencyReportPurgeTenantResult {
  tenantId: string;
  deleted: number;
  periodFrom: string | null;
  periodTo: string | null;
}

export interface AgencyReportPurgeResult {
  runId: string;
  cutoff: string;
  agencies: number;
  deleted: number;
  /** Agencies that lost at least one report: one deletion record each. */
  purged: AgencyReportPurgeTenantResult[];
  failed: number;
  errors: { tenantId: string; message: string }[];
}

interface PurgeRow {
  deleted: number;
  period_from: string | null;
  period_to: string | null;
}

/**
 * Destroy every agency report older than {@link agencyReportRetentionCutoff}(at), agency by
 * agency, each under its own tenant (RLS). Idempotent: a second run finds nothing older than
 * the cutoff and writes no record. Soft-deleted agencies are included: their reports expire too.
 */
export async function purgeExpiredAgencyReports(
  at: Date,
  runId: string,
  deps: { agencies?: () => Promise<{ id: string }[]> } = {}
): Promise<AgencyReportPurgeResult> {
  const cutoff = agencyReportRetentionCutoff(at);
  // `Tenant` is not under RLS: which agencies exist is this query's output (as in report.ts).
  const agencies =
    (await deps.agencies?.()) ?? (await prisma.tenant.findMany({ where: { kind: 'AGENCY' }, select: { id: true } }));
  const out: AgencyReportPurgeResult = {
    runId,
    cutoff: cutoff.toISOString(),
    agencies: agencies.length,
    deleted: 0,
    purged: [],
    failed: 0,
    errors: [],
  };
  for (const { id: tenantId } of agencies) {
    try {
      const rows = await withTenant(tenantId, (tx) =>
        tx.$queryRaw<PurgeRow[]>`
          SELECT deleted, period_from, period_to
            FROM public.agency_report_purge(${tenantId}, ${runId}, ${cutoff.toISOString()}::timestamptz)`
      );
      const row = rows[0];
      const deleted = Number(row?.deleted ?? 0);
      if (deleted > 0) {
        out.deleted += deleted;
        out.purged.push({ tenantId, deleted, periodFrom: row?.period_from ?? null, periodTo: row?.period_to ?? null });
      }
    } catch (e) {
      out.failed++;
      out.errors.push({ tenantId, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}
