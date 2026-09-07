'use server';

import { requireTenantAction } from '@/lib/tenant';
import { revalidatePath } from 'next/cache';
import {
  createApprovalRequest,
  approveApprovalRequest,
  rejectApprovalRequest,
  cancelApprovalRequest,
} from '@/lib/dual-approval';
import { DualApprovalActionType } from '@/lib/rbac';
import { Role } from '@prisma/client';

/**
 * `tenantId` used to be read as `session.tenantId` with no null check
 * and passed straight into the dual-approval helpers. Prisma treats an
 * `undefined` field in a `where` clause as *absent*, so a session without a
 * tenant approved and cancelled requests across the whole platform.
 */

export async function submitApprovalRequestAction(data: {
  workspaceId?: string;
  actionType: DualApprovalActionType;
  title: string;
  description?: string;
  payload: Record<string, any>;
  requiredRole?: Role;
  expiresInHours?: number;
}) {
  const { tenantId, userId } = await requireTenantAction();

  const result = await createApprovalRequest({
    tenantId,
    workspaceId: data.workspaceId,
    requesterId: userId,
    actionType: data.actionType,
    title: data.title,
    description: data.description,
    payload: data.payload,
    requiredRole: data.requiredRole,
    expiresInHours: data.expiresInHours,
  });

  revalidatePath('/[locale]/(app)/[workspace]/approvals', 'page');
  return { success: true, request: result };
}

export async function approveRequestAction(requestId: string, comment?: string) {
  const { tenantId, userId, role } = await requireTenantAction();

  const result = await approveApprovalRequest({
    requestId,
    approverId: userId,
    approverRole: role as Role,
    tenantId,
    comment,
  });

  revalidatePath('/[locale]/(app)/[workspace]/approvals', 'page');
  return result;
}

export async function rejectRequestAction(requestId: string, reason: string) {
  const { tenantId, userId, role } = await requireTenantAction();

  const result = await rejectApprovalRequest({
    requestId,
    approverId: userId,
    approverRole: role as Role,
    tenantId,
    reason,
  });

  revalidatePath('/[locale]/(app)/[workspace]/approvals', 'page');
  return result;
}

export async function cancelRequestAction(requestId: string) {
  const { tenantId, userId } = await requireTenantAction();

  const result = await cancelApprovalRequest({
    requestId,
    requesterId: userId,
    tenantId,
  });

  revalidatePath('/[locale]/(app)/[workspace]/approvals', 'page');
  return result;
}
