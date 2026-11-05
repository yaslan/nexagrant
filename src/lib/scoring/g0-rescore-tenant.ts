/**
 * FO-384 — a PIC change moves the G0 score stored for that tenant's opportunities.
 *
 * Saving, clearing or admin-removing a PIC changes the CORDIS evidence the scorer reads, so the
 * `Opportunity.g0Score` and `TopicMatch.g0Score` already on file go stale. This walks the tenant's
 * live opportunities and rescores each one through the canonical path (`rescoreOpportunityG0`).
 *
 * What it guarantees:
 *   • it never rejects: the PIC change is already committed when this runs, so a failure here is an
 *     alert (`SystemAlert`, no tenant id, no PIC value), never an error back to the user;
 *   • it stops at a time budget and says how many opportunities it did not reach;
 *   • a score the scorer can no longer compute is cleared, not left at its old value.
 */
import { prisma, withTenant } from '@/lib/db';
import { clearStoredG0, rescoreOpportunityG0, type G0Computation } from './g0-compute';

export type PicChangeTrigger = 'tenant_saved' | 'tenant_cleared' | 'admin_removed';
export interface PicChange {
  trigger: PicChangeTrigger;
  /** The `AuditEvent` row written by the PIC change, so an alert can be traced back to it. */
  auditEventId: string;
}
export interface G0TenantRescoreSummary {
  /** `null` when the opportunity list itself could not be read. */
  total: number | null;
  rescored: number;
  cleared: number;
  failed: number;
  skipped: number;
}
export interface G0TenantRescoreDeps {
  listOpportunityIds?: (tenantId: string) => Promise<string[]>;
  rescore?: (tenantId: string, opportunityId: string) => Promise<G0Computation | null>;
  now?: () => number;
  budgetMs?: number;
}

export const G0_RESCORE_ALERT_SOURCE = 'g0-rescore-after-pic';
/** Within a server action's lifetime; a tenant with more opportunities is finished by a later run. */
export const G0_RESCORE_BUDGET_MS = 25_000;
/** Alert meta lists at most this many unfinished opportunity ids; the counts stay whole. */
const ALERT_ID_LIMIT = 10;

/** Live (not archived) opportunities of one tenant, read under its RLS context. */
async function listLiveOpportunityIds(tenantId: string): Promise<string[]> {
  const rows = await withTenant(tenantId, (tx) =>
    tx.opportunity.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    }),
  );
  return rows.map((row) => String(row.id));
}

async function raiseAlert(
  change: PicChange,
  summary: G0TenantRescoreSummary,
  unfinished: string[],
  errored: boolean,
): Promise<void> {
  const level = errored || summary.total === null || summary.failed > 0 ? 'error' : 'warn';
  try {
    await prisma.systemAlert.create({
      data: {
        level,
        source: G0_RESCORE_ALERT_SOURCE,
        // No tenant id and no PIC value: the alert is read by staff across tenants.
        message: `G0 rescore after PIC change: ${summary.failed} failed, ${summary.skipped} not reached (of ${summary.total ?? 'unknown'})`,
        meta: {
          trigger: change.trigger,
          auditEventId: change.auditEventId,
          total: summary.total,
          rescored: summary.rescored,
          cleared: summary.cleared,
          failed: summary.failed,
          skipped: summary.skipped,
          opportunityIds: unfinished.slice(0, ALERT_ID_LIMIT),
        },
      },
    });
  } catch (error) {
    console.error('G0 rescore alert could not be written', error instanceof Error ? error.name : 'unknown');
  }
}

/**
 * Rescores every live opportunity of the tenant after its PIC changed. Resolves in every case.
 */
export async function rescoreTenantG0AfterPicChange(
  tenantId: string,
  change: PicChange,
  deps: G0TenantRescoreDeps = {},
): Promise<G0TenantRescoreSummary> {
  const listIds = deps.listOpportunityIds ?? listLiveOpportunityIds;
  const rescore = deps.rescore ?? ((t: string, id: string) => rescoreOpportunityG0(t, id));
  const now = deps.now ?? Date.now;
  const budgetMs = deps.budgetMs ?? G0_RESCORE_BUDGET_MS;

  const summary: G0TenantRescoreSummary = { total: null, rescored: 0, cleared: 0, failed: 0, skipped: 0 };
  const unfinished: string[] = [];
  let ids: string[] = [];
  let next = 0;
  let errored = false;

  try {
    ids = await listIds(tenantId);
    summary.total = ids.length;
    const start = now();
    for (; next < ids.length; next++) {
      if (now() - start >= budgetMs) break;
      const id = ids[next]!;
      try {
        const computation = await rescore(tenantId, id);
        if (!computation) {
          // Archived or moved between the listing and this call: not this tenant's any more.
          summary.skipped++;
          unfinished.push(id);
        } else if (computation.score === null) {
          await withTenant(tenantId, (tx) => clearStoredG0(tx, { ...computation, tenantId, opportunityId: id }));
          summary.cleared++;
        } else {
          summary.rescored++;
        }
      } catch (error) {
        summary.failed++;
        unfinished.push(id);
        console.error('G0 rescore failed for one opportunity', error instanceof Error ? error.name : 'unknown');
      }
    }
    summary.skipped += ids.length - next;
    unfinished.push(...ids.slice(next));
  } catch (error) {
    errored = true;
    console.error('G0 rescore after PIC change aborted', error instanceof Error ? error.name : 'unknown');
    if (summary.total !== null) {
      summary.skipped += ids.length - next;
      unfinished.push(...ids.slice(next));
    }
  }

  if (errored || summary.total === null || summary.failed > 0 || summary.skipped > 0) {
    await raiseAlert({ ...change }, summary, unfinished, errored);
  }
  return summary;
}
