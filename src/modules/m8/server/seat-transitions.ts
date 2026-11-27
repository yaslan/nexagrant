import type { TenantTx } from '@/lib/db';
import { asRole, can } from '@/lib/rbac';
import { isPresentId } from '@/lib/required-id';
import { visibleSeatCandidates } from '@/lib/scoring/seat-candidate-view';

/**
 * Which consortium-seat writes the server allows, and to whom.
 *
 * The M8 matching page and the consortium page both invite a candidate to a
 * seat. Before TASK-MUN509G2ICKWI (İNCELEME-36 Y-1) both actions took the
 * organisation and — on the matching page — the status straight from the
 * client, with no role check: a MEMBER could post `CONFIRMED` with any made-up
 * PIC, and an invite could overwrite a seat another user had confirmed. The
 * rules now live here, next to neither action, so the two cannot drift apart.
 *
 * - Invite: a role with `manage_workspaces` (checked by the two actions,
 *   TASK-MUN80UOUPB2A4 — until then any tenant member), and only an organisation that is on this seat's
 *   own candidate list (`SeatCandidate`, tenant-scoped), and never over an
 *   organisation already confirmed on it. The status written is always `INVITED`.
 * - Confirm: only a role with `manage_approvals`, only an `INVITED` seat, and
 *   the organisation confirmed is the one already invited — the client names
 *   neither.
 */

/** Seat statuses an invite may replace. `CONFIRMED` is not one of them (unless the seat names no organisation). */
export const INVITABLE_SEAT_STATUSES = ['OPEN', 'CANDIDATE', 'INVITED', 'DECLINED'] as const;

/** The permission a role needs to move a seat from `INVITED` to `CONFIRMED`. */
export const CONFIRM_SEAT_PERMISSION = 'manage_approvals' as const;

export function canConfirmSeat(role: string | null | undefined): boolean {
  return can(asRole(role), CONFIRM_SEAT_PERMISSION);
}

/**
 * Invites `organizationId` to the seat. Returns the number of seats written:
 * 0 when the seat is not in this tenant (or opportunity), already has a
 * confirmed organisation, or the organisation is not one of its candidates.
 */
export async function inviteSeatCandidate(
  tx: TenantTx,
  args: { tenantId: string; seatId: string; organizationId: string; opportunityId?: string }
): Promise<number> {
  const { tenantId, seatId, organizationId, opportunityId } = args;
  // Client-supplied (the callers pass them through): a missing id would drop
  // out of the `where` below (TASK-MUN2KUHP1BP18).
  if (!isPresentId(tenantId) || !isPresentId(seatId) || !isPresentId(organizationId)) return 0;
  const current = await tx.consortiumSeat.findFirst({
    where: { id: seatId, tenantId, ...(opportunityId !== undefined ? { opportunityId } : {}) },
    select: { id: true, organizationId: true },
  });
  if (!current) return 0;

  // NG-100 B-1: only a row the screens show can be offered (visibleSeatCandidates).
  const candidates = visibleSeatCandidates(
    await tx.seatCandidate.findMany({
      where: { tenantId, seatId, organizationId },
      select: { id: true, breakdown: true },
    }),
  );
  if (candidates.length === 0) return 0;

  // NG-364: the member stage and the letter of intent belong to the organisation that was on the
  // seat. Another organisation starts with neither, or G1 would count the former member's letter.
  const memberChanges = current.organizationId !== organizationId;

  // `updateMany` so the tenant — and the status rule — stay in the WHERE clause. The organisation
  // read above is in it too: if another invite seats someone else in between, this writes nothing
  // rather than keep (or clear) a stage that belongs to a third organisation.
  const result = await tx.consortiumSeat.updateMany({
    where: {
      id: seatId,
      tenantId,
      organizationId: current.organizationId,
      // A CONFIRMED seat with no organisation (seed data has these) confirms
      // nobody, so it may still be offered.
      OR: [{ status: { in: [...INVITABLE_SEAT_STATUSES] } }, { organizationId: null }],
    },
    data: {
      organizationId,
      status: 'INVITED',
      ...(memberChanges ? { memberStage: null, memberStageAt: null, loiReceivedAt: null, loiDocumentUrl: null } : {}),
    },
  });
  // NG-33 B-1: the budget share is keyed to the seat, not to the member. An agreement the former
  // member gave does not carry to the next organisation (same rule as the letter of intent above).
  if (memberChanges && result.count > 0) {
    await tx.partnerBudgetShare.updateMany({
      where: { seatId, tenantId },
      data: { agreedAt: null, agreedById: null },
    });
  }
  return result.count;
}
