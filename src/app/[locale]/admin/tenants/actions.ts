'use server';

/**
 * Server actions for the platform tenant console.
 *
 * `assignInternalPlanAction` gives a tenant a plan without a payment
 * (TASK-MVCH26OXNVLKR). The data rules — catalogue plans only, refused over a
 * paying, pilot or contract subscription, audited, protected from Stripe sync —
 * are in src/lib/billing/internal-plan.ts; this file is the authorisation and
 * validation edge. Failures come back as a listed code, never as text.
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/tenant';
import { logger } from '@/lib/logger';
import { assignInternalPlan, INTERNAL_PLAN_CHOICES, type AssignInternalPlanResult } from '@/lib/billing/internal-plan';
import { tenantFailureCode, type TenantFailureCode } from './failure-codes';

export type TenantActionResult<T> = { ok: true; data: T } | { ok: false; code: TenantFailureCode };

const assignSchema = z.object({
  tenantId: z.string().min(1).max(64),
  planId: z.enum(INTERNAL_PLAN_CHOICES),
  note: z.string().trim().min(1).max(500),
});

/**
 * What the browser learns about a failure: a listed code, no text (as
 * admin/billing/plans `planFailure`). A refusal is logged as a warning; anything
 * else is a fault and its whole error goes to the log.
 */
function tenantFailure(e: unknown, action: string): { ok: false; code: TenantFailureCode } {
  const code = tenantFailureCode(e);
  if (code === 'UNKNOWN') logger.error(`[admin/tenants] ${action} failed`, e);
  else logger.warn(`[admin/tenants] ${action} refused`, { code });
  return { ok: false, code };
}

export async function assignInternalPlanAction(input: {
  tenantId: string;
  planId: string;
  note: string;
}): Promise<TenantActionResult<AssignInternalPlanResult>> {
  try {
    const { userId } = await requirePlatformAdmin();
    const parsed = assignSchema.safeParse(input);
    if (!parsed.success) {
      const noteMissing = parsed.error.issues.some((issue) => issue.path[0] === 'note');
      return { ok: false, code: noteMissing ? 'NOTE_REQUIRED' : 'INVALID_INPUT' };
    }
    const { tenantId, planId, note } = parsed.data;
    const result = await assignInternalPlan(tenantId, planId, userId, note);
    revalidatePath('/[locale]/admin/tenants', 'page');
    revalidatePath('/[locale]/admin/tenants/[tenantId]', 'page');
    return { ok: true, data: result };
  } catch (e) {
    return tenantFailure(e, 'assignInternalPlan');
  }
}
