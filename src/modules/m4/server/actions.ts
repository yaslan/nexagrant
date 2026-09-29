'use server';

import { withTenant } from '@/lib/db';
import { requireTenantAction } from '@/lib/tenant';
import { isPresentId } from '@/lib/required-id';
import { revalidatePath } from 'next/cache';
import type { InteractionRow, RelationshipRow } from '@/types/db-rows';

/**
 * M4 relationships.
 *
 * `tenantId`, `ownerUserId` and `createdBy` were arguments supplied by the
 * caller, and the relationship updates keyed on `id` alone — so a guessed
 * relationship id could have an interaction appended to it, or its next step
 * rewritten, from outside its tenant. All three now come from the session and
 * every write is matched on `(id, tenantId)`.
 */

export async function createRelationship(data: {
  organizationId?: string;
  partnerOrgId?: string;
  kind: string; // partner | ncp | city | cluster | consultant | tto
  counterpartName?: string;
  counterpartEmail?: string;
}) {
  const { tenantId, userId } = await requireTenantAction();

  if (!data.organizationId && !data.partnerOrgId) {
    throw new Error('Must provide either organizationId or partnerOrgId');
  }

  const rel = await withTenant<RelationshipRow>(tenantId, async (tx) => {
    // Rule: One Relationship per organization per tenant
    if (data.organizationId) {
      const existing = await tx.relationship.findFirst({
        where: { tenantId, organizationId: data.organizationId }
      });
      if (existing) {
        throw new Error('Relationship already exists for this organization in your tenant.');
      }
    }

    return tx.relationship.create({
      data: {
        tenantId,
        organizationId: data.organizationId,
        partnerOrgId: data.partnerOrgId,
        kind: data.kind,
        ownerUserId: userId,
        counterpartName: data.counterpartName,
        counterpartEmail: data.counterpartEmail,
        warmth: 'active', // starts active if we just reached out/created
        lastContactAt: new Date()
      }
    });
  });

  revalidatePath('/[workspace]/relationships', 'page');
  return rel.id;
}

export async function addInteraction(data: {
  relationshipId: string;
  kind: string; // meeting | email | call | event
  summary?: string;
}) {
  const { tenantId, userId } = await requireTenantAction();

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
  const { tenantId } = await requireTenantAction();
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
