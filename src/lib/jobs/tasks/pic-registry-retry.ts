import { z } from 'zod';
import { prisma } from '@/lib/db';
import { defineJob } from '../define';
import { PIC_REGISTRY_RETRY_WAITS_MS, refreshTenantPicRegistry } from '@/lib/pic-registry-refresh';
import { rescoreTenantG0AfterPicChange } from '@/lib/scoring/g0-rescore-tenant';

/**
 * FO-396 — one retry of a PIC register lookup that did not reach the EU register (timeout, network,
 * HTTP error). Queued by `refreshTenantPicRegistry` with a wait of `PIC_REGISTRY_RETRY_WAITS_MS`,
 * never on a cron.
 *
 * It does nothing when the tenant no longer holds the PIC (a newer change has its own lookup), or the
 * stored answer is already final. A final answer (FOUND or NOT_FOUND) triggers the G0 rescore, because
 * FOUND changes the no-history grant. Another failure queues the next attempt until the chain runs out.
 */
const PicRegistryRetryPayload = z.object({
  tenantId: z.string().min(1),
  pic: z.string().regex(/^\d{9}$/),
  auditEventId: z.string().min(1),
  attempt: z.number().int().min(1).max(PIC_REGISTRY_RETRY_WAITS_MS.length),
});

export const picRegistryRetryTask = defineJob('pic-registry-retry', async ({ payload }) => {
  const run = PicRegistryRetryPayload.parse(payload);
  const current = await prisma.tenant.findUnique({
    where: { id: run.tenantId },
    select: { pic: true, picRegistryStatus: true },
  });
  if (!current || current.pic !== run.pic) return { skipped: 'pic_changed', attempt: run.attempt };
  if (current.picRegistryStatus === 'FOUND' || current.picRegistryStatus === 'NOT_FOUND') {
    return { skipped: 'already_final', attempt: run.attempt };
  }

  const outcome = await refreshTenantPicRegistry(run.tenantId, run.pic, {}, {
    auditEventId: run.auditEventId,
    attempt: run.attempt,
  });
  if (!outcome || !outcome.stored) return { skipped: 'pic_changed', attempt: run.attempt };
  if (outcome.status !== 'UNKNOWN') {
    await rescoreTenantG0AfterPicChange(run.tenantId, { trigger: 'tenant_saved', auditEventId: run.auditEventId });
  }
  return { status: outcome.status, reason: outcome.reason, attempt: run.attempt };
});
