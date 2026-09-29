import { NextResponse } from 'next/server';
import { withTenant } from '@/lib/db';
import { requireTenantApi } from '@/lib/tenant';
import { issueSecretToken } from '@/lib/secret-token';
import type { InvitationRow } from '@/types/db-rows';
import { assertSeatAvailable, SeatLimitReachedError, type SeatUsage } from '@/lib/billing/seat-limit';

/**
 * Invites a user into the caller's own tenant.
 *
 * The previous version resolved the tenant as
 * `session.tenantId ?? prisma.tenant.findFirst()` and, if the table was empty,
 * *created* a tenant called "FonBridge HQ" and invited into that. So a session
 * without a tenant could hand out membership of whichever tenant happened to be
 * seeded first. It also defaulted the caller's role to `TENANT_OWNER` and then
 * never checked it, and returned an invitation object with a fresh token when
 * the DB write failed — a link that can never be accepted.
 */

const INVITABLE_ROLES = new Set([
  'TENANT_ADMIN',
  'PIPELINE_MANAGER',
  'WRITER',
  'MEMBER',
  'GUEST_PARTNER',
]);

/** Roles allowed to invite into a tenant. */
const CAN_INVITE = new Set(['TENANT_OWNER', 'TENANT_ADMIN']);

export async function POST(req: Request) {
  try {
    const scope = await requireTenantApi({ write: true });
    if (!scope.ok) return scope.response;

    const { tenantId, role: callerRole } = scope.scope;

    if (!CAN_INVITE.has(callerRole)) {
      return NextResponse.json(
        { error: 'Bu işlem için yetkiniz yok. Yalnızca kurum sahibi veya yöneticisi davet gönderebilir.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const requestedRole = typeof body?.role === 'string' ? body.role : 'MEMBER';

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Geçerli bir e-posta adresi zorunludur.' }, { status: 400 });
    }

    // An invite must never grant more than the roles this endpoint offers; in
    // particular TENANT_OWNER is not invitable.
    const role = INVITABLE_ROLES.has(requestedRole) ? requestedRole : 'MEMBER';

    // Only the hash goes into the database (TASK-MULQLL2T8ZJX4); the raw token
    // leaves this handler once, inside `inviteLink`, and is never stored.
    const { raw: token, hash: tokenHash } = issueSecretToken();
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const result = await withTenant<{
      conflict: boolean;
      seatLimit: SeatUsage | null;
      invitation: InvitationRow | null;
    }>(tenantId, async (tx) => {
      const existingMembership = await tx.membership.findFirst({
        where: {
          tenantId,
          user: { email },
        },
      });

      if (existingMembership) {
        return { conflict: true, seatLimit: null, invitation: null };
      }

      // The plan's seat limit (src/lib/billing/seat-limit.ts): members plus
      // pending invitations may not exceed it.
      try {
        await assertSeatAvailable(tx, tenantId, email);
      } catch (error) {
        if (error instanceof SeatLimitReachedError) {
          return { conflict: false, seatLimit: error.usage, invitation: null };
        }
        throw error;
      }

      const invitation = await tx.invitation.upsert({
        where: { email_tenantId: { email, tenantId } },
        update: { tokenHash, role, expires },
        create: { email, tenantId, tokenHash, role, expires },
        select: { id: true, email: true, tenantId: true, role: true, expires: true },
      });

      return { conflict: false, seatLimit: null, invitation };
    });

    if (result.conflict) {
      return NextResponse.json(
        { error: 'Bu e-posta adresi zaten bu kurumun üyesidir.' },
        { status: 400 }
      );
    }

    if (result.seatLimit) {
      const { limit, members, pendingInvitations } = result.seatLimit;
      return NextResponse.json(
        {
          error:
            `Planınızın koltuk sınırına ulaşıldı (${limit} koltuk: ${members} üye, ` +
            `${pendingInvitations} bekleyen davet). Yeni davet için koltuk ekleyin ya da planınızı yükseltin.`,
          code: 'SEAT_LIMIT_REACHED',
          seats: { limit, members, pendingInvitations },
        },
        { status: 403 }
      );
    }

    const inviteLink = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/tr/accept-invite?token=${token}`;
    // The address itself is personal data; log that an invite went out, not to whom.
    console.log(`[Invitations] invitation issued for tenant ${tenantId}`);

    return NextResponse.json({ success: true, invitation: result.invitation, inviteLink });
  } catch (error) {
    console.error('Error creating invitation:', error);
    return NextResponse.json({ error: 'İç Sunucu Hatası' }, { status: 500 });
  }
}
