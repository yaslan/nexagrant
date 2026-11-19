import { prisma, withTenant, type TenantTx } from '@/lib/db';
import { deleteObjectBytes, getObjectBytes, tenantObjectKeyOf } from '@/lib/storage';
import { scanBytes, type ClamdOptions, type ClamdVerdict } from '@/lib/clamav';
import { recordAlert } from '@/lib/observability/system-alert';
import { errorMessage } from '@/lib/errors';
import { requireActionId } from '@/lib/required-id';

/**
 * NG-239 (§18.3) — virus scan of an uploaded evidence file, run by the
 * `evidence-scan` job (graphile-worker, ADR-0008), never inside a request.
 *
 * Flow: an upload (presign + confirm, or the FormData fallback) writes the row
 * PENDING and queues `evidence-scan` for attempt 0. The job reads the stored
 * bytes, streams them to clamd and writes the answer:
 *
 *   OK      → CLEAN; the file downloads from now on.
 *   FOUND   → INFECTED; the object is deleted from the store, an AuditEvent
 *             (`evidence.scan.infected`) is written in the tenant's scope and an
 *             `error` SystemAlert is raised.
 *   anything else (clamd not configured, refused, timed out, its own ERROR, the
 *   object unreadable) → ERROR, `scanAttempts` + 1, and the next attempt is
 *   queued after {@link EVIDENCE_SCAN_RETRY_WAITS_MS}. When the waits run out a
 *   `warn` SystemAlert says so; `evidence-scan-sweep` tries again later.
 *
 * Only CLEAN downloads (src/lib/evidence-scan-gate.ts), so every failure here
 * leaves the file unreachable rather than reachable (fail closed).
 *
 * SystemAlert has no tenantId column and no RLS (system-alert.ts, NG-85 F1):
 * the alerts carry no tenant id and no file name, only the signature, the
 * reason and the evidence id (an opaque cuid). The tenant-facing record is the
 * AuditEvent, under RLS.
 */

/** Waits before attempts 1, 2, 3 after a failed scan; after the last one the sweep takes over. */
export const EVIDENCE_SCAN_RETRY_WAITS_MS = [60_000, 5 * 60_000, 30 * 60_000] as const;

/** A PENDING row with no job after this long is picked up by the sweep (a queue write that failed, or a row from before NG-239). */
export const EVIDENCE_SCAN_SWEEP_PENDING_AFTER_MS = 2 * 60_000;
/** An ERROR row whose retries ran out is tried again by the sweep at most this often. */
export const EVIDENCE_SCAN_SWEEP_ERROR_AFTER_MS = 6 * 60 * 60_000;
export const EVIDENCE_SCAN_SWEEP_PAGE = 100;

export const EVIDENCE_SCAN_AUDIT_INFECTED = 'evidence.scan.infected';

export interface EvidenceScanRun {
  tenantId: string;
  evidenceId: string;
  /** The row's `scanAttempts` when this run was queued; a run for another value is stale. */
  attempt: number;
}

type TenantRunner = <T>(tenantId: string, callback: (tx: TenantTx) => Promise<T>) => Promise<T>;

export interface EvidenceScanDeps {
  scan?: (bytes: Buffer) => Promise<ClamdVerdict>;
  clamd?: ClamdOptions;
  runTenant?: TenantRunner;
  readObject?: (key: string) => Promise<Buffer | null>;
  deleteObject?: (key: string) => Promise<boolean>;
  enqueue?: (run: EvidenceScanRun, runAt?: Date) => Promise<boolean>;
  now?: () => Date;
}

export type EvidenceScanOutcome =
  | { status: 'CLEAN' | 'INFECTED' | 'ERROR'; signature?: string; reason?: string; retryQueued?: boolean; objectDeleted?: boolean }
  | { skipped: 'missing' | 'already_final' | 'stale_attempt' | 'no_file' | 'changed_meanwhile' };

/**
 * Queues one scan attempt. Never throws: the upload is committed already, and a
 * row whose job could not be queued stays PENDING (not downloadable) until the
 * sweep queues it. One key per evidence and attempt, so a repeat adds nothing.
 */
