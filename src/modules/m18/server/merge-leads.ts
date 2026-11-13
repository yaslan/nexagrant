import { z } from 'zod';
import type { TenantTx } from '@/lib/db';
import { blankFieldsFrom, MERGE_FILL_FIELDS } from './duplicate-pairs';

/**
 * Merge one client organisation into another (NG-135 / F3 phase B). The kept organisation
 * receives the dropped one's contacts, deals (and so their tasks and activities) and call
 * matches; blank fields on the kept row are filled from the dropped one. The dropped row is
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
  moved: { contacts: number; deals: number; matches: number };
  filledFields: string[];
}

/** Returns null when either organisation is not visible to this tenant (or already deleted). */
export async function mergeLeadOrganizations(
  tx: TenantTx,
  tenantId: string,
  rawInput: unknown,
  now = new Date(),
): Promise<MergeResult | null> {
  const input = mergeSchema.parse(rawInput);
  const [keep, drop] = await Promise.all([
    tx.leadOrganization.findFirst({ where: { id: input.keepId, tenantId, deletedAt: null } }),
    tx.leadOrganization.findFirst({ where: { id: input.dropId, tenantId, deletedAt: null } }),
  ]);
  if (!keep || !drop) return null;

  // A call can match only one row per organisation (unique on tenant × org × call). Matches the
  // kept row already has are dropped from the other side instead of moved into a clash.
  const keptCalls = await tx.leadMatch.findMany({
    where: { tenantId, organizationId: keep.id },
    select: { callId: true },
  });
  await tx.leadMatch.deleteMany({
    where: { tenantId, organizationId: drop.id, callId: { in: keptCalls.map((m) => m.callId) } },
  });

  const matches = await tx.leadMatch.updateMany({
    where: { tenantId, organizationId: drop.id },
    data: { organizationId: keep.id },
  });
  const contacts = await tx.leadContact.updateMany({
    where: { tenantId, organizationId: drop.id },
    data: { organizationId: keep.id },
  });
  // Deal tasks and activities hang off the deal, so they follow it without a separate move.
  const deals = await tx.deal.updateMany({
    where: { tenantId, organizationId: drop.id },
    data: { organizationId: keep.id },
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
    moved: { contacts: contacts.count, deals: deals.count, matches: matches.count },
    filledFields: Object.keys(patch),
  };
}
