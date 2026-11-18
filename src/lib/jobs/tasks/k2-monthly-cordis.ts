import v8 from 'node:v8';
import { defineJob, monthOf } from '../define';
import { errorMessage } from '@/lib/errors';
import { recordAlert } from '@/lib/observability/system-alert';
import { runCordisImport, type CordisImportResult } from '@/lib/k2-cordis/importer';
import type { PartnerProfileJobResult } from '@/lib/k2-cordis/partnerProfileJob';
import { K2_ALERT_SOURCE, closeK2Alert, runPartnerProfileStep } from '@/lib/k2-cordis/profileStep';
import { K2MonthlyCordisOutputSchema, type K2MonthlyCordisOutput } from '../events';

/**
 * Heap (MB) the in-process import is allowed to start with.
 *
 * The full HORIZON import peaked at ~4.4 GB RSS on 2026-11-17 (NG-211) and was
 * run with `--max-old-space-size=6144`, the only setting it is proven under.
 * Node's own default on a 64-bit machine is ~4 GB. Running out of heap is not
 * an exception the job can catch: V8 aborts the whole worker process, every
 * other job in flight with it, and the queue retries the import into the same
 * wall. So below this floor the job does not start; it alerts instead.
 */
export const K2_MIN_HEAP_MB = 6144;

/** The dataset the monthly refresh imports. H2020 is closed; its dump no longer changes. */
const MONTHLY_DATASET = 'HORIZON' as const;

const SOURCE = K2_ALERT_SOURCE;

/** Dedupe key of the alert for a worker whose heap is below `K2_MIN_HEAP_MB`. */
const HEAP_ALERT_KEY = 'k2:heap-too-small';

/** `YYYY-MM` for the month a run belongs to. */
function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function heapLimitMb(): number {
  return Math.floor(v8.getHeapStatistics().heap_size_limit / (1024 * 1024));
}

export interface K2MonthlyCordisOptions {
  /** `YYYY-MM`; defaults to the current UTC month. A label for the run: the dump is always the latest. */
  month?: string;
}

/**
 * The monthly CORDIS refresh (NG-225): the HORIZON bulk import, then the M1
 * partner profiles built from it — the same two steps `scripts/cordis-import.ts`
 * runs by hand, which is the path that produced a SUCCESS on 2026-11-17.
 *
 * This used to POST to the Python worker's `/jobs/cordis`. That service has no
 * real CORDIS source and answers 500 unless mock data is switched on, so the
 * scheduled refresh never imported anything. `WORKER_URL` / `WORKER_TOKEN` are
 * no longer read here.
 *
 * Split out of the job wrapper so `pnpm jobs:k2` and the unit tests drive the
 * exact same path. CLAUDE.md rule 6 is the importer's: it keeps the archive's
 * `RawFetch` row (keyed on the file hash, so an unchanged dump adds none),
 * skips an archive already fully imported ("Zaten güncel", NG-224), and on a
 * failure writes the `CordisImportRun` row and a `SystemAlert` and returns
 * `success: false`. This function adds an alert only where the importer could
 * not have written one, and never throws: a reported failure is not retried
 * (ADR-0008 §6.3), and a retry of a 20-minute import that failed on data
 * would fail the same way.
 *
 * An unchanged dump skips the import, and the profiles are rebuilt only if an
 * earlier profile build failed and its alert is still open (NG-237, see
 * `profileStep.ts`). A successful import closes the job's heap and import-threw
 * alerts; a successful profile build closes the profile-failure alert.
 */
