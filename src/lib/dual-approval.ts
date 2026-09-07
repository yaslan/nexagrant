/**
 * Dual Approval Workflow Engine for Legal & Finance Departments
 * Manages 4-stage corporate sign-off for NDA, LOI, TÜBİTAK Award Packs, and Horizon Europe Budgets
 *
 * TASK-MTR60M5ESB5PZ — an audit trail must never name somebody who did not act.
 *
 * `submitForDualApproval` used to default its actor to the literal string
 * the name of one real, uninvolved person, and that value was written straight into
 * `auditTrail[].actorName`, `financeApprover` and `legalApprover`. A caller that
 * passed no identity therefore produced a sign-off record naming a real person who
 * had never seen the document. An approval record is a signature: it is either
 * backed by a known actor or it is not created at all.
 *
 * The rule here is the same one `src/lib/tenant.ts` applies to the tenant: no
 * identity → no record. There is no fallback actor, and every audit line carries
 * the actor's `userId` next to the display name, so the record stays attributable
 * even when two people share a display name or a name is later changed.
 */

import { DUAL_APPROVAL_REQUIRED_ROLES, type DualApprovalActionType } from './rbac';
import type { Role } from '@prisma/client';

export type ApprovalStage = 
  | 'DRAFT'
  | 'PENDING_FINANCE_APPROVAL'
  | 'PENDING_LEGAL_APPROVAL'
  | 'APPROVED_AND_SIGNED'
  | 'REJECTED';

export type Department = 'FINANCE' | 'LEGAL';

/**
 * Who performed an approval step. Both fields come from the session; neither is
 * ever guessed. `displayName` is what a reader sees, `userId` is what the record
 * is attributable by.
 */
export interface ApprovalActor {
  userId: string;
  displayName: string;
}

/** Thrown when a workflow step is attempted without a known actor. */
export class MissingApprovalActorError extends Error {
  readonly code = 'APPROVAL_ACTOR_REQUIRED';

  constructor(
    message = 'Dual approval step refused: the caller carries no identity, and an audit record is never written under an invented name.'
  ) {
    super(message);
    this.name = 'MissingApprovalActorError';
  }
}

/** Rejects an absent, blank or half-filled actor instead of inventing one. */
function requireActor(actor: ApprovalActor | null | undefined): ApprovalActor {
  const userId = actor?.userId?.trim();
  const displayName = actor?.displayName?.trim();
  if (!userId || !displayName) throw new MissingApprovalActorError();
  return { userId, displayName };
}

export interface AuditLogRecord {
  id: string;
  department: Department;
  action: 'APPROVED' | 'REJECTED';
  /** Display name of the actor, as the session carried it. */
  actorName: string;
  /** Session id of the actor — the field that makes the line attributable. */
  actorUserId: string;
  note?: string;
  timestamp: string;
}

export interface DualApprovalState {
  docId: string;
  stage: ApprovalStage;
  submittedBy: string;
  submittedByUserId: string;
  financeApproved: boolean;
  legalApproved: boolean;
  financeApprover?: string;
  financeApproverUserId?: string;
  legalApprover?: string;
  legalApproverUserId?: string;
  auditTrail: AuditLogRecord[];
}

/**
 * Submit document into dual corporate approval workflow.
 * Throws `MissingApprovalActorError` when the caller has no identity.
 */
