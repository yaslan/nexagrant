'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { withTenant } from '@/lib/db';
import { assertModuleAccess } from '@/lib/modules/access';
import { requireTenantAction } from '@/lib/tenant';
import { createLead, type CreateLeadResult } from '@/modules/m18/server/leads-repo';
import { createDeal, DealTransitionError, moveDealStage } from '@/modules/m18/server/deals-repo';
import { createTask, setTaskDone } from '@/modules/m18/server/tasks-repo';
import { commitImport, previewImport } from '@/modules/m18/server/import-leads';
import { mergeLeadOrganizations, type MergeResult } from '@/modules/m18/server/merge-leads';
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
 *
 * Each action: module gate → session + writable + `client_pipeline_write` role → tenant-bound
 * repo call. The tenant comes from the session only; nothing tenant-shaped is read from the form.
 *
 * Every action states its own gate and role check inline (`assertModuleAccess` and
 * `requireTenantAction({ can: '<permission>' })`), so the check is visible where the action is
 * read and tests/server-action-rbac-guard.test.ts can verify it statically.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; code: 'INVALID' | 'NOT_FOUND' | 'DUPLICATE' | 'TRANSITION' | 'FAILED' };

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
    await assertModuleAccess('M18');
    const scope = await requireTenantAction({ can: 'client_pipeline_read' });
    const req = importRequestSchema.parse(input);
    const csv = parseCsvText(req.csv);
    const mapping = req.mapping ?? suggestMapping(csv.headers);
    const result = await withTenant(scope.tenantId, (tx) => previewImport(tx, scope.tenantId, req.csv, mapping));
    return { ok: true, data: { ...result, mapping } } as const;
  } catch (e) {
    return invalidOrFailed(e);
  }
}

/** Commit: the same plan as the preview, re-computed on the server, then written in one tenant transaction. */
export async function importCommitAction(input: unknown): Promise<ActionResult<CommitData>> {
  try {
    await assertModuleAccess('M18');
    const scope = await requireTenantAction({ can: 'client_pipeline_write' });
    const req = importRequestSchema.parse(input);
    const csv = parseCsvText(req.csv);
    const mapping = req.mapping ?? suggestMapping(csv.headers);
    const result = await withTenant(scope.tenantId, (tx) =>
      commitImport(tx, scope.tenantId, req.csv, mapping, scope.userId ?? null)
    );
    revalidatePath('/', 'layout');
    return { ok: true, data: result } as const;
  } catch (e) {
    return invalidOrFailed(e);
  }
}

export async function createLeadAction(input: unknown): Promise<ActionResult<CreateLeadResult>> {
  try {
    await assertModuleAccess('M18');
    const scope = await requireTenantAction({ can: 'client_pipeline_write' });
    const result = await withTenant(scope.tenantId, (tx) =>
      createLead(tx, scope.tenantId, input, scope.userId ?? null)
    );
    if (result.status === 'duplicate') return { ok: false, code: 'DUPLICATE' } as const;
    revalidatePath('/', 'layout');
    return { ok: true, data: result } as const;
  } catch (e) {
    return invalidOrFailed(e);
  }
}

export async function createDealAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    await assertModuleAccess('M18');
    const scope = await requireTenantAction({ can: 'client_pipeline_write' });
    const created = await withTenant(scope.tenantId, (tx) =>
      createDeal(tx, scope.tenantId, input, scope.userId ?? null)
    );
    if (!created) return { ok: false, code: 'NOT_FOUND' } as const;
    revalidatePath('/', 'layout');
    return { ok: true, data: created } as const;
  } catch (e) {
    return invalidOrFailed(e);
  }
}

export async function moveDealStageAction(input: unknown): Promise<ActionResult> {
  try {
    await assertModuleAccess('M18');
    const scope = await requireTenantAction({ can: 'client_pipeline_write' });
    const locale = await getLocale();
    const moved = await withTenant(scope.tenantId, (tx) =>
      moveDealStage(tx, scope.tenantId, input, scope.userId ?? null, locale)
    );
    if (!moved) return { ok: false, code: 'NOT_FOUND' } as const;
    revalidatePath('/', 'layout');
    return { ok: true } as const;
  } catch (e) {
    if (e instanceof DealTransitionError) return { ok: false, code: 'TRANSITION' };
    return invalidOrFailed(e);
  }
}

export async function createTaskAction(input: unknown): Promise<ActionResult> {
  try {
    await assertModuleAccess('M18');
    const scope = await requireTenantAction({ can: 'client_pipeline_write' });
    const created = await withTenant(scope.tenantId, (tx) => createTask(tx, scope.tenantId, input));
    if (!created) return { ok: false, code: 'NOT_FOUND' } as const;
    revalidatePath('/', 'layout');
    return { ok: true } as const;
  } catch (e) {
    return invalidOrFailed(e);
  }
}

export async function setTaskDoneAction(input: unknown): Promise<ActionResult> {
  try {
    await assertModuleAccess('M18');
    const scope = await requireTenantAction({ can: 'client_pipeline_write' });
    const updated = await withTenant(scope.tenantId, (tx) => setTaskDone(tx, scope.tenantId, input));
    if (!updated) return { ok: false, code: 'NOT_FOUND' } as const;
    revalidatePath('/', 'layout');
    return { ok: true } as const;
  } catch (e) {
    return invalidOrFailed(e);
  }
}

export async function mergeLeadsAction(input: unknown): Promise<ActionResult<MergeResult>> {
  try {
    await assertModuleAccess('M18');
    const scope = await requireTenantAction({ can: 'client_pipeline_write' });
    const merged = await withTenant(scope.tenantId, (tx) => mergeLeadOrganizations(tx, scope.tenantId, input, new Date(), scope.userId));
    if (!merged) return { ok: false, code: 'NOT_FOUND' } as const;
    revalidatePath('/', 'layout');
    return { ok: true, data: merged } as const;
  } catch (e) {
    return invalidOrFailed(e);
  }
}