export async function runK2MonthlyCordis(
  options: K2MonthlyCordisOptions = {}
): Promise<K2MonthlyCordisOutput> {
  const month = options.month ?? currentMonth();

  const heapMb = heapLimitMb();
  if (heapMb < K2_MIN_HEAP_MB) {
    const message =
      `CORDIS import not started: the worker's heap limit is ${heapMb} MB, below the ${K2_MIN_HEAP_MB} MB ` +
      `the full import needs. Start the job worker with NODE_OPTIONS=--max-old-space-size=${K2_MIN_HEAP_MB}.`;
    await recordAlert({
      level: 'error',
      source: SOURCE,
      message,
      meta: { month, heapLimitMb: heapMb, requiredMb: K2_MIN_HEAP_MB },
      // A worker started without the flag stays that way month after month:
      // one row, not one per month.
      dedupeKey: HEAP_ALERT_KEY,
    });
    return K2MonthlyCordisOutputSchema.parse({ success: false, message, month, error: 'HEAP_TOO_SMALL' });
  }

  let imported: CordisImportResult;
  try {
    imported = await runCordisImport({ dataset: MONTHLY_DATASET });
  } catch (error) {
    // The importer throws out only in two cases: it could not write its
    // RUNNING row (database down; no run row and no alert of its own), or
    // removing the temp archive threw after a failure (`removeTempZip` runs
    // once the importer's own failure alert is already written).
    const detail = errorMessage(error, String(error));
    await recordAlert({
      level: 'error',
      source: SOURCE,
      message: `CORDIS ${MONTHLY_DATASET} import could not start: ${detail.slice(0, 500)}`,
      meta: { month, dataset: MONTHLY_DATASET },
      dedupeKey: `k2:cordis-import-threw:${MONTHLY_DATASET}`,
    });
    return K2MonthlyCordisOutputSchema.parse({
      success: false,
      message: 'CORDIS import could not start',
      month,
      error: 'IMPORT_FAILED',
    });
  }

  if (!imported.success) {
    // The importer has written the FAILED run row and its alert
    // (source k2_cordis_import); a second alert here would be the same news.
    return K2MonthlyCordisOutputSchema.parse({
      success: false,
      message: `CORDIS ${MONTHLY_DATASET} import failed (run ${imported.runId})`,
      month,
      runId: imported.runId,
      error: imported.errorCode ?? 'IMPORT_FAILED',
    });
  }

  // The import stage succeeded: its own open alerts are no longer true.
  await closeK2Alert(HEAP_ALERT_KEY);
  await closeK2Alert(`k2:cordis-import-threw:${MONTHLY_DATASET}`);

  const skipped = imported.skipped === true;
  let profiles: PartnerProfileJobResult | null;
  try {
    // Null when the dump is unchanged and no profile failure is owed (NG-237).
    // A failed build raises the profile-failure alert inside the step, for every entry point.
    profiles = await runPartnerProfileStep(skipped, {
      runId: imported.runId,
      dataset: MONTHLY_DATASET,
      meta: { month },
    });
  } catch {
    // The import stage succeeded and its alerts were closed above; the profile alert is open now.
    return K2MonthlyCordisOutputSchema.parse({
      success: false,
      message: `CORDIS ${MONTHLY_DATASET} imported (run ${imported.runId}); partner profiles failed — profile alert open, import alerts closed. Run the import again to rebuild them.`,
      month,
      runId: imported.runId,
      rowCounts: imported.rowCounts,
      error: 'PROFILES_FAILED',
    });
  }

  if (profiles === null) {
    // Same dump as the last full import and its profiles are not owed: nothing changed.
    return K2MonthlyCordisOutputSchema.parse({
      success: true,
      skipped: true,
      message: `CORDIS ${MONTHLY_DATASET} already up to date (Zaten güncel)`,
      month,
      runId: imported.runId,
    });
  }

  return K2MonthlyCordisOutputSchema.parse({
    success: true,
    ...(skipped ? { skipped: true } : {}),
    message: `CORDIS ${MONTHLY_DATASET} imported and partner profiles rebuilt`,
    month,
    runId: imported.runId,
    rowCounts: imported.rowCounts,
    profiles: {
      updatedProfiles: profiles.updatedProfiles,
      updatedCoParticipations: profiles.updatedCoParticipations,
      durationMs: profiles.durationMs,
    },
  });
}

/**
 * K2 Monthly CORDIS Sync — 1st of month, 04:00 UTC.
 * Runs the CORDIS bulk import and the partner profiles in this process.
 * The month is the tick's month (a retried or backfilled run keeps it), or
 * `payload.month` for a run added by hand. Never throws, so the queue never
 * retries it — the same as under the old scheduler (ADR-0008 §6.3).
 */
export const k2MonthlyCordisTask = defineJob('k2-monthly-cordis', async ({ payload, tick }): Promise<K2MonthlyCordisOutput> => {
  const month = typeof payload.month === 'string' ? payload.month : monthOf(tick);
  return runK2MonthlyCordis({ month });
});
