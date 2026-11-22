import { z } from 'zod';
import type { TenantTx } from '@/lib/db';
import { requireActionId } from '@/lib/required-id';
import { blankFieldsFrom, MERGE_FILL_FIELDS } from './duplicate-pairs';

/**
 * Merge one client organisation into another (NG-135 / F3 phase B). The kept organisation
 * receives the dropped one's contacts, deals (and so their tasks and activities), call
 * matches and eligibility pre-reports; blank fields on the kept row are filled from the dropped one. The dropped row is
 * soft-deleted, so its id still resolves in history.
 *
 * NG-205 (SEC NG-203 D-A1): both rows are locked `FOR UPDATE` in id order before they are read, so
 * two merges of the same pair (A←B and B←A at once) run one after the other; the second re-reads
 * after the first committed, finds its row deleted and returns null. Without it both deleted their
 * drop row and the contacts crossed over. Every merge writes one `lead.merged` AuditEvent (ids and
 * counts only, no names) in the same transaction.
 */

export const LEAD_MERGED_AUDIT = 'lead.merged';

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
  actorId: string | null = null,
): Promise<MergeResult | null> {
  requireActionId(tenantId, 'tenantId');
  const input = mergeSchema.parse(rawInput);
  const keepId = requireActionId(input.keepId, 'keepId');
  const dropId = requireActionId(input.dropId, 'dropId');
  // Lock both rows in id order (ORDER BY sorts before FOR UPDATE locks): two merges of the same
  // pair queue on the first lock instead of deadlocking. A row of another tenant is invisible here (RLS + the tenantId filter), so it is
  // neither locked nor found. The reads below run after the lock, so they see a committed merge.
  await tx.$queryRaw`
    SELECT "id" FROM "LeadOrganization"
     WHERE "tenantId" = ${tenantId} AND "id" IN (${keepId}, ${dropId})
     ORDER BY "id"
       FOR UPDATE`;
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

  const result: MergeResult = {
    keepId: keep.id,
    moved: { contacts: contacts.count, deals: deals.count, matches: matches.count, eligibilityReports: eligibilityReports.count },
    filledFields: Object.keys(patch),
  };
  // Ids, counts and field NAMES only: never the organisation's name or any filled value.
  await tx.auditEvent.create({
    data: {
      tenantId,
      actorId,
      type: LEAD_MERGED_AUDIT,
      target: keep.id,
      data: { keepId: keep.id, dropId: drop.id, moved: result.moved, filledFields: result.filledFields },
    },
  });
  return result;
}
