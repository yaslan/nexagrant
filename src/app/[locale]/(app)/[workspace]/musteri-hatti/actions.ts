'use server';

import { revalidatePath } from 'next/cache';
import { withTenant } from '@/lib/db';
import { assertModuleAccess } from '@/lib/modules/access';
import { requireTenantAction } from '@/lib/tenant';
import { createLead, type CreateLeadResult } from '@/modules/m18/server/leads-repo';
import { createDeal, DealTransitionError, moveDealStage } from '@/modules/m18/server/deals-repo';
import { createTask, setTaskDone } from '@/modules/m18/server/tasks-repo';

/**
 * Server actions for the M18 Müşteri Satış Hattı screens (NG-135 / F3).
 * Each action: module gate → session + writable + `client_pipeline_write` role → tenant-bound
 * repo call. The tenant comes from the session only; nothing tenant-shaped is read from the form.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; code: 'INVALID' | 'NOT_FOUND' | 'DUPLICATE' | 'TRANSITION' | 'FAILED' };

async function guarded<T>(fn: (tenantId: string, userId: string | null) => Promise<T>): Promise<T> {
  await assertModuleAccess('M18');
  const scope = await requireTenantAction({ can: 'client_pipeline_write' });
  return fn(scope.tenantId, scope.userId ?? null);
}

function invalidOrFailed(e: unknown): { ok: false; code: 'INVALID' | 'FAILED' } {
  // Zod errors come from the repo's parse calls; everything else is an infrastructure failure.
  const name = (e as { name?: string } | null)?.name;
  return { ok: false, code: name === 'ZodError' ? 'INVALID' : 'FAILED' };
}

export async function createLeadAction(input: unknown): Promise<ActionResult<CreateLeadResult>> {
  try {
    return await guarded(async (tenantId, userId) => {
      const result = await withTenant(tenantId, (tx) => createLead(tx, tenantId, input, userId));
      if (result.status === 'duplicate') return { ok: false, code: 'DUPLICATE' } as const;
      revalidatePath('/', 'layout');
      return { ok: true, data: result } as const;
    });
  } catch (e) {
    return invalidOrFailed(e);
  }
}

export async function createDealAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    return await guarded(async (tenantId, userId) => {
      const created = await withTenant(tenantId, (tx) => createDeal(tx, tenantId, input, userId));
      if (!created) return { ok: false, code: 'NOT_FOUND' } as const;
      revalidatePath('/', 'layout');
      return { ok: true, data: created } as const;
    });
  } catch (e) {
    return invalidOrFailed(e);
  }
}

export async function moveDealStageAction(input: unknown): Promise<ActionResult> {
  try {
    return await guarded(async (tenantId, userId) => {
      const moved = await withTenant(tenantId, (tx) => moveDealStage(tx, tenantId, input, userId));
      if (!moved) return { ok: false, code: 'NOT_FOUND' } as const;
      revalidatePath('/', 'layout');
      return { ok: true } as const;
    });
  } catch (e) {
    if (e instanceof DealTransitionError) return { ok: false, code: 'TRANSITION' };
    return invalidOrFailed(e);
  }
}

export async function createTaskAction(input: unknown): Promise<ActionResult> {
  try {
    return await guarded(async (tenantId) => {
      const created = await withTenant(tenantId, (tx) => createTask(tx, tenantId, input));
      if (!created) return { ok: false, code: 'NOT_FOUND' } as const;
      revalidatePath('/', 'layout');
      return { ok: true } as const;
    });
  } catch (e) {
    return invalidOrFailed(e);
  }
}

export async function setTaskDoneAction(input: unknown): Promise<ActionResult> {
  try {
    return await guarded(async (tenantId) => {
      const updated = await withTenant(tenantId, (tx) => setTaskDone(tx, tenantId, input));
      if (!updated) return { ok: false, code: 'NOT_FOUND' } as const;
      revalidatePath('/', 'layout');
      return { ok: true } as const;
    });
  } catch (e) {
    return invalidOrFailed(e);
  }
}
