'use server';

import { withTenant } from '@/lib/db';
import { ForbiddenRoleError, requireTenantAction } from '@/lib/tenant';
import { isPresentId } from '@/lib/required-id';
import { scoreCandidatesForSeat, detectConflicts } from '@/lib/scoring/consortium';
import { checkModuleAccess } from '@/lib/modules/access';
import { revalidatePath } from 'next/cache';
import { errorMessage } from '@/lib/errors';
import { CONFIRM_SEAT_PERMISSION, canConfirmSeat, inviteSeatCandidate } from '@/modules/m8/server/seat-transitions';
import { confirmSeatAssignment } from '@/modules/m8/server/actions';
import {
  SEAT_CONFIRM_CONFLICT_CODE,
  SEAT_NOT_CONFIRMABLE_CODE,
  SeatConfirmConflictError,
  SeatNotConfirmableError,
  type SeatConfirmErrorCode,
} from '@/modules/m8/server/errors';

/**
 * M8 consortium seats.
 *
 * Every action here used to resolve its tenant as
 * `session.tenantId ?? prisma.tenant.findFirst()` — the first row in the table,
 * which is whichever tenant happened to be seeded first — and then queried
 * seats by `id` alone. A seat id from another tenant was therefore readable and
 * writable. The tenant now comes from `requireTenantAction()` and every query
 * runs inside `withTenant`, matched on `(id, tenantId)`.
 */

const PIPELINE_PATH = '/[locale]/(app)/[workspace]/pipeline';

export type ConfirmSeatResult = { ok: true } | { ok: false; code: SeatConfirmErrorCode };

/**
 * The confirmation button: "the organisation confirmed its participation".
 *
 * The conflict and seat rules are `confirmSeatAssignment`'s; nothing is decided here. Its two
 * refusals the user can act on become codes, because Next hides a thrown message in production. A
 * role or pilot refusal leaves as it came, with the digest the screen reads. The role line asks the
 * same `canConfirmSeat`: the RBAC guard requires to see it in the file that exports the action.
 */
export async function confirmSeat(seatId: string, opportunityId: string, organizationId: string): Promise<ConfirmSeatResult> {
  const { role } = await requireTenantAction();
  if (!canConfirmSeat(role)) throw new ForbiddenRoleError(CONFIRM_SEAT_PERMISSION);
  try {
    await confirmSeatAssignment(seatId, opportunityId, organizationId);
  } catch (err) {
    if (err instanceof SeatConfirmConflictError) return { ok: false, code: SEAT_CONFIRM_CONFLICT_CODE };
    if (err instanceof SeatNotConfirmableError) return { ok: false, code: SEAT_NOT_CONFIRMABLE_CODE };
    throw err;
  }
  revalidatePath(PIPELINE_PATH, 'page');
  return { ok: true };
}

export async function addSeat(opportunityId: string, roleKey: string, required: boolean = true) {
  const { tenantId } = await requireTenantAction({ can: 'manage_workspaces' });

  const seat = await withTenant(tenantId, async (tx) => {
    // The opportunity must belong to this tenant; an id is guessable.
    const opp = await tx.opportunity.findFirst({
      where: { id: opportunityId, tenantId },
      select: { id: true },
    });
    if (!opp) return null;

    return tx.consortiumSeat.create({
      data: {
        tenantId,
        opportunityId,
        roleKey,
        required,
        status: 'OPEN',
      },
    });
  });

  if (!seat) {
    throw new Error(`Opportunity ${opportunityId} not found in this workspace.`);
  }

  revalidatePath(PIPELINE_PATH, 'page');
  return seat;
}

export async function findCandidates(seatId: string) {
  // Not `readOnly`: the scorer deletes the seat's SeatCandidate rows and writes
  // new ones, and the flag only skips the pilot check. An expired pilot is
  // refused here, before anything is read or deleted (TASK-MUN3W76B4XEJE; the
  // M8 twin is İNCELEME-30 B-1).
  const { tenantId } = await requireTenantAction({ can: 'manage_workspaces' });
  // Client-supplied: with `seatId` missing the lookup finds any seat and the
  // scorer's clear wipes every seat's candidates (TASK-MUN2KUHP1BP18).
  if (!isPresentId(seatId)) return [];

  const seat = await withTenant<{ id: string; opportunityId: string } | null>(tenantId, (tx) =>
    tx.consortiumSeat.findFirst({
      where: { id: seatId, tenantId },
      select: { id: true, opportunityId: true },
    })
  );

  if (!seat) return [];

  const opp = await withTenant<{ topicId: string | null } | null>(tenantId, (tx) =>
    tx.opportunity.findFirst({
      where: { id: seat.opportunityId, tenantId },
      select: { topicId: true },
    })
  );

  // `Opportunity.topicId` is a `Topic` cuid; the scorer resolves it to the topic
  // identifier itself, so it is passed through as an id rather than a code.
  // The live-demand reason line is shown only while M8 is on for the viewer; the
  // signal itself is always computed and stored with the candidate.
  const m8 = await checkModuleAccess('M8');
  const candidates = await scoreCandidatesForSeat(
    tenantId,
    seatId,
    seat.opportunityId,
    opp?.topicId || null,
    5,
    { liveDemandVisible: m8.allowed }
  );

  revalidatePath(PIPELINE_PATH, 'page');
  return candidates;
}

export async function assignSeat(seatId: string, organizationId: string) {
  const { tenantId } = await requireTenantAction({ can: 'manage_workspaces' });
  // Client-supplied: Prisma drops an `undefined` key from `where` (TASK-MUN2KUHP1BP18).
  if (!isPresentId(seatId)) return { success: false };

  // The organisation must be one of this seat's candidates and a confirmed seat
  // is not overwritten; any PIC the client made up used to be written as
  // INVITED (TASK-MUN509G2ICKWI). The write is `updateMany` on (id, tenantId).
  const updated = await withTenant<number>(tenantId, (tx) =>
    inviteSeatCandidate(tx, { tenantId, seatId, organizationId })
  );

  revalidatePath(PIPELINE_PATH, 'page');
  return { success: updated > 0 };
}

export async function getConflicts(opportunityId: string) {
  const { tenantId } = await requireTenantAction({ readOnly: true });

  const opp = await withTenant<{ id: string } | null>(tenantId, (tx) =>
    tx.opportunity.findFirst({
      where: { id: opportunityId, tenantId },
      select: { id: true },
    })
  );
  if (!opp) return [];

  try {
    return await detectConflicts(opportunityId, tenantId);
  } catch (e) {
    console.warn(`[getConflicts] error for ${opportunityId}: ${errorMessage(e)}`);
    return [];
  }
}
