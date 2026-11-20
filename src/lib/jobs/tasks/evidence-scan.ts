import { z } from 'zod';
import { defineJob } from '../define';
import { scanEvidence, sweepUnscannedEvidence } from '@/lib/evidence-scan';
import { recordAlert } from '@/lib/observability/system-alert';

/**
 * NG-239 — one virus-scan attempt of one evidence file (src/lib/evidence-scan.ts).
 * Queued by the upload, by a failed attempt (with a wait) and by the sweep; never
 * on a cron. A clamd failure is not a thrown error: it is written as ERROR and
 * retried by its own chain. Only a database error throws, and the queue retries that.
 */
const EvidenceScanPayload = z.object({
  tenantId: z.string().min(1),
  evidenceId: z.string().min(1),
  attempt: z.number().int().min(0),
});

export const evidenceScanTask = defineJob('evidence-scan', async ({ payload }) => {
  const run = EvidenceScanPayload.parse(payload);
  return { ...(await scanEvidence(run)), attempt: run.attempt };
});

/** NG-239 — every 15 minutes: a scan for every stored file that has none in flight. */
export const evidenceScanSweepTask = defineJob('evidence-scan-sweep', async ({ tick }) => {
  const r = await sweepUnscannedEvidence({ now: tick ?? new Date() });
  if (r.tenantsFailed > 0 || r.notQueued > 0) {
    // Counts only: SystemAlert has no tenant isolation (NG-85 F1).
    await recordAlert({
      level: 'warn',
      source: 'evidence-scan',
      message: `Evidence scan sweep: ${r.tenantsFailed} of ${r.tenants} tenants failed, ${r.notQueued} scans not queued`,
      meta: { ...r },
      dedupeKey: 'evidence-scan:sweep-failed',
    });
  }
  return r;
});
