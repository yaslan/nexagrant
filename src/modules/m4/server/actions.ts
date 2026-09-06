'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';

export async function createRelationship(data: {
  tenantId: string;
  organizationId?: string;
  partnerOrgId?: string;
  kind: string; // partner | ncp | city | cluster | consultant | tto
  ownerUserId: string;
  counterpartName?: string;
  counterpartEmail?: string;
}) {
  if (!data.organizationId && !data.partnerOrgId) {
    throw new Error('Must provide either organizationId or partnerOrgId');
  }

  // Rule: One Relationship per organization per tenant
  if (data.organizationId) {
    const existing = await prisma.relationship.findFirst({
      where: { tenantId: data.tenantId, organizationId: data.organizationId }
    });
    if (existing) {
      throw new Error('Relationship already exists for this organization in your tenant.');
    }
  }

  const rel = await prisma.relationship.create({
    data: {
      tenantId: data.tenantId,
      organizationId: data.organizationId,
      partnerOrgId: data.partnerOrgId,
      kind: data.kind,
      ownerUserId: data.ownerUserId,
      counterpartName: data.counterpartName,
      counterpartEmail: data.counterpartEmail,
      warmth: 'active', // starts active if we just reached out/created
      lastContactAt: new Date()
    }
  });

  revalidatePath('/[workspace]/relationships', 'page');
  return rel.id;
}

export async function addInteraction(data: {
  tenantId: string;
  relationshipId: string;
  kind: string; // meeting | email | call | event
  summary?: string;
  createdBy: string;
}) {
  const interaction = await prisma.interaction.create({
    data: {
      tenantId: data.tenantId,
      relationshipId: data.relationshipId,
      kind: data.kind,
      summary: data.summary,
      createdBy: data.createdBy,
      at: new Date()
    }
  });

  // Update relationship warmth and lastContactAt
  await prisma.relationship.update({
    where: { id: data.relationshipId },
    data: {
      lastContactAt: new Date(),
      warmth: 'active'
    }
  });

  revalidatePath('/[workspace]/relationships/[id]', 'page');
  return interaction.id;
}

export async function updateNextStep(
  relationshipId: string, 
  nextStep: string, 
  nextStepDue: Date | null
) {
  await prisma.relationship.update({
    where: { id: relationshipId },
    data: { nextStep, nextStepDue }
  });
  revalidatePath('/[workspace]/relationships/[id]', 'page');
}
