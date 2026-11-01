import { NextResponse } from 'next/server';
import { requireTenantApi, type TenantScope } from '@/lib/tenant';

/**
 * Who may see and change a tenant's team (TASK-MUPUHBAE811KP, Y-3): the owner
 * and the tenant admin, the same two roles `POST /api/invitations` lets invite.
 * Every refusal carries a `code`, so the page words it in the viewer's
 * language instead of showing a Turkish sentence on /en (İNCELEME Ö-1).
 */
const CAN_MANAGE_TEAM = new Set(['TENANT_OWNER', 'TENANT_ADMIN']);

/** Audit event types written by the team routes. */
export const INVITATION_CANCELLED = 'invitation.cancelled';
export const MEMBER_REMOVED = 'member.removed';

export const NO_STORE = { 'Cache-Control': 'private, no-store' };

export type TeamAccess = { ok: true; scope: TenantScope } | { ok: false; response: NextResponse };

/** Session + tenant (+ writable pilot for a write) + owner/admin role. */
export async function requireTeamManager(opts: { write: boolean }): Promise<TeamAccess> {
  const access = await requireTenantApi({ write: opts.write });
  if (!access.ok) return access;
  if (!CAN_MANAGE_TEAM.has(access.scope.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Bu işlem için yetkiniz yok. Yalnızca kurum sahibi veya yöneticisi ekibi yönetebilir.',
          code: 'FORBIDDEN_ROLE',
        },
        { status: 403, headers: NO_STORE }
      ),
    };
  }
  return access;
}
