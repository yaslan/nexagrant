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

/** The audit note a department step carries when the approver typed none. */
export function defaultDepartmentNote(department: Department): string {
  return `${department} Departmanı Onayı Verildi`;
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
      note: note || defaultDepartmentNote(department),
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

// ─────────────────────────────────────────────────────────────────────────────
// Durable state (TASK-MTSAIWF4ENUSL)
// ─────────────────────────────────────────────────────────────────────────────
//
// The functions above build the state; these two read it back from what the
// database stored and decide whether a step may be taken. Both are pure, so the
// four-eyes rules are unit-testable without a database — but they are not the
// only line of defence: `DualApprovalStep` carries the same two rules as unique
// indexes, so a race that slips past the check still cannot write the row.

/** One persisted department sign-off, as `DualApprovalStep` stores it. */
export interface PersistedApprovalStep {
  id: string;
  department: string;
  actorUserId: string;
  actorName: string;
  note?: string | null;
  decidedAt: Date | string;
}

/** The durable half of one document's flow: the submission plus its steps. */
export interface PersistedApproval {
  docId: string;
  submittedAt: Date | string | null;
  submittedById: string | null;
  submittedByName: string | null;
  steps: PersistedApprovalStep[];
  signedAt: Date | string | null;
}

function isoOf(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function stepOf(steps: PersistedApprovalStep[], department: Department) {
  return steps.find((s) => s.department === department);
}

/**
 * Rebuilds the workflow state from the stored rows.
 *
 * Returns `null` when the document was never submitted — "not in the flow" is a
 * real state, and it is the one the banner shows as idle. Nothing here invents a
 * step: a lit stage means a row exists for it.
 */
export function deriveDualApprovalState(row: PersistedApproval): DualApprovalState | null {
  if (!row.submittedAt || !row.submittedById || !row.submittedByName) return null;

  const ordered = [...row.steps].sort(
    (a, b) => new Date(a.decidedAt).getTime() - new Date(b.decidedAt).getTime()
  );
  const finance = stepOf(ordered, 'FINANCE');
  const legal = stepOf(ordered, 'LEGAL');

  const stage: ApprovalStage = legal
    ? 'APPROVED_AND_SIGNED'
    : finance
      ? 'PENDING_LEGAL_APPROVAL'
      : 'PENDING_FINANCE_APPROVAL';

  const auditTrail: AuditLogRecord[] = [
    {
      id: `sub-${row.docId}`,
      department: 'FINANCE',
      action: 'APPROVED',
      actorName: row.submittedByName,
      actorUserId: row.submittedById,
      note: 'Doküman Çift Onaylı Kurumsal Yetki Akışına Gönderildi',
      timestamp: isoOf(row.submittedAt),
    },
    ...ordered.map((s) => ({
      id: s.id,
      department: s.department as Department,
      action: 'APPROVED' as const,
      actorName: s.actorName,
      actorUserId: s.actorUserId,
      note: s.note ?? undefined,
      timestamp: isoOf(s.decidedAt),
    })),
  ];

  return {
    docId: row.docId,
    stage,
    submittedBy: row.submittedByName,
    submittedByUserId: row.submittedById,
    financeApproved: Boolean(finance),
    legalApproved: Boolean(legal),
    financeApprover: finance?.actorName,
    financeApproverUserId: finance?.actorUserId,
    legalApprover: legal?.actorName,
    legalApproverUserId: legal?.actorUserId,
    auditTrail,
  };
}

/** Why a department sign-off was refused. The client maps these to i18n copy. */
export type DualApprovalRefusal =
  | 'DOC_NOT_FOUND'
  | 'NOT_IN_FLOW'
  | 'ALREADY_COMPLETE'
  | 'WRONG_STAGE'
  | 'DEPARTMENT_ALREADY_APPROVED'
  | 'SAME_ACTOR_BOTH_DEPARTMENTS';

/**
 * May `actor` sign `department` on this flow? `null` means yes.
 *
 * `SAME_ACTOR_BOTH_DEPARTMENTS` is the rule that makes the workflow dual: the
 * person who signed finance is not the second pair of eyes on legal. Submitting
 * a document is not a sign-off, so the submitter may still approve one
 * department — a two-person flow, not a three-person one.
 */
export function refusalForDepartmentApproval(
  row: PersistedApproval,
  department: Department,
  actor: ApprovalActor
): DualApprovalRefusal | null {
  const { userId } = requireActor(actor);
  if (!row.submittedAt || !row.submittedById) return 'NOT_IN_FLOW';
  if (stepOf(row.steps, department)) return 'DEPARTMENT_ALREADY_APPROVED';
  if (row.steps.some((s) => s.actorUserId === userId)) return 'SAME_ACTOR_BOTH_DEPARTMENTS';
  if (stepOf(row.steps, 'LEGAL')) return 'ALREADY_COMPLETE';
  // Finance first: legal signs off on a budget that finance has already cleared.
  if (department === 'LEGAL' && !stepOf(row.steps, 'FINANCE')) return 'WRONG_STAGE';
  return null;
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

// The approvals screen's request/approve/reject/cancel live in
// src/lib/approval-requests.ts (AKTAR-MURBCJ0A-1): they write to the database,
// and this module is imported by client components.
