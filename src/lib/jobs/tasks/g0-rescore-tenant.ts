import { z } from 'zod';
import { defineJob } from '../define';
import { rescoreTenantG0AfterPicChange } from '@/lib/scoring/g0-rescore-tenant';

/**
 * FO-384 B2 — the rest of a G0 rescore after a PIC change that did not fit in one request's budget.
 *
 * Queued by `rescoreTenantG0AfterPicChange` (enqueueJob, key per change and cursor). It resumes
 * after `afterId`, and queues the next continuation itself if its budget ends first. It has no
 * cron: a PIC change is the only thing that queues it. A thrown error (a failed queue write) is
 * retried by the queue and ends as a `job-queue` alert.
 */
const G0RescoreTenantPayload = z.object({
  tenantId: z.string().min(1),
  trigger: z.enum(['tenant_saved', 'tenant_cleared', 'admin_removed']),
  auditEventId: z.string().min(1),
  afterId: z.string().min(1).optional(),
});

export const g0RescoreTenantTask = defineJob('g0-rescore-tenant', async ({ payload }) => {
  const run = G0RescoreTenantPayload.parse(payload);
  return rescoreTenantG0AfterPicChange(run.tenantId, run);
});
