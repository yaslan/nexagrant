import { prisma, withTenant, type TenantTx, type TenantTxOptions } from '@/lib/db';
import { deleteObjectBytes, getObjectBytes, tenantObjectKeyOf } from '@/lib/storage';
import { scanBytes, type ClamdOptions, type ClamdVerdict } from '@/lib/clamav';
import { recordAlert } from '@/lib/observability/system-alert';
import { errorMessage } from '@/lib/errors';
import { requireActionId } from '@/lib/required-id';
import { checkZipMembers, looksLikeZip } from '@/lib/zip-member-check';

/**
 * NG-239 (§18.3) — virus scan of an uploaded evidence file, run by the
 * `evidence-scan` job (graphile-worker, ADR-0008), never inside a request.
 *
 * Flow: an upload (presign + confirm, or the FormData fallback) writes the row
 * PENDING and queues `evidence-scan` for attempt 0. The job reads the stored
 * bytes, streams them to clamd and writes the answer:
 *
 *   OK      → CLEAN; the file downloads from now on.
 *   FOUND   → INFECTED; the row and an AuditEvent (`evidence.scan.infected`, tenant
 *             scope) are written first, then the object is deleted from the store and
 *             its outcome written as a second AuditEvent (`evidence.scan.object_removed`,
 *             `objectDeleted`), and an `error` SystemAlert is raised (NG-263: the order
 *             is this one, so a failure in between cannot lose the verdict).
 *   anything else (clamd not configured, refused, timed out, its own ERROR, a
 *   file past clamd's limits — `limits_exceeded`, NG-239 Ö-1, or past the ZIP member check that runs first, NG-269 — or the object unreadable) → ERROR, `scanAttempts` + 1, and the next attempt is
 *   queued after {@link EVIDENCE_SCAN_RETRY_WAITS_MS}. When the waits run out a
 *   `warn` SystemAlert says so; `evidence-scan-sweep` tries again later.
 *
 * A removal that failed (`objectDeleted: false`) is tried again (NG-279): the sweep queues the
 * file's run after {@link EVIDENCE_OBJECT_REMOVAL_RETRY_WAITS_MS}, each try is a new
 * `object_removed` AuditEvent, and after {@link EVIDENCE_OBJECT_REMOVAL_ALERT_AFTER_FAILURES}
 * failures one `error` SystemAlert says since when the object has stayed in the store.
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

/**
 * NG-279: waits after the 1st, 2nd, 3rd, … failed removal of an infected object before the next
 * try; past the end the last one repeats (tries go on once a day, the bytes must not stay).
 */
export const EVIDENCE_OBJECT_REMOVAL_RETRY_WAITS_MS = [15 * 60_000, 60 * 60_000, 6 * 60 * 60_000, 24 * 60 * 60_000] as const;
/** NG-279: at this many failed removals one `error` SystemAlert is raised for the file — once, not per try. */
export const EVIDENCE_OBJECT_REMOVAL_ALERT_AFTER_FAILURES = 5;

export const EVIDENCE_SCAN_AUDIT_INFECTED = 'evidence.scan.infected';
/** NG-263: the outcome of the object removal, a second event (AuditEvent rows are never updated). */
export const EVIDENCE_SCAN_AUDIT_OBJECT_REMOVED = 'evidence.scan.object_removed';

export interface EvidenceScanRun {
  tenantId: string;
  evidenceId: string;
  /** The row's `scanAttempts` when this run was queued; a run for another value is stale. */
  attempt: number;
}

type TenantRunner = <T>(tenantId: string, callback: (tx: TenantTx) => Promise<T>, options?: TenantTxOptions) => Promise<T>;

/**
 * NG-278: the transaction that removes an infected object holds the evidence row's lock across the
 * object delete (an R2 call). Prisma's 5 s default is too short for that; this is the bound.
 */
const OBJECT_REMOVAL_TX_TIMEOUT_MS = 30_000;

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
  | { skipped: 'missing' | 'already_final' | 'stale_attempt' | 'no_file' | 'changed_meanwhile' | 'removal_not_due' };

/** One recorded `evidence.scan.object_removed` outcome, oldest first. */
export interface ObjectRemovalAttempt {
  objectDeleted: boolean;
  at: Date;
}

export type ObjectRemovalDecision =
  | { due: true; failures: number; firstFailureAt: Date | null }
  | { due: false; why: 'removed' | 'waiting'; nextAt?: Date };

