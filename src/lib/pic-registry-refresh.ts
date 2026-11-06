import { prisma } from '@/lib/db';
import { requireActionId } from '@/lib/required-id';
import { recordAlert } from '@/lib/observability/system-alert';
import { checkPicRegistry, type PicRegistryDeps, type PicRegistryReason, type PicRegistryResult } from '@/lib/pic-registry';

/**
 * FO-396 retry policy. The first lookup is the save (or the job's own run); each retry waits this
 * long after the previous attempt. The waits are the rate limit: one tenant asks the register at most
 * once per wait, and the job never runs a lookup sooner. After the last retry the status stays UNKNOWN
 * (no grant) and a `retry_exhausted` alert is raised.
 */
export const PIC_REGISTRY_RETRY_WAITS_MS = [10 * 60_000, 40 * 60_000, 2 * 60 * 60_000] as const;

/** Only a lookup that failed to reach the register is worth another try. A changed shape, a body too large, or a switched-off check is not. */
const RETRYABLE_REASONS: ReadonlySet<PicRegistryReason> = new Set<PicRegistryReason>(['timeout', 'network', 'http_error']);

export function isRetryableRegistryReason(reason: PicRegistryReason): boolean {
  return RETRYABLE_REASONS.has(reason);
}

/** Where a lookup sits in its retry chain. `attempt` 0 is the first try, made by the save or by the job. */
export interface PicRegistryRetryContext {
  /** The PIC change the lookup belongs to: the retry key and the rescore's alert key. */
  auditEventId: string;
  attempt: number;
}

export type PicRegistryRefresh = PicRegistryResult & {
  /** False when the PIC changed while the register was being asked: the answer is for a PIC the tenant no longer holds, so nothing was stored. */
  stored: boolean;
};

/**
 * FO-396. Asks the register about the tenant's PIC and stores the answer on the tenant row.
 *
 * Runs OUTSIDE any DB transaction (it waits on the network, up to the registry timeout). The
 * caller decides what to do with the status; the G0 scorer reads only the stored value and never
 * calls the register itself. A `null` pic clears the stored answer and returns `null`.
 *
 * The write is conditional on the PIC that was asked about (`where: { id, pic }`): if the tenant
 * changed its PIC during the lookup, the answer is dropped (`stored: false`) and the newer PIC's own
 * lookup decides. A failed lookup is stored as UNKNOWN; a transient failure (timeout, network, HTTP
 * error) is retried by the `pic-registry-retry` job within {@link PIC_REGISTRY_RETRY_WAITS_MS}. A
 * changed response shape raises a SystemAlert (the data is fine, our reading of it is not).
 *
 * `checkPicRegistry` never throws, but the database writes here can (a missing tenant, a lost
 * connection), so callers wrap this in try/catch and keep their own save intact.
 */
export async function refreshTenantPicRegistry(
  tenantId: string,
  pic: string | null,
  deps: PicRegistryDeps = {},
  retry?: PicRegistryRetryContext,
): Promise<PicRegistryRefresh | null> {
  // An id that is missing would drop out of the `where` below and match every tenant (see required-id.ts).
  const tenantKey = requireActionId(tenantId, 'tenantId');
  if (pic === null) {
    await prisma.tenant.update({ where: { id: tenantKey }, data: { picRegistryStatus: null, picRegistryCheckedAt: null } });
    return null;
  }
  const askedPic = requireActionId(pic, 'pic');

  const result = await checkPicRegistry(askedPic, deps);
  // Conditional on the PIC asked about (FO-396 Ö-A): a PIC saved while the lookup waited is not overwritten.
  const { count } = await prisma.tenant.updateMany({
    where: { id: tenantKey, pic: askedPic },
    data: { picRegistryStatus: result.status, picRegistryCheckedAt: new Date() },
  });
  if (count === 0) return { ...result, stored: false };

  if (result.reason === 'schema_changed') {
    // No organisation name in the message or meta: only the tenant id and the reason.
    await recordAlert({
      level: 'warn',
      source: 'pic-registry',
      message: 'EU participant register answered in a shape we do not recognise; PIC treated as UNKNOWN',
      meta: { tenantId, reason: result.reason },
    });
  }

  if (retry && result.status === 'UNKNOWN' && isRetryableRegistryReason(result.reason)) {
    await scheduleRetry(tenantId, pic, retry);
  }
  return { ...result, stored: true };
}

/** Queues the next attempt, or raises `retry_exhausted` when none is left. Never throws. */
async function scheduleRetry(tenantId: string, pic: string, retry: PicRegistryRetryContext): Promise<void> {
  const wait = PIC_REGISTRY_RETRY_WAITS_MS[retry.attempt];
  if (wait === undefined) {
    await recordAlert({
      level: 'warn',
      source: 'pic-registry',
      message: 'EU participant register did not answer after all retries; PIC stays UNKNOWN (no grant)',
      meta: { tenantId, reason: 'retry_exhausted', attempts: retry.attempt + 1 },
    });
    return;
  }
  try {
    // Loaded here: the queue client is needed only when a retry is actually queued.
    const { enqueueJob } = await import('@/lib/jobs/enqueue');
    await enqueueJob(
      'pic-registry-retry',
      { tenantId, pic, auditEventId: retry.auditEventId, attempt: retry.attempt + 1 },
      { runAt: new Date(Date.now() + wait) },
    );
  } catch {
    // The save is already committed and the status is UNKNOWN (no grant). Say so, do not fail the save.
    await recordAlert({
      level: 'warn',
      source: 'pic-registry',
      message: 'EU participant register retry could not be queued; PIC stays UNKNOWN (no grant)',
      meta: { tenantId, reason: 'retry_not_queued' },
    });
  }
}
