'use server';

import { z } from 'zod';

import { withTenant } from '@/lib/db';
import { asRole, can } from '@/lib/rbac';
import { requireTenantAction } from '@/lib/tenant';
import { isPresentId } from '@/lib/required-id';
import { getWorkspaceMembers, type WorkspaceMember } from '@/lib/k5-pipeline/pipelineStore';
import { revalidatePath } from 'next/cache';
import type { RelationshipRow } from '@/types/db-rows';

/**
 * `tenantId` was read as `session.tenantId` with no null check, and
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
  const { tenantId, userId } = await requireTenantAction({ can: 'edit_proposal' });

  const rel = await withTenant<RelationshipRow>(tenantId, (tx) =>
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

/**
 * Everything a relationship edit may carry, validated on the server
 * (CLAUDE.md: Zod on every server action). The action used to take the object
 * straight from the client and hand it to Prisma.
 *
 * `ownerUserId` is the field that needed care: `null` is a real value here
 * ("unassign this relationship") while `undefined` means "leave the owner
 * alone", so the two cannot be collapsed. `.nullable().optional()` keeps them
 * apart; `z.string().min(1)` refuses the empty string, which Prisma would
 * otherwise store as an owner id belonging to nobody.
 */
const RelationshipUpdateInput = z.object({
  warmth: z.enum(['cold', 'warm', 'hot', 'active']).optional(),
  nextStep: z.string().max(500).optional(),
  nextStepDue: z.string().optional(),
  notes: z.string().max(5000).optional(),
  ownerUserId: z.string().min(1).nullable().optional(),
});

export type RelationshipUpdateInput = z.input<typeof RelationshipUpdateInput>;

export type UpdateRelationshipResult =
  | { success: true }
  | { success: false; error: 'INVALID_INPUT' | 'FORBIDDEN' | 'OWNER_NOT_IN_TENANT' | 'NOT_FOUND' };

/**
 * The permission that assigning a focal point needs.
 *
 * Warmth, next step and notes stay open to every member — that is what this
 * action has always allowed and narrowing it would take the screen away from
 * the people who use it. Handing a relationship to someone else is a different
 * act: it decides whose queue the overdue `nextStep` lands in, so it is gated
 * on the same permission as the rest of workspace administration and only that
 * one field is refused when the role does not carry it.
 */
const ASSIGN_OWNER_ACTION = 'manage_workspaces' as const;

export async function updateRelationship(
  id: string,
  data: RelationshipUpdateInput
): Promise<UpdateRelationshipResult> {
  const { tenantId, role } = await requireTenantAction();
  // Client-supplied: Prisma drops an `undefined` key from `where` (TASK-MUN2KUHP1BP18).
  if (!isPresentId(id)) return { success: false, error: 'INVALID_INPUT' };

  const parsed = RelationshipUpdateInput.safeParse(data);
  if (!parsed.success) return { success: false, error: 'INVALID_INPUT' };
  const input = parsed.data;

  const assigningOwner = 'ownerUserId' in input;
  if (assigningOwner && !can(asRole(role), ASSIGN_OWNER_ACTION)) {
    return { success: false, error: 'FORBIDDEN' };
  }

  // `updateMany` so the tenant is a real filter rather than an extra column on
  // a unique selector.
  const outcome = await withTenant<'ok' | 'not_found' | 'owner_not_in_tenant'>(tenantId, async (tx) => {
    // A relationship may only be handed to a member of the tenant that owns it.
    // The membership row is read under the same tenant scope as the write, so
    // another tenant's user id finds nothing — and a user id that does not
    // exist finds nothing either. Both answer the same way on purpose: a
    // different answer would turn this field into a probe for user ids.
    if (input.ownerUserId != null) {
      const member = await tx.membership.findFirst({
        where: { tenantId, userId: input.ownerUserId, user: { deletedAt: null } },
        select: { userId: true },
      });
      if (!member) return 'owner_not_in_tenant';
    }

    const updated = await tx.relationship.updateMany({
      where: { id, tenantId },
      data: {
        warmth: input.warmth,
        nextStep: input.nextStep,
        nextStepDue: input.nextStepDue ? new Date(input.nextStepDue) : undefined,
        notes: input.notes,
        // Only written when the caller actually sent the field, so an edit of
        // the notes cannot silently unassign the relationship.
        ...(assigningOwner ? { ownerUserId: input.ownerUserId ?? null } : {}),
      },
    });

    return updated.count > 0 ? 'ok' : 'not_found';
  });

  if (outcome === 'owner_not_in_tenant') return { success: false, error: 'OWNER_NOT_IN_TENANT' };
  if (outcome === 'not_found') return { success: false, error: 'NOT_FOUND' };

  revalidatePath('/[locale]/(app)/[workspace]/relationships', 'page');
  return { success: true };
}

/**
 * The people this tenant can hand a relationship to, for the detail screen's
 * owner picker. Reuses the pipeline board's member reader rather than opening a
 * second query with its own idea of who counts as a member — it is already
 * tenant-scoped and already skips soft-deleted users.
 */
export async function getAssignableMembers(): Promise<{ success: boolean; members: WorkspaceMember[] }> {
  const { tenantId } = await requireTenantAction({ readOnly: true });
  return { success: true, members: await getWorkspaceMembers(tenantId) };
}

// ─── Interaction CRUD ───

export async function addInteraction(relationshipId: string, data: {
  kind: string;
  at: string;
  summary: string;
}) {
  const { tenantId, userId } = await requireTenantAction({ can: 'edit_proposal' });

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
