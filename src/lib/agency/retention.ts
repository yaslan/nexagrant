/**
 * Agency monthly report retention (NG-341, NG-345; HUKUK-5 5d; veri sorumlusu kararı 23.11.2026).
 *
 * The decision, not an assumption:
 *   - an agency report is kept for {@link AGENCY_REPORT_RETENTION_MONTHS} months
 *     (KVKK md.4/2-d: only as long as its purpose needs; the purpose is the yearly comparison);
 *   - reports past that age are destroyed together, once every
 *     {@link AGENCY_REPORT_PURGE_INTERVAL_MONTHS} months (periodic destruction, Yönetmelik md.11),
 *     by the `agency-report-retention` job (src/lib/jobs/tasks/agency-report-retention.ts);
 *   - every destruction is recorded in `AgencyReportDeletionLog` (counts and metadata only). Those
 *     records are kept {@link AGENCY_REPORT_DELETION_LOG_RETENTION_YEARS} years (İmha Yönetmeliği
 *     md.7/3: at least three years) and pruned by the same job, once they are older than that;
 *   - the record has no foreign key to the agency (K-585864): deleting an agency keeps its records;
 *     once older than 3 years, the records of a hard-deleted agency are pruned too (NG-349).
 *
 * The rows themselves are `AuditEvent`s (`agency.report.generated`, src/lib/agency/report.ts),
 * which the app role may not delete (NG-40, auditevent-immutable.sql). The delete therefore runs
 * through `public.agency_report_purge()` (prisma/migrations/add-agency-report-deletion-log.sql):
 * SECURITY DEFINER, it deletes only that event type, only in the caller's own tenant, only rows
 * older than a cutoff that is itself at least 12 months back, and writes the log row in the same
 * statement. A cutoff later than that floor is refused by the database, not only here.
 * The log records are pruned the same way by `public.agency_report_deletion_log_prune()`
 * (add-agency-report-deletion-log-no-cascade.sql), with a 3-year floor.
 *
 * Payment or commission records tied to these numbers would fall under commercial retention
 * periods, not this rule. None exist (no payment or commission code reads agency reports), so
 * nothing else is purged here.
 */
import { prisma, withTenant } from '@/lib/db';
import {
  AGENCY_REPORT_CUTOFF_MARGIN_SECONDS,
  AGENCY_REPORT_DELETION_LOG_RETENTION_YEARS,
  AGENCY_REPORT_RETENTION_MONTHS,
} from './retention-policy';

export {
  AGENCY_REPORT_CUTOFF_MARGIN_SECONDS,
  AGENCY_REPORT_DELETION_LOG_RETENTION_YEARS,
  AGENCY_REPORT_PURGE_INTERVAL_MONTHS,
  AGENCY_REPORT_RETENTION_BASIS,
  AGENCY_REPORT_RETENTION_MONTHS,
} from './retention-policy';

/**
 * The instant `months` calendar months before `at`, in UTC. A day the earlier month does not have
 * (31 March → 31 February) becomes that month's last day.
 */
function minusUtcMonths(at: Date, months: number): Date {
  const y = at.getUTCFullYear();
  const m = at.getUTCMonth() - months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(y, m, Math.min(at.getUTCDate(), lastDay), at.getUTCHours(), at.getUTCMinutes(), at.getUTCSeconds(), at.getUTCMilliseconds())
  );
}

/**
 * The moment a report must be older than to be destroyed by a run at `at`: the same instant
 * {@link AGENCY_REPORT_RETENTION_MONTHS} calendar months earlier, in UTC, moved back by
 * {@link AGENCY_REPORT_CUTOFF_MARGIN_SECONDS} (see retention-policy.ts).
 */
export function agencyReportRetentionCutoff(at: Date): Date {
  return new Date(minusUtcMonths(at, AGENCY_REPORT_RETENTION_MONTHS).getTime() - AGENCY_REPORT_CUTOFF_MARGIN_SECONDS * 1000);
}

/**
 * The moment a deletion record must be older than to be pruned by a run at `at`: the same
 * instant {@link AGENCY_REPORT_DELETION_LOG_RETENTION_YEARS} years earlier, moved back by the margin.
 */
