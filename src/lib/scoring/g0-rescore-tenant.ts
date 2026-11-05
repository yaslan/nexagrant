/**
 * FO-384 — a PIC change moves the G0 score stored for that tenant's opportunities.
 *
 * Saving, clearing or admin-removing a PIC changes the CORDIS evidence the scorer reads, so the
 * `Opportunity.g0Score` and `TopicMatch.g0Score` already on file go stale. This walks the tenant's
 * live opportunities and rescores each one through the canonical path (`rescoreOpportunityG0`).
 *
 * What it guarantees:
 *   • it never rejects: the PIC change is already committed when this runs, so a failure here is an
 *     alert (`SystemAlert`, no tenant id, no PIC value), never an error back to the user. The one
 *     exception is the worker's own run: a failed queue write is rethrown so the queue retries it;
 *   • it stops at a time budget and queues the rest as a job (`g0-rescore-tenant`) that resumes
 *     after the last opportunity it reached, so a large tenant is finished by the queue (FO-384 B2);
 *   • a row lock is waited for at most `G0_RESCORE_LOCK_TIMEOUT_MS`, so the budget holds (Y2);
 *   • an opportunity archived during the run is counted as `archived`, not as a failure (O2);
 *   • a score the scorer can no longer compute is cleared, not left at its old value;
 *   • a rescore keeps each opportunity's `updatedAt` (see `rescoreOpportunityG0`).
 */
import { withTenant } from '@/lib/db';
import { recordAlert } from '@/lib/observability/system-alert';
import {
  clearStoredG0,
  G0_RESCORE_LOCK_TIMEOUT_MS,
  limitLockWait,
  rescoreOpportunityG0,
  type G0Computation,
} from './g0-compute';

export type PicChangeTrigger = 'tenant_saved' | 'tenant_cleared' | 'admin_removed';
export interface PicChange {
  trigger: PicChangeTrigger;
  /** The `AuditEvent` row written by the PIC change, so an alert can be traced back to it. */
  auditEventId: string;
}
/** A run of the rescore. `afterId` resumes a run the queue continues: the last opportunity it reached. */
export interface G0RescoreRun extends PicChange {
  afterId?: string;
}
export interface G0TenantRescoreSummary {
  /** `null` when the opportunity list itself could not be read. */
  total: number | null;
  rescored: number;
  cleared: number;
  failed: number;
  /** Opportunities this run did not finish: the ones it could not reach. Not an archived one. */
  skipped: number;
  /** Opportunities archived after the listing and before their turn: not this tenant's any more, no alert. */
  archived: number;
  /** True when the rest was handed to the `g0-rescore-tenant` job. */
  queued: boolean;
}
export interface G0TenantRescoreDeps {
  listOpportunityIds?: (tenantId: string, afterId: string | undefined) => Promise<string[]>;
  rescore?: (tenantId: string, opportunityId: string) => Promise<G0Computation | null>;
  /** Queues the rest of this run. Resolves once the job is in the queue. */
  enqueueContinuation?: (tenantId: string, run: G0RescoreRun) => Promise<void>;
  now?: () => number;
  budgetMs?: number;
  /**
   * The worker sets this: a failed queue write is rethrown so the queue retries the job (from the
   * same cursor; a rescore is idempotent). The request path keeps resolving and raises an alert.
   */
  rethrowQueueFailure?: boolean;
}

export const G0_RESCORE_ALERT_SOURCE = 'g0-rescore-after-pic';
/** Within a server action's lifetime; the rest of a larger tenant is queued, not dropped. */
export const G0_RESCORE_BUDGET_MS = 25_000;
/** Alert meta lists at most this many unfinished opportunity ids; the counts stay whole. */
const ALERT_ID_LIMIT = 10;

/** Live (not archived) opportunities of one tenant after `afterId`, read under its RLS context. */
async function listLiveOpportunityIds(tenantId: string, afterId: string | undefined): Promise<string[]> {
  const rows = await withTenant(tenantId, (tx) =>
    tx.opportunity.findMany({
      where: { tenantId, deletedAt: null, ...(afterId ? { id: { gt: afterId } } : {}) },
      select: { id: true },
      // Id order is the cursor's order; `createdAt` ties would make a resumed run skip rows.
      orderBy: { id: 'asc' },
    }),
  );
  return rows.map((row) => String(row.id));
}

async function queueRest(tenantId: string, run: G0RescoreRun): Promise<void> {
  // Imported here so the scoring module does not load the queue client for a run that finishes.
  const { enqueueJob } = await import('@/lib/jobs/enqueue');
  await enqueueJob('g0-rescore-tenant', { ...run, tenantId });
}

/** The code of an error (a Prisma or driver code), never its message: messages can carry values. */
function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string') return code;
  return error instanceof Error ? error.name : 'unknown';
}

