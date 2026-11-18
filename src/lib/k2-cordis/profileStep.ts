import { prisma } from '@/lib/db';
import { errorMessage } from '@/lib/errors';
import { recordAlert, resolveAlerts } from '@/lib/observability/system-alert';
import { generatePartnerProfiles, type PartnerProfileJobResult } from '@/lib/k2-cordis/partnerProfileJob';

/**
 * The partner-profile step that follows the CORDIS import (NG-237).
 *
 * Four entry points run the import and then the profiles: the monthly job, the
 * `scripts/cordis-import.ts` CLI, the admin server action and the admin API
 * route. They all go through `runPartnerProfileStep`, so the "unchanged dump"
 * rule and the profile-failure alert live in one place.
 *
 * The rule: an unchanged dump skips the import ("Zaten güncel", NG-224), and the
 * profiles built from it are then left alone, unless the last profile build
 * failed and its alert is still open. Without that check a failed profile step
 * would stay stale until the next CORDIS release, while its alert told the
 * operator to re-run an import that then did nothing.
 */

/** Source of the CORDIS import alerts written by the monthly job and this step. */
export const K2_ALERT_SOURCE = 'k2_monthly_cordis';

/** Dedupe key of the alert raised when the profile step fails after an import. */
export const PROFILES_FAILED_KEY = 'k2:partner-profiles-failed';

/** Whether an open profile-failure alert exists. Its meta carries the dedupe key (see `buildAlertRow`). */
export async function partnerProfilesOwed(): Promise<boolean> {
  const open = await prisma.systemAlert.findMany({
    where: { source: K2_ALERT_SOURCE, resolvedAt: null },
    select: { meta: true },
  });
  return open.some((row) => {
    const meta = row.meta;
    return typeof meta === 'object' && meta !== null && !Array.isArray(meta)
      ? (meta as Record<string, unknown>)['alertDedupeKey'] === PROFILES_FAILED_KEY
      : false;
  });
}

/** Close the open alert(s) of the monthly job with this dedupe key. Never throws (see `resolveAlerts`). */
export async function closeK2Alert(dedupeKey: string): Promise<void> {
  await resolveAlerts({ source: K2_ALERT_SOURCE, meta: { alertDedupeKey: dedupeKey } });
}

/** The import the profile step belongs to: its run row and its dataset, for the alert text. */
export interface ProfileStepContext {
  runId: string;
  dataset: string;
  /** Extra detail for the alert row, e.g. the month of a monthly run. */
  meta?: Record<string, unknown>;
}

/**
 * Run the profile step after an import. Returns `null` when there is nothing to
 * do (the dump is unchanged and no profile failure is owed).
 *
 * A failed profile build raises the profile-failure alert here, on every entry
 * point, and then throws the original error again, so each caller still sees
 * the failure (the monthly job turns it into its result; the admin action,
 * route and CLI let it reach the user or the log). A successful build closes
 * the alert.
 */
export async function runPartnerProfileStep(
  importSkipped: boolean,
  context: ProfileStepContext
): Promise<PartnerProfileJobResult | null> {
  if (importSkipped && !(await partnerProfilesOwed())) return null;

  let profiles: PartnerProfileJobResult;
  try {
    profiles = await generatePartnerProfiles();
  } catch (error) {
    const detail = errorMessage(error, String(error));
    // The import itself succeeded (its run row is SUCCESS); only the profiles are missing.
    // The alert keeps the next run with the same dump owed: it rebuilds them and closes this alert.
    await recordAlert({
      level: 'error',
      source: K2_ALERT_SOURCE,
      message:
        `CORDIS ${context.dataset} imported (run ${context.runId}) but the partner profiles failed: ` +
        `${detail.slice(0, 500)}. The import succeeded; the profiles are still owed. ` +
        `Run the import again: an unchanged dump rebuilds the profiles while this alert is open.`,
      meta: { runId: context.runId, dataset: context.dataset, ...context.meta },
      dedupeKey: PROFILES_FAILED_KEY,
    });
    throw error;
  }

  await closeK2Alert(PROFILES_FAILED_KEY);
  return profiles;
}
