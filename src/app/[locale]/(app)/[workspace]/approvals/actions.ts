'use server';

import { auth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import {
  createApprovalRequest,
  approveApprovalRequest,
  rejectApprovalRequest,
  cancelApprovalRequest,
} from '@/lib/dual-approval';
import { DualApprovalActionType } from '@/lib/rbac';
import { Role } from '@prisma/client';

export async function submitApprovalRequestAction(data: {
  workspaceId?: string;
  actionType: DualApprovalActionType;
  title: string;
  description?: string;
  payload: Record<string, any>;
  requiredRole?: Role;
  expiresInHours?: number;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  const tenantId = (session as any).tenantId;

  const result = await createApprovalRequest({
    tenantId,
    workspaceId: data.workspaceId,
    requesterId: session.user.id,
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
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  const tenantId = (session as any).tenantId;
  const role = ((session as any).role as Role) || "MEMBER";

  const result = await approveApprovalRequest({
    requestId,
    approverId: session.user.id,
    approverRole: role,
    tenantId,
    comment,
  });

  revalidatePath('/[locale]/(app)/[workspace]/approvals', 'page');
  return result;
}

export async function rejectRequestAction(requestId: string, reason: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  const tenantId = (session as any).tenantId;
  const role = ((session as any).role as Role) || "MEMBER";

  const result = await rejectApprovalRequest({
    requestId,
    approverId: session.user.id,
    approverRole: role,
    tenantId,
    reason,
  });

  revalidatePath('/[locale]/(app)/[workspace]/approvals', 'page');
  return result;
}

export async function cancelRequestAction(requestId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  const tenantId = (session as any).tenantId;

  const result = await cancelApprovalRequest({
    requestId,
    requesterId: session.user.id,
    tenantId,
  });

  revalidatePath('/[locale]/(app)/[workspace]/approvals', 'page');
  return result;
}
