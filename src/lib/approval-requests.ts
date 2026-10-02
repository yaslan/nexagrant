/**
 * The approvals screen (Onay Merkezi), written down — AKTAR-MURBCJ0A-1.
 *
 * These four functions used to live in src/lib/dual-approval.ts as stubs:
 * `createApprovalRequest` returned `{ id: 'req-<now>' }` and wrote nothing, and
 * approve / reject / cancel answered `success: true` unconditionally. The page
 * reads `ApprovalRequest` from the database, so a request vanished on reload
 * and a four-eyes approval was a toast with no row behind it (cae-fb K-2).
 *
 * Every rule is decided here, on the server, against the stored row:
 *
 *   • four eyes — the approver is not the requester;
 *   • the approver's role meets the row's `requiredRole` (rbac `canRoleApprove`);
 *   • only PENDING moves, and the move is a conditional `updateMany` on
 *     `status = 'PENDING'`: of two approvers racing, Postgres lets one row
 *     update through and the other finds count 0;
 *   • a request past `expiresAt` is refused, and the refusal writes EXPIRED;
 *   • only the requester cancels;
 *   • every query carries `tenantId`, inside `withTenant` (RLS
 *     `tenant_isolation`, prisma/rls.sql), so another tenant's id is "not found".
 *
 * Expiry is written when an action meets it, not when the page reads it: a page
 * render that writes would turn every GET into a write under the tenant's
 * transaction. The page shows a past-due PENDING row as EXPIRED
 * (`effectiveApprovalStatus`), so nobody is offered a button the server would
 * refuse, and the row catches up the first time someone acts on it.
 *
 * Refusals are values (`{ ok: false, error }`), never throws, so a refused
 * expiry still commits its EXPIRED write. Executing the approved action
 * (`executedAt`) is out of scope: nothing in the code base runs it yet.
 */
import { createHash } from 'node:crypto';
import type { ApprovalStatus, Prisma, Role } from '@prisma/client';

import { withTenant, type TenantTx } from '@/lib/db';
import { canRoleApprove, DUAL_APPROVAL_REQUIRED_ROLES, asRole, type DualApprovalActionType } from '@/lib/rbac';
import {
  APPROVAL_DESCRIPTION_MAX,
  APPROVAL_EXPIRY_HOURS_DEFAULT,
  APPROVAL_EXPIRY_HOURS_MAX,
  APPROVAL_PAYLOAD_MAX,
  APPROVAL_REASON_MAX,
  APPROVAL_TITLE_MAX,
  type ApprovalRequestError,
} from '@/lib/approval-request-rules';

export const APPROVAL_AUDIT = {
  requested: 'approval.requested',
  approved: 'approval.approved',
  rejected: 'approval.rejected',
  cancelled: 'approval.cancelled',
  expired: 'approval.expired',
} as const;

const PERSON = { select: { id: true, name: true, email: true } } as const;
const WITH_PEOPLE = { requester: PERSON, approver: PERSON } as const;

export type ApprovalRequestRow = Prisma.ApprovalRequestGetPayload<{ include: typeof WITH_PEOPLE }>;

export type ApprovalResult = { ok: true; request: ApprovalRequestRow } | { ok: false; error: ApprovalRequestError };

const refuse = (error: ApprovalRequestError) => ({ ok: false as const, error });

