'use server';

import { z } from 'zod';

import { withTenant } from '@/lib/db';
import { assertModuleAccess } from '@/lib/modules/access';
import { requireTenantAction } from '@/lib/tenant';
import { isPresentId } from '@/lib/required-id';
import { revalidatePath } from 'next/cache';
import type { InteractionRow } from '@/types/db-rows';

/**
 * M4 relationships.
 *
 * `tenantId`, `ownerUserId` and `createdBy` were arguments supplied by the
 * caller, and the relationship updates keyed on `id` alone — so a guessed
 * relationship id could have an interaction appended to it, or its next step
 * rewritten, from outside its tenant. All three now come from the session and
 * every write is matched on `(id, tenantId)`.
 */

/**
 * CORDIS PIC: the participant identifier the funding portal uses. Digits only,
 * 6 to 12 of them.
 */
const CORDIS_PIC = /^\d{6,12}$/;

/**
 * Relationship kinds, as the schema comment lists them. Only `partner` is
 * written by the screens today; the rest are kept so a later screen can
 * record them without a schema change.
 */
const RELATIONSHIP_KINDS = ['partner', 'ncp', 'city', 'cluster', 'consultant', 'tto'] as const;

const RelationshipCreateInput = z
  .object({
    organizationId: z.string().regex(CORDIS_PIC, 'organizationId must be a CORDIS PIC (6 to 12 digits)').optional(),
    partnerOrgId: z.string().min(1).max(64).optional(),
    kind: z.enum(RELATIONSHIP_KINDS),
    counterpartName: z.string().trim().min(1).max(300).optional(),
    counterpartEmail: z.string().trim().email().max(320).optional(),
    notes: z.string().max(5000).optional(),
  })
  // A relationship with no PIC and no partner id still needs a name to show
  // on the screen; an empty request is refused before it reaches the table.
  .refine((d) => d.organizationId || d.partnerOrgId || d.counterpartName, {
    message: 'Provide organizationId, partnerOrgId or counterpartName',
  });

export type RelationshipCreateInput = z.input<typeof RelationshipCreateInput>;

/**
 * The one definition of "add to M4". The partner announcement screens reach it
 * through `src/app/.../relationships/actions.ts`, which delegates here.
 *
 * Refused before any write when the module is off for the tenant, and
 * refused on input the schema does not accept. A second request for a PIC the
 * tenant already has returns the existing relationship's id instead of
 * writing a second row. The advisory lock makes that check and the insert one
 * step for concurrent requests, which a plain `findFirst` would not.
 */
export async function createRelationship(data: RelationshipCreateInput): Promise<string> {
  await assertModuleAccess('M4');
  const { tenantId, userId } = await requireTenantAction({ can: 'edit_proposal' });

  const parsed = RelationshipCreateInput.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(first ? `${first.path.join('.') || 'input'}: ${first.message}` : 'Invalid relationship input');
  }
  const input = parsed.data;

  const id = await withTenant<string>(tenantId, async (tx) => {
    if (input.organizationId) {
      // Transaction-scoped: released at commit, so a second request for the same
      // PIC waits here and then sees the first request's row.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${input.organizationId}`}, 0))::text`;
      const existing = await tx.relationship.findFirst({
        where: { tenantId, organizationId: input.organizationId },
        select: { id: true },
      });
      if (existing) return existing.id;
    }

    const rel = await tx.relationship.create({
      data: {
        tenantId,
        organizationId: input.organizationId,
        partnerOrgId: input.partnerOrgId,
        kind: input.kind,
        ownerUserId: userId,
        counterpartName: input.counterpartName,
        counterpartEmail: input.counterpartEmail,
        notes: input.notes,
        warmth: 'cold',
      },
      select: { id: true },
    });
    return rel.id;
  });

  revalidatePath('/[locale]/(app)/[workspace]/relationships', 'page');
  return id;
}

export async function addInteraction(data: {
  relationshipId: string;
  kind: string; // meeting | email | call | event
  summary?: string;
}) {
  const { tenantId, userId } = await requireTenantAction({ can: 'edit_proposal' });

  const interaction = await withTenant<InteractionRow>(tenantId, async (tx) => {
    // The relationship must be this tenant's before anything is written to it.
    const rel = await tx.relationship.findFirst({
      where: { id: data.relationshipId, tenantId },
      select: { id: true }
    });
    if (!rel) throw new Error('Relationship not found in this workspace.');

    const created = await tx.interaction.create({
      data: {
        tenantId,
        relationshipId: data.relationshipId,
        kind: data.kind,
        summary: data.summary,
        createdBy: userId,
        at: new Date()
      }
    });

    // Update relationship warmth and lastContactAt
    await tx.relationship.update({
      where: { id: rel.id },
      data: {
        lastContactAt: new Date(),
        warmth: 'active'
      }
    });

    return created;
  });

  revalidatePath('/[workspace]/relationships/[id]', 'page');
  return interaction.id;
}

export async function updateNextStep(
  relationshipId: string,
  nextStep: string,
  nextStepDue: Date | null
) {
  const { tenantId } = await requireTenantAction({ can: 'edit_proposal' });
  // Client-supplied: Prisma drops an `undefined` key from `where` (TASK-MUN2KUHP1BP18).
  if (!isPresentId(relationshipId)) return { success: false };

  // `updateMany` keeps tenantId in the WHERE clause.
  const updated = await withTenant<{ count: number }>(tenantId, (tx) =>
    tx.relationship.updateMany({
      where: { id: relationshipId, tenantId },
      data: { nextStep, nextStepDue }
    })
  );

  revalidatePath('/[workspace]/relationships/[id]', 'page');
  return { success: updated.count > 0 };
}