async function raiseAlert(
  run: G0RescoreRun,
  summary: G0TenantRescoreSummary,
  unfinished: string[],
  errored: boolean,
): Promise<void> {
  // Work that nobody will do (a failed listing, a failed opportunity, a rest that could not be queued) is an error.
  const lost = errored || summary.total === null || summary.failed > 0 || (summary.skipped > 0 && !summary.queued);
  const level = lost ? 'error' : 'warn';
  // `recordAlert` never throws. The dedupe key is per PIC change, so a retried run adds a count to
  // one alert instead of a second row (H1).
  await recordAlert({
    level,
    source: G0_RESCORE_ALERT_SOURCE,
    // No tenant id and no PIC value: the alert is read by staff across tenants.
    message: `G0 rescore after PIC change: ${summary.failed} failed, ${summary.skipped} not reached (of ${summary.total ?? 'unknown'})`,
    meta: {
      trigger: run.trigger,
      auditEventId: run.auditEventId,
      total: summary.total,
      rescored: summary.rescored,
      cleared: summary.cleared,
      failed: summary.failed,
      skipped: summary.skipped,
      queued: summary.queued,
      opportunityIds: unfinished.slice(0, ALERT_ID_LIMIT),
    },
    dedupeKey: `${G0_RESCORE_ALERT_SOURCE}:${run.auditEventId}`,
  });
}

/**
 * Rescores the tenant's live opportunities after its PIC changed. Resolves in every case.
 *
 * Runs in id order from `run.afterId`. When the time budget ends first, the rest goes to the queue
 * as a job that starts after the last opportunity reached. Only a failure to queue it, a failed
 * opportunity or an unreadable list raises an alert.
 */
export async function rescoreTenantG0AfterPicChange(
  tenantId: string,
  run: G0RescoreRun,
  deps: G0TenantRescoreDeps = {},
): Promise<G0TenantRescoreSummary> {
  const listIds = deps.listOpportunityIds ?? listLiveOpportunityIds;
  const rescore =
    deps.rescore ?? ((t: string, id: string) => rescoreOpportunityG0(t, id, { lockTimeoutMs: G0_RESCORE_LOCK_TIMEOUT_MS }));
  const enqueue = deps.enqueueContinuation ?? queueRest;
  const now = deps.now ?? Date.now;
  const budgetMs = deps.budgetMs ?? G0_RESCORE_BUDGET_MS;

  const summary: G0TenantRescoreSummary = { total: null, rescored: 0, cleared: 0, failed: 0, skipped: 0, archived: 0, queued: false };
  const unfinished: string[] = [];
  let ids: string[] = [];
  let next = 0;
  let lastReached: string | undefined = run.afterId;
  let errored = false;

  try {
    ids = await listIds(tenantId, run.afterId);
    summary.total = ids.length;
    const start = now();
    for (; next < ids.length; next++) {
      if (now() - start >= budgetMs) break;
      const id = ids[next]!;
      lastReached = id;
      try {
        const computation = await rescore(tenantId, id);
        if (!computation) {
          // Archived between the listing and this call: not this tenant's any more, so not a failure.
          summary.archived++;
        } else if (computation.score === null) {
          await withTenant(tenantId, async (tx) => {
            await limitLockWait(tx, G0_RESCORE_LOCK_TIMEOUT_MS);
            // A rescore is not an edit of the opportunity: keep its `updatedAt` (FO-384 E1).
            await clearStoredG0(tx, { ...computation, tenantId, opportunityId: id }, { keepUpdatedAt: true });
          });
          summary.cleared++;
        } else {
          summary.rescored++;
        }
      } catch (error) {
        summary.failed++;
        unfinished.push(id);
        console.error('G0 rescore failed for one opportunity', errorCode(error));
      }
    }
  } catch (error) {
    errored = true;
    console.error('G0 rescore after PIC change aborted', errorCode(error));
  }

  const remaining = summary.total === null ? [] : ids.slice(next);
  if (remaining.length > 0) {
    summary.skipped += remaining.length;
    try {
      await enqueue(tenantId, { ...run, afterId: lastReached });
      summary.queued = true;
    } catch (error) {
      console.error('G0 rescore continuation could not be queued', errorCode(error));
      // In the worker the throw is the retry: the queue runs this job again from the same cursor.
      // The alert comes from the queue once its attempts run out (`job-queue`).
      if (deps.rethrowQueueFailure) throw error;
      unfinished.push(...remaining);
    }
  }

  if (errored || summary.total === null || summary.failed > 0 || (summary.skipped > 0 && !summary.queued)) {
    await raiseAlert(run, summary, unfinished, errored);
  }
  return summary;
}
