'use server';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';

// ─── Relationship CRUD ───

export async function createRelationship(data: {
  organizationId?: string;
  partnerOrgId?: string;
  kind: string;
  counterpartName?: string;
  counterpartEmail?: string;
  notes?: string;
}) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');
  const tenantId = (session as any).tenantId;

  const rel = await prisma.relationship.create({
    data: {
      tenantId,
      ownerUserId: session.user.id,
      kind: data.kind,
      organizationId: data.organizationId,
      partnerOrgId: data.partnerOrgId,
      counterpartName: data.counterpartName,
      counterpartEmail: data.counterpartEmail,
      notes: data.notes,
      warmth: 'cold',
    },
  });

  revalidatePath('/[locale]/(app)/[workspace]/relationships', 'page');
  return rel;
}

export async function updateRelationship(
  id: string,
  data: { warmth?: string; nextStep?: string; nextStepDue?: string; notes?: string }
) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');
  const tenantId = (session as any).tenantId;

  await prisma.relationship.update({
    where: { id, tenantId },
    data: {
      warmth: data.warmth,
      nextStep: data.nextStep,
      nextStepDue: data.nextStepDue ? new Date(data.nextStepDue) : undefined,
      notes: data.notes,
    },
  });

  revalidatePath('/[locale]/(app)/[workspace]/relationships', 'page');
  return { success: true };
}

// ─── Interaction CRUD ───

export async function addInteraction(relationshipId: string, data: {
  kind: string;
  at: string;
  summary: string;
}) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');
  const tenantId = (session as any).tenantId;

  await (prisma.$transaction as any)([
    prisma.interaction.create({
      data: {
        tenantId,
        relationshipId,
        kind: data.kind,
        at: new Date(data.at),
        summary: data.summary,
        createdBy: session.user.id,
      },
    }),
    // Update warmth & lastContactAt on the relationship
    prisma.relationship.update({
      where: { id: relationshipId },
      data: {
        lastContactAt: new Date(data.at),
        warmth: 'warm',
      },
    }),
  ]);

  revalidatePath('/[locale]/(app)/[workspace]/relationships', 'page');
  return { success: true };
}