function isActionType(value: unknown): value is DualApprovalActionType {
  return typeof value === 'string' && Object.hasOwn(DUAL_APPROVAL_REQUIRED_ROLES, value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A server action argument is request body: anything but a non-blank string is no id. */
function isId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export interface CreateApprovalRequestInput {
  tenantId: string;
  requesterId: string;
  workspaceId?: string;
  actionType: unknown;
  title: unknown;
  description?: unknown;
  payload: unknown;
  requiredRole?: unknown;
  expiresInHours?: unknown;
}

type ValidCreate = {
  actionType: DualApprovalActionType;
  title: string;
  description: string | null;
  payload: Record<string, unknown>;
  requiredRole: Role;
  expiresInHours: number;
};

/** Pure: the input checks, so they are unit-testable without a database. */
export function validateCreateInput(
  input: Omit<CreateApprovalRequestInput, 'tenantId' | 'requesterId' | 'workspaceId'>
): { ok: true; value: ValidCreate } | { ok: false; error: ApprovalRequestError } {
  if (!isActionType(input.actionType)) return refuse('invalidActionType');

  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title) return refuse('titleRequired');
  if (title.length > APPROVAL_TITLE_MAX) return refuse('titleTooLong');

  if (input.description !== undefined && input.description !== null && typeof input.description !== 'string') {
    return refuse('descriptionTooLong');
  }
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (description.length > APPROVAL_DESCRIPTION_MAX) return refuse('descriptionTooLong');

  if (!isPlainObject(input.payload)) return refuse('invalidPayload');
  let serialized: string;
  try {
    serialized = JSON.stringify(input.payload);
  } catch {
    return refuse('invalidPayload');
  }
  if (serialized.length > APPROVAL_PAYLOAD_MAX) return refuse('payloadTooLarge');

  // The floor is the action type's; a requester may raise it, never lower it —
  // otherwise "who may approve this" would be chosen by the person asking.
  const floor = DUAL_APPROVAL_REQUIRED_ROLES[input.actionType];
  let requiredRole: Role = floor;
  if (input.requiredRole !== undefined && input.requiredRole !== null) {
    const asked = asRole(typeof input.requiredRole === 'string' ? input.requiredRole : null);
    if (!asked || !canRoleApprove(asked, floor)) return refuse('invalidRequiredRole');
    requiredRole = asked;
  }

  const hours = input.expiresInHours ?? APPROVAL_EXPIRY_HOURS_DEFAULT;
  if (typeof hours !== 'number' || !Number.isInteger(hours) || hours < 1 || hours > APPROVAL_EXPIRY_HOURS_MAX) {
    return refuse('invalidExpiry');
  }

  return {
    ok: true,
    value: {
      actionType: input.actionType,
      title,
      description: description || null,
      payload: JSON.parse(serialized) as Record<string, unknown>,
      requiredRole,
      expiresInHours: hours,
    },
  };
}

/** sha256 over what was asked for — the fingerprint the screen shows as "hash". */
function auditHashOf(fields: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(fields)).digest('hex');
}

export async function createApprovalRequest(input: CreateApprovalRequestInput): Promise<ApprovalResult> {
  const checked = validateCreateInput(input);
  if (!checked.ok) return checked;
  const v = checked.value;

  return withTenant(input.tenantId, async (tx) => {
    if (input.workspaceId !== undefined) {
      const ws = isId(input.workspaceId)
        ? await tx.workspace.findFirst({ where: { id: input.workspaceId, tenantId: input.tenantId }, select: { id: true } })
        : null;
      if (!ws) return refuse('invalidWorkspace');
    }

    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + v.expiresInHours * 3600_000);
    const request = await tx.approvalRequest.create({
      data: {
        tenantId: input.tenantId,
        workspaceId: input.workspaceId ?? null,
        actionType: v.actionType,
        title: v.title,
        description: v.description,
        payload: v.payload as Prisma.InputJsonObject,
        requiredRole: v.requiredRole,
        requesterId: input.requesterId,
        expiresAt,
        createdAt,
        auditHash: auditHashOf({
          tenantId: input.tenantId,
          requesterId: input.requesterId,
          actionType: v.actionType,
          title: v.title,
          description: v.description,
          payload: v.payload,
          requiredRole: v.requiredRole,
          expiresAt: expiresAt.toISOString(),
        }),
      },
      include: WITH_PEOPLE,
    });
    await audit(tx, input.tenantId, input.requesterId, APPROVAL_AUDIT.requested, request.id, {
      actionType: v.actionType,
      requiredRole: v.requiredRole,
    });
    return { ok: true as const, request };
  });
}

async function audit(
  tx: TenantTx,
  tenantId: string,
  actorId: string,
  type: string,
  target: string,
  data: Prisma.InputJsonObject
): Promise<void> {
  await tx.auditEvent.create({ data: { tenantId, actorId, type, target, data } });
}

/**
 * Writes EXPIRED when the row is PENDING and past due. Returns true when the row
 * is (now) expired. Conditional on PENDING, so it never overwrites a decision
 * that won a race against the clock.
 */
async function expireIfDue(
  tx: TenantTx,
  row: { id: string; tenantId: string; status: ApprovalStatus; expiresAt: Date },
  actorId: string,
  now: Date
): Promise<boolean> {
  if (row.status === 'EXPIRED') return true;
  if (row.status !== 'PENDING' || row.expiresAt.getTime() > now.getTime()) return false;
  const { count } = await tx.approvalRequest.updateMany({
    where: { id: row.id, tenantId: row.tenantId, status: 'PENDING' },
    data: { status: 'EXPIRED' },
  });
  if (count === 1) {
    await audit(tx, row.tenantId, actorId, APPROVAL_AUDIT.expired, row.id, { expiresAt: row.expiresAt.toISOString() });
  }
  return true;
}

