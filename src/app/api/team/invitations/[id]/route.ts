import { NextResponse } from 'next/server';
import { internalError } from '@/lib/api-error';
import { withTenant } from '@/lib/db';
import { isPresentId } from '@/lib/required-id';
import { INVITATION_CANCELLED, NO_STORE, requireTeamManager } from '@/lib/team/access';

/**
 * Cancels a pending invitation (TASK-MUPUHBAE811KP, Y-3). The row is deleted,
 * so the link stops working and the seat it held is free at once: the seat
 * count is read from the database (src/lib/billing/seat-limit.ts). Looked up by
 * (id, tenantId) under RLS, so another tenant's id answers 404, same as an
 * unknown one. An accepted invitation is a member now and is not touched here.
 * The audit row names the invitation by id, never by address.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireTeamManager({ write: true });
    if (!access.ok) return access.response;
    const { tenantId, userId } = access.scope;

    const { id } = await params;
    if (!isPresentId(id)) return NextResponse.json({ error: 'Davet bulunamadı.', code: 'NOT_FOUND' }, { status: 404, headers: NO_STORE });

    const cancelled = await withTenant(tenantId, async (tx) => {
      const row = await tx.invitation.findFirst({
        where: { id, tenantId, acceptedAt: null },
        select: { id: true, role: true },
      });
      if (!row) return false;
      // Rechecked in the delete itself: an accept between the read and here wins.
      const { count } = await tx.invitation.deleteMany({ where: { id, tenantId, acceptedAt: null } });
      if (count === 0) return false;
      await tx.auditEvent.create({
        data: { tenantId, actorId: userId, type: INVITATION_CANCELLED, target: row.id, data: { role: row.role } },
      });
      return true;
    });

    if (!cancelled) return NextResponse.json({ error: 'Davet bulunamadı.', code: 'NOT_FOUND' }, { status: 404, headers: NO_STORE });
    return NextResponse.json({ success: true }, { headers: NO_STORE });
  } catch (error) {
    console.error('Error cancelling invitation:', error);
    return internalError({ error: 'İç Sunucu Hatası' });
  }
}
