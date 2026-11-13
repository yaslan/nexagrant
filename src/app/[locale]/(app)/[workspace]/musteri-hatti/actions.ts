'use server';

import { revalidatePath } from 'next/cache';
import { withTenant } from '@/lib/db';
import { assertModuleAccess } from '@/lib/modules/access';
import { requireTenantAction } from '@/lib/tenant';
import { createLead, type CreateLeadResult } from '@/modules/m18/server/leads-repo';
import { createDeal, DealTransitionError, moveDealStage } from '@/modules/m18/server/deals-repo';
import { createTask, setTaskDone } from '@/modules/m18/server/tasks-repo';
import { commitImport, previewImport } from '@/modules/m18/server/import-leads';
import {
  IMPORT_MAX_CHARS,
  parseCsvText,
  suggestMapping,
  type ColumnMapping,
} from '@/modules/m18/server/import-csv';
import { z } from 'zod';

type PreviewData = Awaited<ReturnType<typeof previewImport>> & { mapping: ColumnMapping };
type CommitData = Awaited<ReturnType<typeof commitImport>>;

/**
 * Server actions for the M18 Müşteri Satış Hattı screens (NG-135 / F3).
 * Each action: module gate → session + writable + `client_pipeline_write` role → tenant-bound
 * repo call. The tenant comes from the session only; nothing tenant-shaped is read from the form.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; code: 'INVALID' | 'NOT_FOUND' | 'DUPLICATE' | 'TRANSITION' | 'FAILED' };

async function guarded<T>(
  fn: (tenantId: string, userId: string | null) => Promise<T>,
  can: 'client_pipeline_read' | 'client_pipeline_write' = 'client_pipeline_write',
): Promise<T> {
  await assertModuleAccess('M18');
  const scope = await requireTenantAction({ can });
  return fn(scope.tenantId, scope.userId ?? null);
}

function invalidOrFailed(e: unknown): { ok: false; code: 'INVALID' | 'FAILED' } {
  // Zod errors come from the repo's parse calls, CSV errors from the import; the rest is infrastructure.
  const name = (e as { name?: string } | null)?.name;
  return { ok: false, code: name === 'ZodError' || name === 'CsvImportError' ? 'INVALID' : 'FAILED' };
}

const importRequestSchema = z.object({
  csv: z.string().min(1).max(IMPORT_MAX_CHARS),
  mapping: z
    .object({
      name: z.string().max(200).optional(),
      legalName: z.string().max(200).optional(),
      provinceCode: z.string().max(200).optional(),
      website: z.string().max(200).optional(),
      sizeBand: z.string().max(200).optional(),
    })
    .optional(),
});

/** Preview: parse, map and count. Reads only, so it needs the read role. */
export async function importPreviewAction(input: unknown): Promise<ActionResult<PreviewData>> {
  try {
    return await guarded(async (tenantId) => {
      const req = importRequestSchema.parse(input);
      const csv = parseCsvText(req.csv);
      const mapping = req.mapping ?? suggestMapping(csv.headers);
      const result = await withTenant(tenantId, (tx) => previewImport(tx, tenantId, req.csv, mapping));
      return { ok: true, data: { ...result, mapping } } as const;
    }, 'client_pipeline_read');
  } catch (e) {
    return invalidOrFailed(e);
  }
}

/** Commit: the same plan as the preview, re-computed on the server, then written in one tenant transaction. */
export async function importCommitAction(input: unknown): Promise<ActionResult<CommitData>> {
  try {
    return await guarded(async (tenantId, userId) => {
      const req = importRequestSchema.parse(input);
      const csv = parseCsvText(req.csv);
      const mapping = req.mapping ?? suggestMapping(csv.headers);
      const result = await withTenant(tenantId, (tx) => commitImport(tx, tenantId, req.csv, mapping, userId));
      revalidatePath('/', 'layout');
      return { ok: true, data: result } as const;
    });
  } catch (e) {
    return invalidOrFailed(e);
  }
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