export async function enqueueEvidenceScan(run: EvidenceScanRun, runAt?: Date): Promise<boolean> {
  try {
    const { enqueueJob } = await import('@/lib/jobs/enqueue');
    await enqueueJob('evidence-scan', { ...run }, runAt ? { runAt } : {});
    return true;
  } catch (error) {
    console.warn(`[evidence-scan] could not queue a scan (attempt ${run.attempt}): ${errorMessage(error)}`);
    return false;
  }
}

/** One scan attempt of one evidence file. Throws only on a database error (the queue retries the run). */
export async function scanEvidence(run: EvidenceScanRun, deps: EvidenceScanDeps = {}): Promise<EvidenceScanOutcome> {
  const tenantId = requireActionId(run.tenantId, 'tenantId');
  const evidenceId = requireActionId(run.evidenceId, 'evidenceId');
  const runTenant: TenantRunner = deps.runTenant ?? ((id, cb) => withTenant(id, cb));
  const readObject = deps.readObject ?? getObjectBytes;
  const deleteObject = deps.deleteObject ?? deleteObjectBytes;
  const scan = deps.scan ?? ((bytes: Buffer) => scanBytes(bytes, deps.clamd));
  const enqueue = deps.enqueue ?? enqueueEvidenceScan;
  const now = deps.now ?? (() => new Date());

  const row = await runTenant(tenantId, (tx) =>
    tx.evidence.findFirst({
      where: { id: evidenceId, tenantId },
      select: { r2ObjectKey: true, scanStatus: true, scanAttempts: true },
    })
  );
  if (!row) return { skipped: 'missing' };
  if (row.scanStatus === 'CLEAN' || row.scanStatus === 'INFECTED') return { skipped: 'already_final' };
  if (row.scanAttempts !== run.attempt) return { skipped: 'stale_attempt' };
  // Only a key under the tenant's own prefix is read (and, if infected, deleted).
  const key = row.r2ObjectKey ? tenantObjectKeyOf(tenantId, row.r2ObjectKey) : null;
  if (!key) return { skipped: 'no_file' };

  const bytes = await readObject(key);
  const verdict: ClamdVerdict = bytes
    ? await scan(bytes)
    : { verdict: 'error', reason: 'bad_reply', detail: 'object_unreadable' };

  // Every write below is conditional on the state this run read: a second run
  // that finished first (or a delete) wins, and this one writes nothing.
  const unchanged = { id: evidenceId, tenantId, scanAttempts: run.attempt, scanStatus: { in: ['PENDING' as const, 'ERROR' as const] } };

  if (verdict.verdict === 'clean') {
    const n = await runTenant(tenantId, (tx) =>
      tx.evidence.updateMany({ where: unchanged, data: { scanStatus: 'CLEAN', scannedAt: now(), scanSignature: null } })
    );
    return n.count ? { status: 'CLEAN' } : { skipped: 'changed_meanwhile' };
  }

  if (verdict.verdict === 'infected') {
    // The object goes first: the row already blocks the download, and a row
    // marked INFECTED over a file still in the store is the worse half-state.
    const objectDeleted = await deleteObject(key).catch(() => false);
    const n = await runTenant(tenantId, async (tx) => {
      const updated = await tx.evidence.updateMany({
        where: unchanged,
        data: { scanStatus: 'INFECTED', scannedAt: now(), scanSignature: verdict.signature },
      });
      if (updated.count) {
        await tx.auditEvent.create({
          data: {
            tenantId,
            type: EVIDENCE_SCAN_AUDIT_INFECTED,
            target: evidenceId,
            data: { signature: verdict.signature, objectDeleted },
          },
        });
      }
      return updated.count;
    });
    if (!n) return { skipped: 'changed_meanwhile' };
    await recordAlert({
      level: 'error',
      source: 'evidence-scan',
      message: `Infected evidence upload removed (${verdict.signature})${objectDeleted ? '' : '; the stored object could NOT be deleted'}`,
      meta: { evidenceId, signature: verdict.signature, objectDeleted },
    }).catch((e) => console.error(`[evidence-scan] could not write the infected SystemAlert: ${errorMessage(e)}`));
    return { status: 'INFECTED', signature: verdict.signature, objectDeleted };
  }

  // Not clean, not infected: ERROR, and another try.
  const reason = verdict.detail ? `${verdict.reason}: ${verdict.detail}` : verdict.reason;
  const next = run.attempt + 1;
  const n = await runTenant(tenantId, (tx) =>
    tx.evidence.updateMany({ where: unchanged, data: { scanStatus: 'ERROR', scannedAt: now(), scanSignature: null, scanAttempts: next } })
  );
  if (!n.count) return { skipped: 'changed_meanwhile' };

  const wait = EVIDENCE_SCAN_RETRY_WAITS_MS[run.attempt];
  let retryQueued = false;
  if (wait !== undefined) {
    retryQueued = await enqueue({ tenantId, evidenceId, attempt: next }, new Date(now().getTime() + wait));
  }
  if (!retryQueued) {
    await recordAlert({
      level: 'warn',
      source: 'evidence-scan',
      message:
        wait === undefined
          ? 'Evidence scan failed after all retries; the file stays ERROR (not downloadable) until the sweep retries'
          : 'Evidence scan retry could not be queued; the file stays ERROR (not downloadable) until the sweep retries',
      meta: { reason: verdict.reason, attempts: next },
      dedupeKey: `evidence-scan:${wait === undefined ? 'retry_exhausted' : 'retry_not_queued'}:${verdict.reason}`,
    }).catch((e) => console.error(`[evidence-scan] could not write the scan-error SystemAlert: ${errorMessage(e)}`));
  }
  return { status: 'ERROR', reason, retryQueued };
}

