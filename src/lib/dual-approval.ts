/**
 * Dual Approval Workflow Engine for Legal & Finance Departments
 * Manages 4-stage corporate sign-off for NDA, LOI, TÜBİTAK Award Packs, and Horizon Europe Budgets
 */

import { prisma } from './db';

export type ApprovalStage = 
  | 'DRAFT'
  | 'PENDING_FINANCE_APPROVAL'
  | 'PENDING_LEGAL_APPROVAL'
  | 'APPROVED_AND_SIGNED'
  | 'REJECTED';

export type Department = 'FINANCE' | 'LEGAL';

export interface AuditLogRecord {
  id: string;
  department: Department;
  action: 'APPROVED' | 'REJECTED';
  actorName: string;
  note?: string;
  timestamp: string;
}

export interface DualApprovalState {
  docId: string;
  stage: ApprovalStage;
  submittedBy: string;
  financeApproved: boolean;
  legalApproved: boolean;
  financeApprover?: string;
  legalApprover?: string;
  auditTrail: AuditLogRecord[];
}

/**
 * Submit document into dual corporate approval workflow
 */
export function submitForDualApproval(
  docId: string,
  submittedBy: string = 'Dr. Mehmet Yılmaz'
): DualApprovalState {
  return {
    docId,
    stage: 'PENDING_FINANCE_APPROVAL',
    submittedBy,
    financeApproved: false,
    legalApproved: false,
    auditTrail: [
      {
        id: `log-sub-${Date.now()}`,
        department: 'FINANCE',
        action: 'APPROVED',
        actorName: submittedBy,
        note: 'Doküman Çift Onaylı Kurumsal Yetki Akışına Gönderildi',
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

/**
 * Perform department sign-off (FINANCE or LEGAL)
 */
export function approveByDepartment(
  currentState: DualApprovalState,
  department: Department,
  actorName: string,
  note?: string
): DualApprovalState {
  const newTrail = [
    ...currentState.auditTrail,
    {
      id: `log-app-${Date.now()}`,
      department,
      action: 'APPROVED' as const,
      actorName,
      note: note || `${department} Departmanı Onayı Verildi`,
      timestamp: new Date().toISOString(),
    },
  ];

  if (department === 'FINANCE') {
    return {
      ...currentState,
      stage: 'PENDING_LEGAL_APPROVAL',
      financeApproved: true,
      financeApprover: actorName,
      auditTrail: newTrail,
    };
  }

  // LEGAL department approval completes the workflow
  return {
    ...currentState,
    stage: 'APPROVED_AND_SIGNED',
    legalApproved: true,
    legalApprover: actorName,
    auditTrail: newTrail,
  };
}

/**
 * Reject document with audit reason note
 */
export function rejectDualApproval(
  currentState: DualApprovalState,
  department: Department,
  actorName: string,
  rejectReason: string
): DualApprovalState {
  return {
    ...currentState,
    stage: 'REJECTED',
    auditTrail: [
      ...currentState.auditTrail,
      {
        id: `log-rej-${Date.now()}`,
        department,
        action: 'REJECTED',
        actorName,
        note: `Red Sebebi: ${rejectReason}`,
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Compatibility helpers for src/app/[locale]/(app)/[workspace]/approvals/actions.ts
// ─────────────────────────────────────────────────────────────────────────────

export async function createApprovalRequest(params: any) {
  return {
    id: `req-${Date.now()}`,
    tenantId: params.tenantId,
    actionType: params.actionType,
    title: params.title,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  };
}

export async function approveApprovalRequest(params: any) {
  return {
    success: true,
    requestId: params.requestId,
    status: 'APPROVED',
    approvedBy: params.approverId,
  };
}

export async function rejectApprovalRequest(params: any) {
  return {
    success: true,
    requestId: params.requestId,
    status: 'REJECTED',
    reason: params.reason,
  };
}

export async function cancelApprovalRequest(params: any) {
  return {
    success: true,
    requestId: params.requestId,
    status: 'CANCELLED',
  };
}
