'use server';

import { requireTenantAction } from '@/lib/tenant';
import { revalidatePath } from 'next/cache';
import {
  createApprovalRequest,
  approveApprovalRequest,
  rejectApprovalRequest,
  cancelApprovalRequest,
  type ApprovalResult,
} from '@/lib/approval-requests';
import { DualApprovalActionType } from '@/lib/rbac';
import { Role } from '@prisma/client';

/**
 * `tenantId` used to be read as `session.tenantId` with no null check
 * and passed straight into the dual-approval helpers. Prisma treats an
 * `undefined` field in a `where` clause as *absent*, so a session without a
 * tenant approved and cancelled requests across the whole platform.
 *
 * AKTAR-MURBCJ0A-1: the helpers write to `ApprovalRequest` now
 * (src/lib/approval-requests.ts) and every action answers
 * `{ ok: true, request } | { ok: false, error }`. A role the permission table
 * refuses still throws `ForbiddenRoleError` from `requireTenantAction` before
 * anything is read; the rules that need the stored row (four eyes, required
 * role, PENDING only, expiry, requester-only cancel) answer as values.
 */

const revalidateApprovals = () => revalidatePath('/[locale]/(app)/[workspace]/approvals', 'page');

export async function submitApprovalRequestAction(data: {
  workspaceId?: string;
  actionType: DualApprovalActionType;
  title: string;
  description?: string;
  payload: Record<string, unknown>;
  requiredRole?: Role;
  expiresInHours?: number;
}): Promise<ApprovalResult> {
  const { tenantId, userId } = await requireTenantAction({ can: 'request_dual_approval' });

  const result = await createApprovalRequest({
    tenantId,
    workspaceId: data?.workspaceId,
    requesterId: userId,
    actionType: data?.actionType,
    title: data?.title,
    description: data?.description,
    payload: data?.payload,
    requiredRole: data?.requiredRole,
    expiresInHours: data?.expiresInHours,
  });

  if (result.ok) revalidateApprovals();
  return result;
}

export async function approveRequestAction(requestId: string): Promise<ApprovalResult> {
  const { tenantId, userId, role } = await requireTenantAction({ can: 'approve_dual_approval' });

  const result = await approveApprovalRequest({ requestId, approverId: userId, approverRole: role, tenantId });

  revalidateApprovals();
  return result;
}

export async function rejectRequestAction(requestId: string, reason: string): Promise<ApprovalResult> {
  // Same permission as approving (see approveRequestAction).
  const { tenantId, userId, role } = await requireTenantAction({ can: 'approve_dual_approval' });

  const result = await rejectApprovalRequest({ requestId, approverId: userId, approverRole: role, tenantId, reason });

  revalidateApprovals();
  return result;
}

export async function cancelRequestAction(requestId: string): Promise<ApprovalResult> {
  const { tenantId, userId } = await requireTenantAction({ can: 'request_dual_approval' });

  const result = await cancelApprovalRequest({ requestId, requesterId: userId, tenantId });

  revalidateApprovals();
  return result;
}
