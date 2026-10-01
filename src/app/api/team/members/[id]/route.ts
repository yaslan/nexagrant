import { NextResponse } from 'next/server';
import { internalError } from '@/lib/api-error';
import { withTenant } from '@/lib/db';
import { isPresentId } from '@/lib/required-id';
import { MEMBER_REMOVED, NO_STORE, requireTeamManager } from '@/lib/team/access';

type Outcome = 'removed' | 'not_found' | 'self' | 'owner_forbidden' | 'last_owner';

/**
 * Removes a member from the caller's tenant (TASK-MUPUHBAE811KP, Y-3). `id` is
 * the membership id. Deleting the Membership row is the whole removal: the JWT
 * callback re-reads memberships, so the person's next request carries no
 * tenant (src/lib/auth.ts), and the seat is free because seats are counted
 * from the table. Rules:
 *   • you cannot remove yourself — leaving is a different, owner-aware flow;
 *   • only an owner removes an owner, and never the last one;
 *   • another tenant's membership id is a 404 (looked up by id + tenantId, RLS).
 * Owners are locked `FOR UPDATE` first, so two owners removing each other at
 * the same moment cannot leave the tenant with none. The audit row names the
 * membership by id, never the person.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireTeamManager({ write: true });
    if (!access.ok) return access.response;
    const { tenantId, userId, role: callerRole } = access.scope;

    const { id } = await params;
    if (!isPresentId(id)) return NextResponse.json({ error: 'Üye bulunamadı.', code: 'NOT_FOUND' }, { status: 404, headers: NO_STORE });

    const outcome = await withTenant<Outcome>(tenantId, async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Membership" WHERE "tenantId" = ${tenantId} AND "role" = 'TENANT_OWNER' FOR UPDATE`;
      const target = await tx.membership.findFirst({
        where: { id, tenantId },
        select: { id: true, userId: true, role: true },
      });
      if (!target) return 'not_found';
      if (target.userId === userId) return 'self';
      if (target.role === 'TENANT_OWNER') {
        if (callerRole !== 'TENANT_OWNER') return 'owner_forbidden';
        const owners = await tx.membership.count({ where: { tenantId, role: 'TENANT_OWNER' } });
        if (owners <= 1) return 'last_owner';
      }
      const { count } = await tx.membership.deleteMany({ where: { id, tenantId } });
      if (count === 0) return 'not_found';
      await tx.auditEvent.create({
        data: { tenantId, actorId: userId, type: MEMBER_REMOVED, target: target.id, data: { role: target.role } },
      });
      return 'removed';
    });

    switch (outcome) {
      case 'removed':
        return NextResponse.json({ success: true }, { headers: NO_STORE });
      case 'self':
        return NextResponse.json({ error: 'Kendinizi ekipten çıkaramazsınız.', code: 'CANNOT_REMOVE_SELF' }, { status: 400, headers: NO_STORE });
      case 'owner_forbidden':
        return NextResponse.json({ error: 'Kurum sahibini yalnızca başka bir kurum sahibi çıkarabilir.', code: 'CANNOT_REMOVE_OWNER' }, { status: 403, headers: NO_STORE });
      case 'last_owner':
        return NextResponse.json({ error: 'Kurumun son sahibi çıkarılamaz.', code: 'LAST_OWNER' }, { status: 409, headers: NO_STORE });
      default:
        return NextResponse.json({ error: 'Üye bulunamadı.', code: 'NOT_FOUND' }, { status: 404, headers: NO_STORE });
    }
  } catch (error) {
    console.error('Error removing member:', error);
    return internalError({ error: 'İç Sunucu Hatası' });
  }
}
