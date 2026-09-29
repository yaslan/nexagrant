'use server';

/**
 * Invite-code actions of the agency dashboard, over B1's database half
 * (src/lib/agency/codes.ts). Known refusals come back as result values, because
 * a server action that throws reaches the browser as a generic error in
 * production and the form could not say what was wrong.
 */
import { revalidatePath } from 'next/cache';
import { withTenant } from '@/lib/db';
import { asRole, can } from '@/lib/rbac';
import { requireTenantAction } from '@/lib/tenant';
import { failureCode, type PilotExpiredCode } from '@/lib/pilot-expired';
import {
  AgencyInviteError,
  createInviteCodeIn,
  expiryFromDay,
  listInviteCodesIn,
  revokeInviteCodeIn,
  type InviteCodeSummary,
} from '@/lib/agency/codes';
import { AgencyPermissionError } from '@/lib/agency/errors';

/**
 * Same rules as src/lib/agency/actions.ts (B1): create and revoke need
 * `manage_users`, listing is open to the agency's members.
 */
async function managerScope() {
  const scope = await requireTenantAction();
  if (!can(asRole(scope.role), 'manage_users')) throw new AgencyPermissionError();
  return scope;
}

export type InviteActionError = 'forbidden' | 'invalidExpiry' | 'notAgency' | 'failed' | PilotExpiredCode;

function errorCode(e: unknown): InviteActionError {
  if (e instanceof AgencyPermissionError) return 'forbidden';
  if (e instanceof AgencyInviteError) {
    if (e.code === 'INVALID_EXPIRY') return 'invalidExpiry';
    return 'notAgency';
  }
  return failureCode(e, 'failed');
}

function revalidate() {
  revalidatePath('/[locale]/ajans', 'page');
  revalidatePath('/[locale]/agency', 'page');
}

export async function createInviteCode(input: {
  /** yyyy-mm-dd; the code stays valid through the end of that day (UTC). */
  expiresOn: string;
  label: string;
}): Promise<
  | { ok: true; code: string; hint: string; expiresAt: string }
  | { ok: false; error: InviteActionError }
> {
  const expiresAt = expiryFromDay(input.expiresOn);
  try {
    const scope = await managerScope();
    const created = await withTenant(scope.tenantId, (tx) =>
      createInviteCodeIn(tx, {
        tenantId: scope.tenantId,
        createdBy: scope.userId,
        expiresAt,
        label: input.label.slice(0, 80),
      })
    );
    revalidate();
    return {
      ok: true,
      code: created.code,
      hint: created.hint,
      expiresAt: created.expiresAt.toISOString(),
    };
  } catch (e) {
    return { ok: false, error: errorCode(e) };
  }
}

export async function revokeInviteCode(id: string): Promise<{ ok: true; revoked: boolean } | { ok: false; error: InviteActionError }> {
  try {
    const scope = await managerScope();
    const revoked = await withTenant(scope.tenantId, (tx) =>
      revokeInviteCodeIn(tx, { tenantId: scope.tenantId, id, revokedBy: scope.userId })
    );
    revalidate();
    return { ok: true, revoked };
  } catch (e) {
    return { ok: false, error: errorCode(e) };
  }
}

/** B-1 (TASK-MUM17YBJVAHRR): each code's status, never its use count. */
export async function listInviteCodes(): Promise<InviteCodeSummary[]> {
  const scope = await requireTenantAction({ readOnly: true });
  return withTenant(scope.tenantId, (tx) => listInviteCodesIn(tx, scope.tenantId));
}