export function agencyReportDeletionLogCutoff(at: Date): Date {
  return new Date(
    minusUtcMonths(at, AGENCY_REPORT_DELETION_LOG_RETENTION_YEARS * 12).getTime() - AGENCY_REPORT_CUTOFF_MARGIN_SECONDS * 1000
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

export interface AgencyReportDeletionLogPruneResult {
  cutoff: string;
  agencies: number;
  /** Deletion records removed, all agencies together. */
  deleted: number;
  failed: number;
  errors: { tenantId: string; message: string }[];
}

interface PurgeRow {
  deleted: number;
  period_from: string | null;
  period_to: string | null;
}

interface Deps {
  agencies?: () => Promise<{ id: string }[]>;
}

/**
 * Every agency, soft-deleted ones included (their reports and records expire too). `Tenant` is not
 * under RLS: which agencies exist is this query's output (as in report.ts).
 */
async function listAgencies(deps: Deps): Promise<{ id: string }[]> {
  return (await deps.agencies?.()) ?? (await prisma.tenant.findMany({ where: { kind: 'AGENCY' }, select: { id: true } }));
}

/**
 * Destroy every agency report older than {@link agencyReportRetentionCutoff}(at), agency by
 * agency, each under its own tenant (RLS). Idempotent: a second run finds nothing older than
 * the cutoff and writes no record. Soft-deleted agencies are included: their reports expire too.
 */
export async function purgeExpiredAgencyReports(at: Date, runId: string, deps: Deps = {}): Promise<AgencyReportPurgeResult> {
  const cutoff = agencyReportRetentionCutoff(at);
  const agencies = await listAgencies(deps);
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

/**
 * Remove the deletion records older than {@link agencyReportDeletionLogCutoff}(at), agency by
 * agency, under each agency's own tenant (RLS), through `public.agency_report_deletion_log_prune()`.
 * Idempotent: a second run removes nothing. A record whose agency has been hard-deleted from
 * `Tenant` is not reached by this loop (no session can name it): {@link pruneOrphanedDeletionLogs}
 * removes those (NG-349).
 */
export async function pruneExpiredDeletionLogs(at: Date, deps: Deps = {}): Promise<AgencyReportDeletionLogPruneResult> {
  const cutoff = agencyReportDeletionLogCutoff(at);
  const agencies = await listAgencies(deps);
  const out: AgencyReportDeletionLogPruneResult = { cutoff: cutoff.toISOString(), agencies: agencies.length, deleted: 0, failed: 0, errors: [] };
  for (const { id: tenantId } of agencies) {
    try {
      const rows = await withTenant(tenantId, (tx) =>
        tx.$queryRaw<{ deleted: number }[]>`
          SELECT public.agency_report_deletion_log_prune(${tenantId}, ${cutoff.toISOString()}::timestamptz) AS deleted`
      );
      out.deleted += Number(rows[0]?.deleted ?? 0);
    } catch (e) {
      out.failed++;
      out.errors.push({ tenantId, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}

export interface AgencyReportDeletionLogOrphanPruneResult {
  cutoff: string;
  /** Records of agencies no longer in `Tenant`, removed. */
  deleted: number;
  /** The error, when the step failed; `null` when it ran. */
  error: string | null;
}

/**
 * Remove the deletion records of agencies hard-deleted from `Tenant`, older than
 * {@link agencyReportDeletionLogCutoff}(at) (NG-349). {@link pruneExpiredDeletionLogs} cannot reach
 * them: its agency list is read from `Tenant`, and no session can name an agency that is gone.
 * One call, outside any tenant session, to `public.agency_report_deletion_log_prune_orphans()`
 * (add-agency-report-deletion-log-prune-orphans.sql): it deletes only rows whose agency is not in
 * `Tenant`, refuses a cutoff less than 3 years back, and refuses a tenant session. Records of an
 * agency that still exists are never touched here. Idempotent: a second run removes nothing.
 * A failure is returned, not thrown, so the job reports it next to the other steps.
 */
export async function pruneOrphanedDeletionLogs(at: Date): Promise<AgencyReportDeletionLogOrphanPruneResult> {
  const cutoff = agencyReportDeletionLogCutoff(at);
  try {
    const rows = await prisma.$queryRaw<{ deleted: number }[]>`
      SELECT public.agency_report_deletion_log_prune_orphans(${cutoff.toISOString()}::timestamptz) AS deleted`;
    return { cutoff: cutoff.toISOString(), deleted: Number(rows[0]?.deleted ?? 0), error: null };
  } catch (e) {
    return { cutoff: cutoff.toISOString(), deleted: 0, error: e instanceof Error ? e.message : String(e) };
  }
}
