import { prisma } from '@/lib/db';
import { resolveAlerts } from '@/lib/observability/system-alert';
import { generatePartnerProfiles, type PartnerProfileJobResult } from '@/lib/k2-cordis/partnerProfileJob';

/**
 * The partner-profile step that follows the CORDIS import (NG-237).
 *
 * Four entry points run the import and then the profiles: the monthly job, the
 * `scripts/cordis-import.ts` CLI, the admin server action and the admin API
 * route. They all go through `runPartnerProfileStep`, so the "unchanged dump"
 * rule lives in one place.
 *
 * The rule: an unchanged dump skips the import ("Zaten güncel", NG-224), and the
 * profiles built from it are then left alone, unless the last profile build
 * failed and its alert is still open. Without that check a failed profile step
 * would stay stale until the next CORDIS release, while its alert told the
 * operator to re-run the script that then did nothing.
 */

/** Source of the monthly job's alerts (`k2-monthly-cordis.ts`). */
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

/**
 * Run the profile step after an import. Returns `null` when there is nothing to
 * do (the dump is unchanged and no profile failure is owed). Throws when the
 * profile build fails; each caller decides how to report that. A successful
 * build closes the profile-failure alert.
 */
export async function runPartnerProfileStep(
  importSkipped: boolean,
  _context?: { runId: string; meta?: Record<string, unknown> }
): Promise<PartnerProfileJobResult | null> {
  if (importSkipped && !(await partnerProfilesOwed())) return null;
  const profiles = await generatePartnerProfiles();
  await closeK2Alert(PROFILES_FAILED_KEY);
  return profiles;
}
