'use server';

import { withTenant } from '@/lib/db';
import { requireTenantAction } from '@/lib/tenant';
import { revalidatePath } from 'next/cache';

/**
 * `tenantId` was read as `(session as any).tenantId` with no null check, and
 * `addInteraction` updated the relationship by `id` alone. Prisma treats an
 * `undefined` field in a `where` clause as absent, so a session without a
 * tenant wrote interactions into whatever relationship id it was given.
 */

// ─── Relationship CRUD ───

export async function createRelationship(data: {
  organizationId?: string;
  partnerOrgId?: string;
  kind: string;
  counterpartName?: string;
  counterpartEmail?: string;
  notes?: string;
}) {
  const { tenantId, userId } = await requireTenantAction();

  const rel = await withTenant<any>(tenantId, (tx) =>
    tx.relationship.create({
    data: {
      tenantId,
      ownerUserId: userId,
      kind: data.kind,
      organizationId: data.organizationId,
      partnerOrgId: data.partnerOrgId,
      counterpartName: data.counterpartName,
      counterpartEmail: data.counterpartEmail,
      notes: data.notes,
      warmth: 'cold',
    },
    })
  );

  revalidatePath('/[locale]/(app)/[workspace]/relationships', 'page');
  return rel;
}

export async function updateRelationship(
  id: string,
  data: { warmth?: string; nextStep?: string; nextStepDue?: string; notes?: string }
) {
  const { tenantId } = await requireTenantAction();

  // `updateMany` so the tenant is a real filter rather than an extra column on
  // a unique selector.
  const updated = await withTenant<{ count: number }>(tenantId, (tx) =>
    tx.relationship.updateMany({
      where: { id, tenantId },
      data: {
        warmth: data.warmth,
        nextStep: data.nextStep,
        nextStepDue: data.nextStepDue ? new Date(data.nextStepDue) : undefined,
        notes: data.notes,
      },
    })
  );

  revalidatePath('/[locale]/(app)/[workspace]/relationships', 'page');
  return { success: updated.count > 0 };
}

// ─── Interaction CRUD ───

export async function addInteraction(relationshipId: string, data: {
  kind: string;
  at: string;
  summary: string;
}) {
  const { tenantId, userId } = await requireTenantAction();

  const ok = await withTenant<boolean>(tenantId, async (tx) => {
    // The relationship must be this tenant's before anything is written to it.
    const rel = await tx.relationship.findFirst({
      where: { id: relationshipId, tenantId },
      select: { id: true },
    });
    if (!rel) return false;

    await tx.interaction.create({
      data: {
        tenantId,
        relationshipId,
        kind: data.kind,
        at: new Date(data.at),
        summary: data.summary,
        createdBy: userId,
      },
    });

    // Update warmth & lastContactAt on the relationship
    await tx.relationship.update({
      where: { id: rel.id },
      data: {
        lastContactAt: new Date(data.at),
        warmth: 'warm',
      },
    });

    return true;
  });

  revalidatePath('/[locale]/(app)/[workspace]/relationships', 'page');
  return { success: ok };
}
