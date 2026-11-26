import type { TenantTx } from '@/lib/db';
import { STAGES_WITH_LETTER, seatNamesMember } from '@/lib/gates/g1-consortium';
import { isPresentId } from '@/lib/required-id';

/**
 * NG-364 (K-586296 = B) — where a seated consortium member stands: interested → met → letter of
 * intent → confirmed (NG-20 F1). The stage and the letter live on `ConsortiumSeat`; `SeatStatus`
 * stays the seat's lifecycle and is never written here.
 *
 * The rules, in one place (the screen asks the server; it does not copy them, NG-20 F5/F6):
 *
 * - Only a seat that names a member (CORDIS organisation or tenant-private partner) has a stage.
 *   A DECLINED seat has none: re-opening it goes through the invite.
 * - Forward moves may skip a stage (a letter can arrive at the first meeting). Going back is
 *   allowed below CONFIRMED; the letter's date and document stay for the record, but G1 counts a
 *   letter only at stage LOI or CONFIRMED (src/lib/gates/g1-consortium.ts `hasLetterOfIntent`).
 * - Stage CONFIRMED needs a CONFIRMED seat, and a CONFIRMED seat stays at stage CONFIRMED: the
 *   confirmation itself (`confirmSeatAssignment`, `manage_approvals`) is what moves it there.
 * - Letter fields only at LOI or CONFIRMED. Moving to LOI with no date records `now`; moving to
 *   CONFIRMED never invents a letter. A date after `now` is refused.
 */

export const MEMBER_STAGE_ORDER = ['INTERESTED', 'MET', 'LOI', 'CONFIRMED'] as const;
export type MemberStageValue = (typeof MEMBER_STAGE_ORDER)[number];

export type MemberStageSeat = {
  status: string;
  organizationId: string | null;
  partnerOrgId: string | null;
  memberStage: MemberStageValue | null;
  memberStageAt: Date | null;
  loiReceivedAt: Date | null;
  loiDocumentUrl: string | null;
};

export type MemberStageRequest = {
  to: MemberStageValue;
  loiReceivedAt?: Date;
  loiDocumentUrl?: string;
};

export type MemberStageRefusal =
  | 'NO_MEMBER'
  | 'SEAT_DECLINED'
  | 'SAME_STAGE'
  | 'SEAT_NOT_CONFIRMED'
  | 'SEAT_IS_CONFIRMED'
  | 'LOI_BEFORE_STAGE'
  | 'LOI_IN_FUTURE';

export type MemberStageChange = {
  memberStage: MemberStageValue;
  memberStageAt: Date;
  loiReceivedAt: Date | null;
  loiDocumentUrl: string | null;
};

export type MemberStagePlan = { ok: true; data: MemberStageChange } | { ok: false; code: MemberStageRefusal };

/** Pure: what moving `seat` to `request.to` writes, or why it may not. */
export function planMemberStageChange(seat: MemberStageSeat, request: MemberStageRequest, now: Date): MemberStagePlan {
  const { to } = request;
  if (!seatNamesMember(seat)) return { ok: false, code: 'NO_MEMBER' };
  if (seat.status === 'DECLINED') return { ok: false, code: 'SEAT_DECLINED' };

  const carriesLetter = STAGES_WITH_LETTER.includes(to);
  if (!carriesLetter && (request.loiReceivedAt !== undefined || request.loiDocumentUrl !== undefined)) {
    return { ok: false, code: 'LOI_BEFORE_STAGE' };
  }
  if (request.loiReceivedAt !== undefined && request.loiReceivedAt.getTime() > now.getTime()) {
    return { ok: false, code: 'LOI_IN_FUTURE' };
  }

  if (to === 'CONFIRMED' && seat.status !== 'CONFIRMED') return { ok: false, code: 'SEAT_NOT_CONFIRMED' };
  if (seat.status === 'CONFIRMED' && to !== 'CONFIRMED') return { ok: false, code: 'SEAT_IS_CONFIRMED' };

  const loiReceivedAt = request.loiReceivedAt ?? seat.loiReceivedAt ?? (to === 'LOI' ? now : null);
  const loiDocumentUrl = request.loiDocumentUrl ?? seat.loiDocumentUrl;

  const sameStage = seat.memberStage === to;
  const letterChanged =
    (loiReceivedAt?.getTime() ?? null) !== (seat.loiReceivedAt?.getTime() ?? null) || loiDocumentUrl !== seat.loiDocumentUrl;
  if (sameStage && !letterChanged) return { ok: false, code: 'SAME_STAGE' };

  return {
    ok: true,
    data: {
      memberStage: to,
      // Updating the letter of a member already at LOI is not a stage move.
      memberStageAt: sameStage ? (seat.memberStageAt ?? now) : now,
      loiReceivedAt,
      loiDocumentUrl,
    },
  };
}

export type SetMemberStageResult =
  | { ok: true; data: MemberStageChange }
  | { ok: false; code: MemberStageRefusal | 'SEAT_NOT_FOUND' | 'SEAT_CHANGED' };

/**
 * Moves the member stage of one seat. Run inside `withTenant`; reads and writes carry the tenant
 * and the opportunity. The write is guarded on the status, members, stage and letter it was
 * planned from, so an invite, confirmation, another stage move or a letter edit in between makes
 * it write nothing (`SEAT_CHANGED`) instead of overwriting it (NG-368).
 */
export async function setMemberStage(
  tx: TenantTx,
  args: { tenantId: string; opportunityId: string; seatId: string; request: MemberStageRequest; now: Date },
): Promise<SetMemberStageResult> {
  const { tenantId, opportunityId, seatId, request, now } = args;
  // A missing id would drop out of the `where` and match another seat (TASK-MUN2KUHP1BP18).
  if (!isPresentId(tenantId) || !isPresentId(opportunityId) || !isPresentId(seatId)) {
    return { ok: false, code: 'SEAT_NOT_FOUND' };
  }

  const seat = await tx.consortiumSeat.findFirst({
    where: { id: seatId, tenantId, opportunityId },
    select: {
      id: true,
      status: true,
      organizationId: true,
      partnerOrgId: true,
      memberStage: true,
      memberStageAt: true,
      loiReceivedAt: true,
      loiDocumentUrl: true,
    },
  });
  if (!seat) return { ok: false, code: 'SEAT_NOT_FOUND' };

  const plan = planMemberStageChange(seat, request, now);
  if (!plan.ok) return plan;

  const result = await tx.consortiumSeat.updateMany({
    where: {
      id: seatId,
      tenantId,
      opportunityId,
      status: seat.status,
      organizationId: seat.organizationId,
      partnerOrgId: seat.partnerOrgId,
      memberStage: seat.memberStage,
      // NG-368: the plan keeps the letter fields it read; without these a concurrent letter edit at
      // the same stage (one request the URL, the other the date) would be overwritten with the old value.
      loiReceivedAt: seat.loiReceivedAt,
      loiDocumentUrl: seat.loiDocumentUrl,
    },
    data: plan.data,
  });
  if (result.count === 0) return { ok: false, code: 'SEAT_CHANGED' };
  return plan;
}