type Decision = { status: 'APPROVED' } | { status: 'REJECTED'; reason: string };

async function decide(params: {
  requestId: unknown;
  tenantId: string;
  approverId: string;
  approverRole: unknown;
  decision: Decision;
}): Promise<ApprovalResult> {
  const { requestId, tenantId, approverId, decision } = params;
  if (!isId(requestId)) return refuse('notFound');

  return withTenant(tenantId, async (tx) => {
    const now = new Date();
    const row = await tx.approvalRequest.findFirst({ where: { id: requestId, tenantId } });
    if (!row) return refuse('notFound');
    if (await expireIfDue(tx, row, approverId, now)) return refuse('expired');
    if (row.status !== 'PENDING') return refuse('notPending');
    if (row.requesterId === approverId) return refuse('selfApproval');
    const role = asRole(typeof params.approverRole === 'string' ? params.approverRole : null);
    if (!role || !canRoleApprove(role, row.requiredRole)) return refuse('insufficientRole');

    // The read above is advice; this WHERE is the rule. A concurrent decision
    // holds the row lock, and once it commits this re-check finds no PENDING row.
    const { count } = await tx.approvalRequest.updateMany({
      where: { id: row.id, tenantId, status: 'PENDING', requesterId: { not: approverId }, expiresAt: { gt: now } },
      data: {
        status: decision.status,
        approverId,
        rejectionReason: decision.status === 'REJECTED' ? decision.reason : null,
      },
    });
    if (count !== 1) return refuse('notPending');

    await audit(
      tx,
      tenantId,
      approverId,
      decision.status === 'APPROVED' ? APPROVAL_AUDIT.approved : APPROVAL_AUDIT.rejected,
      row.id,
      { actionType: row.actionType, requiredRole: row.requiredRole, approverRole: role }
    );
    const request = await tx.approvalRequest.findFirst({ where: { id: row.id, tenantId }, include: WITH_PEOPLE });
    return { ok: true as const, request: request! };
  });
}

export async function approveApprovalRequest(params: {
  requestId: unknown;
  tenantId: string;
  approverId: string;
  approverRole: unknown;
}): Promise<ApprovalResult> {
  return decide({ ...params, decision: { status: 'APPROVED' } });
}

export async function rejectApprovalRequest(params: {
  requestId: unknown;
  tenantId: string;
  approverId: string;
  approverRole: unknown;
  reason: unknown;
}): Promise<ApprovalResult> {
  const reason = typeof params.reason === 'string' ? params.reason.trim() : '';
  if (!reason) return refuse('reasonRequired');
  if (reason.length > APPROVAL_REASON_MAX) return refuse('reasonTooLong');
  return decide({ ...params, decision: { status: 'REJECTED', reason } });
}

export async function cancelApprovalRequest(params: {
  requestId: unknown;
  tenantId: string;
  requesterId: string;
}): Promise<ApprovalResult> {
  const { requestId, tenantId, requesterId } = params;
  if (!isId(requestId)) return refuse('notFound');

  return withTenant(tenantId, async (tx) => {
    const now = new Date();
    const row = await tx.approvalRequest.findFirst({ where: { id: requestId, tenantId } });
    if (!row) return refuse('notFound');
    if (row.requesterId !== requesterId) return refuse('notRequester');
    if (await expireIfDue(tx, row, requesterId, now)) return refuse('expired');
    if (row.status !== 'PENDING') return refuse('notPending');

    const { count } = await tx.approvalRequest.updateMany({
      where: { id: row.id, tenantId, status: 'PENDING', requesterId },
      data: { status: 'CANCELLED' },
    });
    if (count !== 1) return refuse('notPending');

    await audit(tx, tenantId, requesterId, APPROVAL_AUDIT.cancelled, row.id, { actionType: row.actionType });
    const request = await tx.approvalRequest.findFirst({ where: { id: row.id, tenantId }, include: WITH_PEOPLE });
    return { ok: true as const, request: request! };
  });
}

/** The tenant's requests, newest first — what the approvals page lists. */
export async function listApprovalRequests(tenantId: string): Promise<ApprovalRequestRow[]> {
  return withTenant(tenantId, (tx) =>
    tx.approvalRequest.findMany({ where: { tenantId }, include: WITH_PEOPLE, orderBy: { createdAt: 'desc' } })
  );
}