/**
 * NG-279: is the removal of an INFECTED file's object due now? Decided from its recorded outcomes
 * alone (AuditEvent rows are never updated, so the history is the state): none yet → due; the last
 * one deleted the object → done for good; otherwise due once the wait for that many failures
 * ({@link EVIDENCE_OBJECT_REMOVAL_RETRY_WAITS_MS}) has passed since the last try.
 */
export function objectRemovalDecision(attempts: readonly ObjectRemovalAttempt[], now: Date): ObjectRemovalDecision {
  const last = attempts[attempts.length - 1];
  if (!last) return { due: true, failures: 0, firstFailureAt: null };
  if (last.objectDeleted) return { due: false, why: 'removed' };
  const failures = attempts.filter((a) => !a.objectDeleted).length;
  const waits = EVIDENCE_OBJECT_REMOVAL_RETRY_WAITS_MS;
  const wait: number = waits[Math.min(failures, waits.length) - 1] ?? waits[waits.length - 1]!;
  const nextAt = new Date(last.at.getTime() + wait);
  if (now.getTime() < nextAt.getTime()) return { due: false, why: 'waiting', nextAt };
  const firstFailureAt = attempts.find((a) => !a.objectDeleted)?.at ?? null;
  return { due: true, failures, firstFailureAt };
}

/** The outcome stored in an `object_removed` AuditEvent's `data`; anything unreadable counts as not deleted. */
function attemptOf(row: { data: unknown; createdAt: Date }): ObjectRemovalAttempt {
  const data = row.data;
  const deleted = typeof data === 'object' && data !== null && (data as { objectDeleted?: unknown }).objectDeleted === true;
  return { objectDeleted: deleted, at: row.createdAt };
}

/**
 * Queues one scan attempt. Never throws: the upload is committed already, and a
 * row whose job could not be queued stays PENDING (not downloadable) until the
 * sweep queues it. One key per evidence and attempt, so a repeat adds nothing
 * while that job is queued or running.
 *
 * A job under the same key that failed for good (every queue attempt used, e.g.
 * the database was away for a few minutes) is replaced (`replaceFailed`): with
 * `unsafe_dedupe` alone it would hold the key forever, the sweep would keep
 * "queueing" into it and the file would never be scanned (NG-239 Ö-2).
 */