export function submitForDualApproval(
  docId: string,
  actor: ApprovalActor
): DualApprovalState {
  const { userId, displayName } = requireActor(actor);
  return {
    docId,
    stage: 'PENDING_FINANCE_APPROVAL',
    submittedBy: displayName,
    submittedByUserId: userId,
    financeApproved: false,
    legalApproved: false,
    auditTrail: [
      {
        id: `log-sub-${Date.now()}`,
        department: 'FINANCE',
        action: 'APPROVED',
        actorName: displayName,
        actorUserId: userId,
        note: 'Doküman Çift Onaylı Kurumsal Yetki Akışına Gönderildi',
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

/**
 * Perform department sign-off (FINANCE or LEGAL).
 * Throws `MissingApprovalActorError` when the caller has no identity.
 */
export function approveByDepartment(
  currentState: DualApprovalState,
  department: Department,
  actor: ApprovalActor,
  note?: string
): DualApprovalState {
  const { userId, displayName } = requireActor(actor);
  const newTrail = [
    ...currentState.auditTrail,
    {
      id: `log-app-${Date.now()}`,
      department,
      action: 'APPROVED' as const,
      actorName: displayName,
      actorUserId: userId,
      note: note || `${department} Departmanı Onayı Verildi`,
      timestamp: new Date().toISOString(),
    },
  ];

  if (department === 'FINANCE') {
    return {
      ...currentState,
      stage: 'PENDING_LEGAL_APPROVAL',
      financeApproved: true,
      financeApprover: displayName,
      financeApproverUserId: userId,
      auditTrail: newTrail,
    };
  }

  // LEGAL department approval completes the workflow
  return {
    ...currentState,
    stage: 'APPROVED_AND_SIGNED',
    legalApproved: true,
    legalApprover: displayName,
    legalApproverUserId: userId,
    auditTrail: newTrail,
  };
}

/**
 * Reject document with audit reason note.
 * Throws `MissingApprovalActorError` when the caller has no identity.
 */
export function rejectDualApproval(
  currentState: DualApprovalState,
  department: Department,
  actor: ApprovalActor,
  rejectReason: string
): DualApprovalState {
  const { userId, displayName } = requireActor(actor);
  return {
    ...currentState,
    stage: 'REJECTED',
    auditTrail: [
      ...currentState.auditTrail,
      {
        id: `log-rej-${Date.now()}`,
        department,
        action: 'REJECTED',
        actorName: displayName,
        actorUserId: userId,
        note: `Red Sebebi: ${rejectReason}`,
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Compatibility helpers for src/app/[locale]/(app)/[workspace]/approvals/actions.ts
// ─────────────────────────────────────────────────────────────────────────────

/** The default window a request stays open for when the caller names none. */
const DEFAULT_EXPIRY_HOURS = 48;

export interface CreateApprovalRequestParams {
  tenantId: string;
  workspaceId?: string;
  requesterId: string;
  actionType: DualApprovalActionType;
  title: string;
  description?: string;
  payload: Record<string, unknown>;
  requiredRole?: Role;
  expiresInHours?: number;
}

/** An approval request as the approvals screen lists it. */
export interface ApprovalRequestRecord {
  id: string;
  tenantId: string;
  workspaceId?: string | null;
  actionType: string;
  title: string;
  description?: string | null;
  payload: Record<string, unknown>;
  status: string;
  requiredRole: Role;
  requesterId: string;
  approverId?: string | null;
  rejectionReason?: string | null;
  expiresAt: string;
  createdAt: string;
}

export async function createApprovalRequest(
  params: CreateApprovalRequestParams
): Promise<ApprovalRequestRecord> {
  const expiresInHours = params.expiresInHours ?? DEFAULT_EXPIRY_HOURS;
  return {
    id: `req-${Date.now()}`,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId ?? null,
    actionType: params.actionType,
    title: params.title,
    description: params.description ?? null,
    payload: params.payload,
    status: 'PENDING',
    requiredRole: params.requiredRole ?? DUAL_APPROVAL_REQUIRED_ROLES[params.actionType],
    requesterId: params.requesterId,
    expiresAt: new Date(Date.now() + expiresInHours * 3600_000).toISOString(),
    createdAt: new Date().toISOString(),
  };
}

export interface ApprovalDecisionResult {
  success: true;
  requestId: string;
  status: 'APPROVED' | 'REJECTED' | 'CANCELLED';
  approvedBy?: string;
  reason?: string;
}

export async function approveApprovalRequest(params: {
  requestId: string;
  approverId: string;
  tenantId: string;
  approverRole?: Role;
  comment?: string;
}): Promise<ApprovalDecisionResult> {
  return {
    success: true,
    requestId: params.requestId,
    status: 'APPROVED',
    approvedBy: params.approverId,
  };
}

export async function rejectApprovalRequest(params: {
  requestId: string;
  approverId: string;
  tenantId: string;
  approverRole?: Role;
  reason: string;
}): Promise<ApprovalDecisionResult> {
  return {
    success: true,
    requestId: params.requestId,
    status: 'REJECTED',
    reason: params.reason,
  };
}

export async function cancelApprovalRequest(params: {
  requestId: string;
  requesterId: string;
  tenantId: string;
}): Promise<ApprovalDecisionResult> {
  return {
    success: true,
    requestId: params.requestId,
    status: 'CANCELLED',
  };
}
