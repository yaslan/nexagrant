import { NextResponse } from 'next/server';
import { internalError } from '@/lib/api-error';
import { withTenant } from '@/lib/db';
import { NO_STORE, requireTeamManager } from '@/lib/team/access';

/**
 * The tenant's team: members and the invitations still waiting
 * (TASK-MUPUHBAE811KP, Y-3). Read-only, so it also works once the pilot has
 * ended. A pending invitation is one that is neither accepted nor expired —
 * exactly the rows `readSeatUsage` counts against the seat limit, which is why
 * cancelling one frees its seat. No invitation token or hash leaves here.
 */
export async function GET() {
  try {
    const access = await requireTeamManager({ write: false });
    if (!access.ok) return access.response;
    const { tenantId, userId, role } = access.scope;

    const { members, invitations } = await withTenant(tenantId, async (tx) => {
      const members = await tx.membership.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'asc' },
        select: { id: true, role: true, createdAt: true, user: { select: { id: true, name: true, email: true } } },
      });
      const invitations = await tx.invitation.findMany({
        where: { tenantId, acceptedAt: null, expires: { gt: new Date() } },
        orderBy: { createdAt: 'asc' },
        select: { id: true, email: true, role: true, createdAt: true, expires: true },
      });
      return { members, invitations };
    });

    return NextResponse.json(
      {
        me: { userId, role },
        members: members.map((m) => ({
          id: m.id,
          userId: m.user.id,
          name: m.user.name,
          email: m.user.email,
          role: m.role,
          joinedAt: m.createdAt.toISOString(),
        })),
        invitations: invitations.map((i) => ({
          id: i.id,
          email: i.email,
          role: i.role,
          sentAt: i.createdAt.toISOString(),
          expiresAt: i.expires.toISOString(),
        })),
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.error('Error listing team:', error);
    return internalError({ error: 'İç Sunucu Hatası' });
  }
}
