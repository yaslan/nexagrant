'use server';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { tenantScopeOf, TenantScope } from '@/lib/tenant';
// @ts-ignore
import { Gate, OppStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import {
  addInMemoryOpportunity,
  updateInMemoryOpportunityStage,
  updateInMemoryOpportunityOwner,
  addInMemoryOpportunityNote,
  WORKSPACE_MEMBERS
} from '@/lib/k5-pipeline/pipelineStore';

/**
 * The tenant of a server action comes from the session and from nowhere else.
 *
 * These actions used to accept a `tenantIdParam` sent by the browser and fall
 * back to `prisma.tenant.findFirst()` when the session had none — either path
 * lets a caller write into a tenant it was never granted. Returning `null` here
 * makes the action refuse instead of guessing.
 */
async function sessionScope(): Promise<TenantScope | null> {
  try {
    return tenantScopeOf((await auth()) as any);
  } catch (e: any) {
    console.warn(`[pipeline/actions] session lookup failed: ${e.message}`);
    return null;
  }
}

const NO_TENANT = { success: false as const, error: 'TENANT_SCOPE_REQUIRED' as const };

export async function createOpportunity({
  workspaceSlug,
  title,
  topicId,
  intendedRole = 'coordinator',
  ownerId,
  ownerName,
  stage = 'G0',
  notes
}: {
  workspaceSlug: string;
  title: string;
  topicId?: string;
  intendedRole?: string;
  ownerId?: string;
  ownerName?: string;
  stage?: Gate;
  notes?: string;
}) {
  const scope = await sessionScope();
  if (!scope) return NO_TENANT;
  const { tenantId, userId } = scope;

  const calculatedScore = Math.floor(Math.random() * 15 + 80);

  const resolvedOwner = ownerId
    ? WORKSPACE_MEMBERS.find((m) => m.id === ownerId)
    : WORKSPACE_MEMBERS[0];

  const nowFormatted = new Date().toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const newOpp = {
    id: `opp-${Date.now()}`,
    workspaceId: workspaceSlug || 'default',
    title,
    topicId: topicId ? topicId.trim() : null,
    intendedRole,
    ownerId: ownerId || resolvedOwner?.id || 'usr-1',
    ownerName: ownerName || resolvedOwner?.name || 'Ahmet Yılmaz',
    stage: (stage || 'G0') as any,
    status: 'ACTIVE' as OppStatus,
    g0Score: calculatedScore,
    notes: notes || null,
    notesList: notes
      ? [
          {
            id: `note-${Date.now()}`,
            text: notes,
            authorName: ownerName || resolvedOwner?.name || 'Ahmet Yılmaz',
            authorAvatar: resolvedOwner?.avatar || '👨‍💼',
            createdAt: nowFormatted
          }
        ]
      : [],
    createdAt: new Date(),
    updatedAt: new Date()
  };

  // The tenant comes from the session, not from the object: the store signature
  // takes it separately so this call cannot file the row under another tenant.
  const storedOpp = addInMemoryOpportunity(tenantId, newOpp);

  try {
    // Both lookups carry `tenantId`, so a workspace slug from another tenant
    // resolves to nothing instead of to that tenant's workspace.
    let workspace = await prisma.workspace.findFirst({
      where: {
        tenantId,
        ...(workspaceSlug && workspaceSlug !== 'default' ? { slug: workspaceSlug } : {})
      }
    });
    if (!workspace) {
      workspace = await prisma.workspace.findFirst({ where: { tenantId } });
    }

    if (workspace) {
      await prisma.opportunity.create({
        data: {
          tenantId,
          workspaceId: workspace.id,
          title,
          topicId: topicId ? topicId.trim() : null,
          intendedRole,
          ownerId: ownerId || userId || null,
          stage: stage || 'G0',
          status: 'ACTIVE',
          g0Score: calculatedScore,
          notes: notes || null
        }
      });
    }
  } catch (err: any) {
    console.warn('[createOpportunity] DB query bypassed, stored in resilient pipeline store:', err.message);
  }

  try {
    revalidatePath('/[locale]/(app)/[workspace]/pipeline', 'page');
    revalidatePath('/[locale]/(app)/[workspace]/firsatlar', 'page');
  } catch (e) {}
  return { success: true, opportunity: storedOpp };
}

export async function assignOpportunityOwner({
  opportunityId,
  ownerId,
  ownerName,
}: {
  opportunityId: string;
  ownerId: string;
  ownerName: string;
}) {
  const scope = await sessionScope();
  if (!scope) return NO_TENANT;
  const { tenantId } = scope;

  updateInMemoryOpportunityOwner(tenantId, opportunityId, ownerId, ownerName);

  try {
    // updateMany + tenantId, not update by id: `update` on a guessable id would
    // reassign an opportunity belonging to another tenant.
    await prisma.opportunity.updateMany({
      where: { id: opportunityId, tenantId },
      data: { ownerId },
    });
  } catch (err: any) {
    console.warn(`[assignOpportunityOwner] DB update bypassed: ${err.message}`);
  }

  try {
    revalidatePath('/[locale]/(app)/[workspace]/pipeline', 'page');
    revalidatePath('/[locale]/(app)/[workspace]/firsatlar', 'page');
  } catch (e) {}

  return { success: true, ownerId, ownerName };
}

export async function addOpportunityNote({
  opportunityId,
  text,
  authorName,
  authorAvatar,
}: {
  opportunityId: string;
  text: string;
  authorName: string;
  authorAvatar: string;
}) {
  const scope = await sessionScope();
  if (!scope) return NO_TENANT;
  const { tenantId } = scope;

  const nowFormatted = new Date().toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const noteObj = {
    id: `note-${Date.now()}`,
    text,
    authorName,
    authorAvatar,
    createdAt: nowFormatted,
  };

  addInMemoryOpportunityNote(tenantId, opportunityId, noteObj);

  try {
    revalidatePath('/[locale]/(app)/[workspace]/pipeline', 'page');
    revalidatePath('/[locale]/(app)/[workspace]/firsatlar', 'page');
  } catch (e) {}

  return { success: true, note: noteObj };
}

export async function moveOpportunityStage(opportunityId: string, newStage: Gate) {
  const scope = await sessionScope();
  if (!scope) return NO_TENANT;
  const { tenantId } = scope;

  updateInMemoryOpportunityStage(tenantId, opportunityId, newStage as any);

  try {
    // `tenantId` is always part of the filter — an empty tenant clause here used
    // to update the row whatever tenant it belonged to.
    await prisma.opportunity.updateMany({
      where: { id: opportunityId, tenantId },
      data: { stage: newStage }
    });
  } catch (err: any) {
    console.warn(`[moveOpportunityStage] DB update bypassed: ${err.message}`);
  }

  try {
    revalidatePath('/[locale]/(app)/[workspace]/pipeline', 'page');
    revalidatePath('/[locale]/(app)/[workspace]/firsatlar', 'page');
  } catch (e) {}
  return { success: true };
}
