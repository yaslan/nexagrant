import { z } from 'zod';
import type { TenantTx } from '@/lib/db';
import { requireActionId } from '@/lib/required-id';
import { blankFieldsFrom, MERGE_FILL_FIELDS } from './duplicate-pairs';

/**
 * Merge one client organisation into another (NG-135 / F3 phase B). The kept organisation
 * receives the dropped one's contacts, deals (and so their tasks and activities), call
 * matches and eligibility pre-reports; blank fields on the kept row are filled from the dropped one. The dropped row is
 * soft-deleted, so its id still resolves in history.
 */

export const mergeSchema = z
  .object({
    keepId: z.string().min(1),
    dropId: z.string().min(1),
  })
  .refine((v) => v.keepId !== v.dropId, { message: 'same organisation' });
export type MergeInput = z.infer<typeof mergeSchema>;

export interface MergeResult {
  keepId: string;
  moved: { contacts: number; deals: number; matches: number; eligibilityReports: number };
  filledFields: string[];
}

/**
 * Returns null when either organisation is not visible to this tenant (or already deleted).
 * Throws MissingIdError when the tenant or either organisation id is blank: every `where` below
 * runs on ids checked here, so a missing id can never widen a filter to the whole tenant.
 */
export async function mergeLeadOrganizations(
  tx: TenantTx,
  tenantId: string,
  rawInput: unknown,
  now = new Date(),
): Promise<MergeResult | null> {
  requireActionId(tenantId, 'tenantId');
  const input = mergeSchema.parse(rawInput);
  const keepId = requireActionId(input.keepId, 'keepId');
  const dropId = requireActionId(input.dropId, 'dropId');
  const [keep, drop] = await Promise.all([
    tx.leadOrganization.findFirst({ where: { id: keepId, tenantId, deletedAt: null } }),
    tx.leadOrganization.findFirst({ where: { id: dropId, tenantId, deletedAt: null } }),
  ]);
  if (!keep || !drop) return null;

  // A call can match only one row per organisation (unique on tenant × org × call). Matches the
  // kept row already has are dropped from the other side instead of moved into a clash.
  const [keptCalls, droppedMatches] = await Promise.all([
    tx.leadMatch.findMany({ where: { tenantId, organizationId: keepId }, select: { callId: true } }),
    tx.leadMatch.findMany({ where: { tenantId, organizationId: dropId }, select: { id: true, callId: true } }),
  ]);
  const keptCallIds = new Set(keptCalls.map((m) => m.callId));
  for (const clash of droppedMatches.filter((m) => keptCallIds.has(m.callId))) {
    await tx.leadMatch.delete({ where: { id: requireActionId(clash.id, 'leadMatchId') } });
  }

  const matches = await tx.leadMatch.updateMany({
    where: { tenantId, organizationId: dropId },
    data: { organizationId: keepId },
  });
  const contacts = await tx.leadContact.updateMany({
    where: { tenantId, organizationId: dropId },
    data: { organizationId: keepId },
  });
  // Deal tasks and activities hang off the deal, so they follow it without a separate move.
  const deals = await tx.deal.updateMany({
    where: { tenantId, organizationId: dropId },
    data: { organizationId: keepId },
  });

  // M18-F5 (NG-136): the eligibility pre-reports describe the organisation, so they follow it too.
  const eligibilityReports = await tx.leadEligibilityReport.updateMany({
    where: { tenantId, organizationId: dropId },
    data: { organizationId: keepId },
  });

  const patch = blankFieldsFrom(
    Object.fromEntries(MERGE_FILL_FIELDS.map((f) => [f, keep[f]])),
    Object.fromEntries(MERGE_FILL_FIELDS.map((f) => [f, drop[f]])),
  );
  if (Object.keys(patch).length > 0) {
    await tx.leadOrganization.update({ where: { id: keep.id }, data: patch });
  }

  await tx.leadOrganization.update({
    where: { id: drop.id },
    data: { deletedAt: now, deletionReason: `merged into ${keep.id}`, dedupeKey: null },
  });

  return {
    keepId: keep.id,
    moved: { contacts: contacts.count, deals: deals.count, matches: matches.count, eligibilityReports: eligibilityReports.count },
    filledFields: Object.keys(patch),
  };
}