export async function enqueueEvidenceScan(run: EvidenceScanRun, runAt?: Date): Promise<boolean> {
  try {
    const { enqueueJob } = await import('@/lib/jobs/enqueue');
    await enqueueJob('evidence-scan', { ...run }, { replaceFailed: true, ...(runAt ? { runAt } : {}) });
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
  // The attempt pins every write below to the state this run read; a value that is not a
  // count would make that filter match nothing (or, worse, something else).
  if (!Number.isInteger(run.attempt) || run.attempt < 0) throw new Error('evidence-scan: attempt must be an integer ≥ 0');
  const runTenant: TenantRunner = deps.runTenant ?? ((id, cb, opts) => withTenant(id, cb, opts));
  const readObject = deps.readObject ?? getObjectBytes;
  const deleteObject = deps.deleteObject ?? deleteObjectBytes;
  const scan = deps.scan ?? ((bytes: Buffer) => scanBytes(bytes, deps.clamd));
  const enqueue = deps.enqueue ?? enqueueEvidenceScan;
  const now = deps.now ?? (() => new Date());

  const row = await runTenant(tenantId, (tx) =>
    tx.evidence.findFirst({
      where: { id: evidenceId, tenantId },
      select: { r2ObjectKey: true, scanStatus: true, scanAttempts: true, scanSignature: true },
    })
  );
  if (!row) return { skipped: 'missing' };
  // Only a key under the tenant's own prefix is read (and, if infected, deleted).
  const key = row.r2ObjectKey ? tenantObjectKeyOf(tenantId, row.r2ObjectKey) : null;
  if (row.scanStatus === 'CLEAN') return { skipped: 'already_final' };
  if (row.scanStatus === 'INFECTED') {
    // NG-263: the row was written INFECTED and the run stopped before the object was removed
    // (the job was lost after the commit). Finish that removal here; once its outcome is
    // recorded there is nothing left to do.
    return finishInfectedRemoval(run, key, row.scanSignature, runTenant, deleteObject, now);
  }
  if (row.scanAttempts !== run.attempt) return { skipped: 'stale_attempt' };
  if (!key) return { skipped: 'no_file' };

  const bytes = await readObject(key);
  const verdict: ClamdVerdict = bytes
    ? ((await zipRefusal(bytes)) ?? (await scan(bytes)))
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
    // NG-263 (NG-239 Ö-3): the answer is written first, the object is removed after it. A failure
    // in between (the transaction) makes the job retry with the object still in the store, so the
    // same verdict comes out again; the reverse order lost the verdict on that retry (object gone →
    // object_unreadable → ERROR). The row blocks the download from the moment it is INFECTED.
    const n = await runTenant(tenantId, async (tx) => {
      const updated = await tx.evidence.updateMany({
        where: unchanged,
        data: { scanStatus: 'INFECTED', scannedAt: now(), scanSignature: verdict.signature },
      });
      if (updated.count) {
        await tx.auditEvent.create({
          data: { tenantId, type: EVIDENCE_SCAN_AUDIT_INFECTED, target: evidenceId, data: { signature: verdict.signature } },
        });
      }
      return updated.count;
    });
    if (!n) return { skipped: 'changed_meanwhile' };
    return finishInfectedRemoval(run, key, verdict.signature ?? null, runTenant, deleteObject, now);
  }

  // Not clean, not infected: ERROR, and another try.
  const reason = verdict.detail ? `${verdict.reason}: ${verdict.detail}` : verdict.reason;
  const next = run.attempt + 1;
  const n = await runTenant(tenantId, (tx) =>
    tx.evidence.updateMany({ where: unchanged, data: { scanStatus: 'ERROR', scannedAt: now(), scanSignature: null, scanAttempts: next } })
  );
  if (!n.count) return { skipped: 'changed_meanwhile' };
  // NG-263 (second line): a stored object that cannot be read is its own cause, not a clamd fault.
  // It is raised at once, as an error, with the reason in its text.
  if (verdict.detail === 'object_unreadable') {
    await recordAlert({
      level: 'error',
      source: 'evidence-scan',
      message: 'Evidence scan stopped: the stored object is missing or unreadable (object_unreadable). The file stays ERROR and is not downloadable; if it had been marked INFECTED, the evidence.scan.infected AuditEvent says so',
      meta: { evidenceId, reason: verdict.reason, detail: verdict.detail, attempts: next },
    }).catch((e) => console.error(`[evidence-scan] could not write the object_unreadable SystemAlert: ${errorMessage(e)}`));
  }

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

/**
 * NG-263: the second half of an INFECTED verdict, after its row and AuditEvent are written: the object
 * is removed, the outcome is written as `evidence.scan.object_removed` (objectDeleted true/false) and
 * the `error` SystemAlert is raised. Also the resume point of a run that found the row INFECTED (the
 * job was lost after the write): if the outcome is recorded there is nothing left to do, otherwise the
 * object is removed now. A failed removal leaves the row INFECTED (the download stays refused) and the
 * alarm says the object could not be deleted.
 *
 * NG-279: a failed removal is not the end. When its wait has passed ({@link objectRemovalDecision})
 * the removal is tried again, and that try is a new `object_removed` event (the earlier ones are left
 * as they are). Alarms: the first try raises the NG-263 one; later failed tries raise nothing, except
 * the one that reaches {@link EVIDENCE_OBJECT_REMOVAL_ALERT_AFTER_FAILURES}; a later try that succeeds
 * raises one `info` alert so the open error alarm can be closed.
 */
async function finishInfectedRemoval(
  run: EvidenceScanRun,
  key: string | null,
  signature: string | null,
  runTenant: TenantRunner,
  deleteObject: (key: string) => Promise<boolean>,
  now: () => Date
): Promise<EvidenceScanOutcome> {
  const { tenantId, evidenceId } = run;
  if (!key) return { skipped: 'already_final' };
  // NG-278: the check for a recorded outcome, the object delete and the outcome write are one
  // transaction, and the evidence row is locked (FOR UPDATE) before the check. Two runs for one row
  // run one after the other: the second sees the outcome the first wrote and removes nothing. Without
  // the lock both checks could pass before either one wrote (the delete is the slow step), so each run
  // wrote its own object_removed and its own error alarm (measured on Postgres: NG-278 race test).
  // The lock is held across the R2 delete, hence the longer transaction timeout.
  const removal = await runTenant(
    tenantId,
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Evidence" WHERE "tenantId" = ${tenantId} AND "id" = ${evidenceId} FOR UPDATE`;
      const recorded = await tx.auditEvent.findMany({
        where: { tenantId, type: EVIDENCE_SCAN_AUDIT_OBJECT_REMOVED, target: evidenceId },
        select: { data: true, createdAt: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      const at = now();
      const decision = objectRemovalDecision(recorded.map(attemptOf), at);
      if (!decision.due) return { skipped: decision.why };
      const objectDeleted = await deleteObject(key).catch(() => false);
      // `createdAt` is the try's own instant (the clock the wait above is measured on).
      await tx.auditEvent.create({
        data: { tenantId, type: EVIDENCE_SCAN_AUDIT_OBJECT_REMOVED, target: evidenceId, data: { objectDeleted }, createdAt: at },
      });
      return { objectDeleted, failuresBefore: decision.failures, firstFailureAt: decision.firstFailureAt ?? (objectDeleted ? null : at), at };
    },
    { timeout: OBJECT_REMOVAL_TX_TIMEOUT_MS }
  );
  if (removal.skipped) return { skipped: removal.skipped === 'removed' ? 'already_final' : 'removal_not_due' };
  const { objectDeleted, failuresBefore, firstFailureAt, at } = removal;
  const failuresNow = failuresBefore + (objectDeleted ? 0 : 1);
  const alert = removalAlert({ evidenceId, signature, objectDeleted, failuresBefore, failuresNow, firstFailureAt, at });
  if (alert) {
    await recordAlert(alert).catch((e) => console.error(`[evidence-scan] could not write the infected SystemAlert: ${errorMessage(e)}`));
  }
  return { status: 'INFECTED', signature: signature ?? undefined, objectDeleted };
}

/** NG-279: which alarm (if any) one removal try raises — at most one per file per kind, never one per try. */
function removalAlert(r: {
  evidenceId: string;
  signature: string | null;
  objectDeleted: boolean;
  failuresBefore: number;
  failuresNow: number;
  firstFailureAt: Date | null;
  at: Date;
}): Parameters<typeof recordAlert>[0] | null {
  const meta = { evidenceId: r.evidenceId, signature: r.signature, objectDeleted: r.objectDeleted };
  if (r.failuresBefore === 0) {
    // The first try (NG-263's alarm, unchanged).
    return {
      level: 'error',
      source: 'evidence-scan',
      message: `Infected evidence upload removed (${r.signature ?? 'unknown'})${r.objectDeleted ? '' : '; the stored object could NOT be deleted'}`,
      meta,
    };
  }
  if (r.objectDeleted) {
    return {
      level: 'info',
      source: 'evidence-scan',
      message: `Infected evidence object deleted on retry, after ${r.failuresBefore} failed removal(s)`,
      meta: { ...meta, failedRemovals: r.failuresBefore },
    };
  }
  if (r.failuresNow === EVIDENCE_OBJECT_REMOVAL_ALERT_AFTER_FAILURES && r.firstFailureAt) {
    const hours = Math.round((r.at.getTime() - r.firstFailureAt.getTime()) / 3_600_000);
    return {
      level: 'error',
      source: 'evidence-scan',
      message: `Infected evidence object still in the store after ${r.failuresNow} failed removals since ${r.firstFailureAt.toISOString()} (about ${hours} h); retries go on once a day, the download stays refused`,
      meta: { ...meta, failedRemovals: r.failuresNow, failingSince: r.firstFailureAt.toISOString() },
      dedupeKey: `evidence-scan:object_not_removed:${r.evidenceId}`,
    };
  }
  return null;
}

/**
 * NG-269 (K-584606 = C): a docx/xlsx is a ZIP, and clamd answers OK for a ZIP
 * it did not read to the end (one member past MaxFileSize is cut, a ZIP64 member
 * is not unpacked: NG-265). src/lib/zip-member-check.ts finds those before the
 * bytes go to clamd; such a file is `limits_exceeded`, the same answer as
 * clamd's own `Heuristics.Limits.Exceeded.*`: ERROR, kept, never downloadable.
 * The detail is a failure code only (no member name: names are tenant data).
 */
async function zipRefusal(bytes: Buffer): Promise<ClamdVerdict | null> {
  if (!looksLikeZip(bytes)) return null;
  const check = await checkZipMembers(bytes);
  return check.ok ? null : { verdict: 'error', reason: 'limits_exceeded', detail: `zip_member_check: ${check.failure}` };
}

export interface EvidenceScanSweepResult {
  tenants: number;
  tenantsFailed: number;
  queued: number;
  notQueued: number;
  /** NG-279: of `queued`, runs queued to try a failed (or never recorded) object removal again. */
  removalsQueued: number;
}

/**
 * `evidence-scan-sweep` (every 15 minutes): queues a scan for every stored file
 * that has none in flight — a PENDING row older than
 * {@link EVIDENCE_SCAN_SWEEP_PENDING_AFTER_MS} (its queue write failed, or it
 * was uploaded before NG-239 and became PENDING with the migration) and an
 * ERROR row whose last attempt is older than {@link EVIDENCE_SCAN_SWEEP_ERROR_AFTER_MS}.
 * The job key (evidence + attempt) keeps a run already queued from being added
 * twice; a job under that key that failed for good is replaced
 * ({@link enqueueEvidenceScan}). Every due row of a tenant, page by page. Tenant by tenant under its own scope, as evidence-expiring does.
 *
 * NG-279: also an INFECTED row whose object removal is due again ({@link objectRemovalDecision}: no
 * `object_removed` outcome, or the last one `objectDeleted: false` and its wait passed). Its run is
 * queued the same way; the run finds the row INFECTED and only finishes the removal
 * ({@link finishInfectedRemoval}), which decides again under the row lock.
 */
export async function sweepUnscannedEvidence(
  options: { now?: Date; runTenant?: TenantRunner; enqueue?: EvidenceScanDeps['enqueue']; tenantIds?: readonly string[] } = {}
): Promise<EvidenceScanSweepResult> {
  const now = options.now ?? new Date();
  const runTenant: TenantRunner = options.runTenant ?? ((id, cb) => withTenant(id, cb));
  const enqueue = options.enqueue ?? enqueueEvidenceScan;
  const pendingBefore = new Date(now.getTime() - EVIDENCE_SCAN_SWEEP_PENDING_AFTER_MS);
  const errorBefore = new Date(now.getTime() - EVIDENCE_SCAN_SWEEP_ERROR_AFTER_MS);
  const out: EvidenceScanSweepResult = { tenants: 0, tenantsFailed: 0, queued: 0, notQueued: 0, removalsQueued: 0 };

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
        // Page through the whole tenant (NG-239 Ö-4): one page per tick left a tenant with
        // thousands of files from before NG-239 undownloadable for hours.
        let after = '';
        for (;;) {
          const due = await runTenant(tenantId, (tx) =>
            tx.evidence.findMany({
              where: {
                tenantId,
                id: { gt: after },
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
          if (due.length < EVIDENCE_SCAN_SWEEP_PAGE) break;
          after = due[due.length - 1]!.id;
        }
        await sweepInfectedRemovals(tenantId, now, runTenant, enqueue, out);
      } catch {
        out.tenantsFailed++;
      }
    }
    if (tenants.length < EVIDENCE_SCAN_SWEEP_PAGE) break;
    cursor = tenants[tenants.length - 1]!.id;
  }
  return out;
}

/**
 * NG-279: one tenant's INFECTED rows that still name an object, page by page, with their recorded
 * removal outcomes; the run of each one whose removal is due is queued. Infected files are rare, so
 * reading their history here costs little; a row whose last outcome is a deletion is never queued.
 */
async function sweepInfectedRemovals(
  tenantId: string,
  now: Date,
  runTenant: TenantRunner,
  enqueue: NonNullable<EvidenceScanDeps['enqueue']>,
  out: EvidenceScanSweepResult
): Promise<void> {
  let after = '';
  for (;;) {
    const page = await runTenant(tenantId, async (tx) => {
      const rows = await tx.evidence.findMany({
        where: { tenantId, id: { gt: after }, scanStatus: 'INFECTED', r2ObjectKey: { not: null } },
        select: { id: true, scanAttempts: true },
        orderBy: { id: 'asc' },
        take: EVIDENCE_SCAN_SWEEP_PAGE,
      });
      const events = rows.length
        ? await tx.auditEvent.findMany({
            where: { tenantId, type: EVIDENCE_SCAN_AUDIT_OBJECT_REMOVED, target: { in: rows.map((r) => r.id) } },
            select: { target: true, data: true, createdAt: true },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          })
        : [];
      return { rows, events };
    });
    for (const row of page.rows) {
      const attempts = page.events.filter((e) => e.target === row.id).map(attemptOf);
      if (!objectRemovalDecision(attempts, now).due) continue;
      if (await enqueue({ tenantId, evidenceId: row.id, attempt: row.scanAttempts })) {
        out.queued++;
        out.removalsQueued++;
      } else out.notQueued++;
    }
    if (page.rows.length < EVIDENCE_SCAN_SWEEP_PAGE) break;
    after = page.rows[page.rows.length - 1]!.id;
  }
}
