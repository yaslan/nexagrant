'use server';

import { revalidatePath } from 'next/cache';
import { withTenant } from '@/lib/db';
import { assertModuleAccess } from '@/lib/modules/access';
import { requireTenantAction } from '@/lib/tenant';
import { promptLocale } from '@/lib/ai/prompts/locale';
import {
  applyEnrichment,
  loadEnrichmentSubject,
  proposeEnrichment,
  type EnrichmentProposal,
} from '@/modules/m18/server/enrichment';
import {
  approveEligibilityReport,
  draftEligibilityReport,
  eligibilityRequestSchema,
  loadEligibilitySubject,
  reportIdSchema,
  saveEligibilityDraft,
} from '@/modules/m18/server/eligibility';
import { z } from 'zod';

/**
 * M18-F5 (NG-136) AI actions on the lead detail screen. Each one: module gate → session +
 * writable + `client_pipeline_write` (every AI action spends the tenant's credits, so none is a
 * read) → tenant-bound repo call. The model is reached only through src/lib/llm.ts, OUTSIDE the
 * tenant transaction (llm.ts takes its own for the credit lock).
 *
 * Nothing the model writes is stored without a person: enrichment returns a proposal and writes
 * only on `applyEnrichmentAction`; the eligibility pre-report is saved as a DRAFT and leaves M18
 * only after `approveEligibilityReportAction`.
 */

export type AiActionCode =
  | 'INVALID'
  | 'NOT_FOUND'
  | 'NO_WEBSITE'
  | 'SITE_UNAVAILABLE'
  | 'BAD_ANSWER'
  | 'NO_CREDITS'
  | 'FAILED';
export type AiActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; code: AiActionCode };

function failure(e: unknown): { ok: false; code: AiActionCode } {
  const name = (e as { name?: string } | null)?.name;
  if (name === 'ZodError') return { ok: false, code: 'INVALID' };
  // llm.ts refuses before the provider when the balance cannot cover the price (FO-288).
  if (e instanceof Error && /Insufficient AI credits/.test(e.message)) return { ok: false, code: 'NO_CREDITS' };
  return { ok: false, code: 'FAILED' };
}

const organizationIdSchema = z.object({ organizationId: z.string().min(1).max(64) });

export type EnrichmentProposalData = { proposal: EnrichmentProposal; fetchedUrls: string[] };

/** Reads ≤5 pages of the organisation's website and returns a proposal. Writes nothing to the record. */
export async function proposeEnrichmentAction(input: unknown): Promise<AiActionResult<EnrichmentProposalData>> {
  try {
    await assertModuleAccess('M18');
    const scope = await requireTenantAction({ can: 'client_pipeline_write' });
    const { organizationId } = organizationIdSchema.parse(input);
    const org = await withTenant(scope.tenantId, (tx) => loadEnrichmentSubject(tx, scope.tenantId, organizationId));
    if (!org) return { ok: false, code: 'NOT_FOUND' };
    const result = await proposeEnrichment({ tenantId: scope.tenantId, userId: scope.userId, org, locale: await promptLocale() });
    if (!result.ok) return { ok: false, code: result.code };
    return { ok: true, data: { proposal: result.proposal, fetchedUrls: result.fetchedUrls } };
  } catch (e) {
    return failure(e);
  }
}

/** Writes only the proposal fields the user ticked. */
export async function applyEnrichmentAction(input: unknown): Promise<AiActionResult> {
  try {
    await assertModuleAccess('M18');
    const scope = await requireTenantAction({ can: 'client_pipeline_write' });
    const applied = await withTenant(scope.tenantId, (tx) => applyEnrichment(tx, scope.tenantId, input));
    if (!applied) return { ok: false, code: 'NOT_FOUND' };
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

/** Generates the internal eligibility pre-report and saves it as a DRAFT. */
export async function generateEligibilityReportAction(input: unknown): Promise<AiActionResult<{ id: string }>> {
  try {
    await assertModuleAccess('M18');
    const scope = await requireTenantAction({ can: 'client_pipeline_write' });
    const { organizationId, callId } = eligibilityRequestSchema.parse(input);
    const subject = await withTenant(scope.tenantId, (tx) =>
      loadEligibilitySubject(tx, scope.tenantId, organizationId, callId),
    );
    if (!subject) return { ok: false, code: 'NOT_FOUND' };
    const locale = await promptLocale();
    const draft = await draftEligibilityReport({ tenantId: scope.tenantId, userId: scope.userId, subject, locale });
    const saved = await withTenant(scope.tenantId, (tx) =>
      saveEligibilityDraft(tx, scope.tenantId, { organizationId, callId, userId: scope.userId, locale, draft }),
    );
    revalidatePath('/', 'layout');
    return { ok: true, data: { id: saved.id } };
  } catch (e) {
    return failure(e);
  }
}

/** DRAFT → APPROVED by the signed-in user: from now on the report may leave M18. */
export async function approveEligibilityReportAction(input: unknown): Promise<AiActionResult> {
  try {
    await assertModuleAccess('M18');
    const scope = await requireTenantAction({ can: 'client_pipeline_write' });
    const { reportId } = reportIdSchema.parse(input);
    const approved = await withTenant(scope.tenantId, (tx) =>
      approveEligibilityReport(tx, scope.tenantId, reportId, scope.userId),
    );
    if (!approved) return { ok: false, code: 'NOT_FOUND' };
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}