export interface EvidenceScanSweepResult {
  tenants: number;
  tenantsFailed: number;
  queued: number;
  notQueued: number;
}

/**
 * `evidence-scan-sweep` (every 15 minutes): queues a scan for every stored file
 * that has none in flight — a PENDING row older than
 * {@link EVIDENCE_SCAN_SWEEP_PENDING_AFTER_MS} (its queue write failed, or it
 * was uploaded before NG-239 and became PENDING with the migration) and an
 * ERROR row whose last attempt is older than {@link EVIDENCE_SCAN_SWEEP_ERROR_AFTER_MS}.
 * The job key (evidence + attempt) keeps a run already queued from being added
 * twice. Tenant by tenant under its own scope, as evidence-expiring does.
 */
export async function sweepUnscannedEvidence(
  options: { now?: Date; runTenant?: TenantRunner; enqueue?: EvidenceScanDeps['enqueue']; tenantIds?: readonly string[] } = {}
): Promise<EvidenceScanSweepResult> {
  const now = options.now ?? new Date();
  const runTenant: TenantRunner = options.runTenant ?? ((id, cb) => withTenant(id, cb));
  const enqueue = options.enqueue ?? enqueueEvidenceScan;
  const pendingBefore = new Date(now.getTime() - EVIDENCE_SCAN_SWEEP_PENDING_AFTER_MS);
  const errorBefore = new Date(now.getTime() - EVIDENCE_SCAN_SWEEP_ERROR_AFTER_MS);
  const out: EvidenceScanSweepResult = { tenants: 0, tenantsFailed: 0, queued: 0, notQueued: 0 };

  // `Tenant` has no tenant_isolation policy (prisma/rls.sql); every Evidence read is in the tenant's scope.
  let cursor = '';
  for (;;) {
    const tenants = await prisma.tenant.findMany({
      where: { deletedAt: null, id: options.tenantIds ? { in: [...options.tenantIds], gt: cursor } : { gt: cursor } },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: EVIDENCE_SCAN_SWEEP_PAGE,
    });
    for (const { id: tenantId } of tenants) {
      out.tenants++;
      try {
        const due = await runTenant(tenantId, (tx) =>
          tx.evidence.findMany({
            where: {
              tenantId,
              r2ObjectKey: { not: null },
              OR: [
                { scanStatus: 'PENDING', updatedAt: { lt: pendingBefore } },
                { scanStatus: 'ERROR', scannedAt: { lt: errorBefore } },
              ],
            },
            select: { id: true, scanAttempts: true },
            orderBy: { id: 'asc' },
            take: EVIDENCE_SCAN_SWEEP_PAGE,
          })
        );
        for (const e of due) {
          if (await enqueue({ tenantId, evidenceId: e.id, attempt: e.scanAttempts })) out.queued++;
          else out.notQueued++;
        }
      } catch {
        out.tenantsFailed++;
      }
    }
    if (tenants.length < EVIDENCE_SCAN_SWEEP_PAGE) break;
    cursor = tenants[tenants.length - 1]!.id;
  }
  return out;
}
