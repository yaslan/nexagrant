'use server';

import { withTenant } from '@/lib/db';
import { errorMessage } from '@/lib/errors';
import { requireTenantAction } from '@/lib/tenant';
import { isPresentId } from '@/lib/required-id';
import { PILOT_EXPIRED_CODE, isPilotExpired, type PilotExpiredCode } from '@/lib/pilot-expired';
import { revalidatePath } from 'next/cache';
import { generateSeatCandidates } from './matching';
import { canConfirmSeat, inviteSeatCandidate } from './seat-transitions';

/**
 * M8 consortium matching.
 *
 * `tenantId` used to be an argument from the matching page, and both the
 * opportunity and the seat were addressed by id alone — so a guessed seat id
 * could be confirmed against another tenant's consortium. The tenant now comes
 * from the session and every row is matched on `(id, tenantId)`.
 */

// The route pattern, not a URL. It was missing the `[locale]` and `(app)`
// segments, so it matched no route and the page kept serving the candidate list
// from before the click.
const MATCHING_PATH = '/[locale]/(app)/[workspace]/opportunities/[id]/matching';

export async function computeSeatCandidates(opportunityId: string, seatId: string) {
  // Not `readOnly`: the matcher deletes the seat's candidates and writes new
  // ones (`runSeatMatch`), so an expired pilot is refused here, before anything
  // is read or deleted (İNCELEME-30 B-1, TASK-MUN39FIAKFY2R).
  const { tenantId } = await requireTenantAction();
  // Client-supplied: with `seatId` undefined the lookup below matches any seat
  // and the rewrite clears every seat's candidates (TASK-MUMSUA77J1C6Q).
  if (!isPresentId(seatId) || !isPresentId(opportunityId)) {
    throw new Error('Seat not found in this workspace.');
  }

  const seat = await withTenant<{ id: string } | null>(tenantId, (tx) =>
    tx.consortiumSeat.findFirst({
      where: { id: seatId, opportunityId, tenantId },
      select: { id: true },
    })
  );
  if (!seat) throw new Error(`Seat ${seatId} not found in this workspace.`);

  const created = await generateSeatCandidates(opportunityId, seatId, tenantId, 5);
  revalidatePath(MATCHING_PATH, 'page');
  return created;
}

/**
 * "Davet Et": invites one of the seat's candidates. The status is always
 * `INVITED` and the organisation must be on the seat's own candidate list; a
 * confirmed seat is not overwritten (src/modules/m8/server/seat-transitions.ts,
 * TASK-MUN509G2ICKWI). It used to take `status` from the client, so any member
 * could post `CONFIRMED` with a made-up PIC.
 */
export async function inviteCandidateToSeat(
  seatId: string,
  organizationId: string,
  opportunityId: string
) {
  const { tenantId } = await requireTenantAction();
  // Client-supplied: with either id missing the write below would reassign every
  // seat of the opportunity, or of the tenant (TASK-MUN2KUHP1BP18).
  if (!isPresentId(seatId) || !isPresentId(opportunityId)) {
    throw new Error('Seat not found in this workspace.');
  }

  const updated = await withTenant<number>(tenantId, (tx) =>
    inviteSeatCandidate(tx, { tenantId, seatId, organizationId, opportunityId })
  );
  if (updated === 0) {
    throw new Error(`Seat ${seatId} cannot be offered to this organisation in this workspace.`);
  }

  revalidatePath(MATCHING_PATH, 'page');
}

/**
 * Confirms the organisation already invited to a seat. Only a role with
 * `manage_approvals` (owner, admin, pipeline manager) may; the organisation is
 * read from the seat, not taken from the client.
 */
export async function confirmSeatAssignment(seatId: string, opportunityId: string) {
  const { tenantId, role } = await requireTenantAction();
  if (!canConfirmSeat(role)) {
    throw new Error('Your role cannot confirm consortium seats.');
  }
  if (!isPresentId(seatId) || !isPresentId(opportunityId)) {
    throw new Error('Seat not found in this workspace.');
  }

  const updated = await withTenant<number>(tenantId, async (tx) => {
    const seat = await tx.consortiumSeat.findFirst({
      where: { id: seatId, opportunityId, tenantId, status: 'INVITED' },
      select: { organizationId: true },
    });
    const organizationId = seat?.organizationId;
    if (!organizationId) return 0;

    const opp = await tx.opportunity.findFirst({
      where: { id: opportunityId, tenantId },
      select: { id: true, topicId: true }
    });

    if (!opp) return 0;

    // `Opportunity` carries a `topicId` column but no `topic` relation and no
    // `callId`, so the call is resolved in two steps rather than included —
    // `include: { topic: true }` threw PrismaClientValidationError here.
    const topic = opp.topicId
      ? await tx.topic.findUnique({ where: { id: opp.topicId }, select: { callId: true } })
      : null;

    if (topic?.callId) {
      const siblingTopics: { id: string }[] = await tx.topic.findMany({
        where: { callId: topic.callId },
        select: { id: true }
      });

      // The conflict check stays inside the tenant: another tenant's
      // consortium is none of this tenant's business and must not leak a
      // partner name through the error message.
      const conflict = await tx.consortiumSeat.findFirst({
        where: {
          tenantId,
          organizationId,
          status: 'CONFIRMED',
          opportunity: {
            topicId: { in: siblingTopics.map((t) => t.id) },
            id: { not: opportunityId },
            status: 'ACTIVE'
          }
        },
        include: { opportunity: true }
      });
      if (conflict) {
        throw new Error(`Conflict: Organization is already CONFIRMED in another active opportunity for the same call (${conflict.opportunity.title}).`);
      }
    }

    // The status and organisation read above are part of the WHERE clause, so a
    // re-invite between the read and this write confirms nothing.
    const result = await tx.consortiumSeat.updateMany({
      where: { id: seatId, opportunityId, tenantId, status: 'INVITED', organizationId },
      data: { status: 'CONFIRMED' }
    });
    return result.count;
  });

  if (updated === 0) throw new Error(`Seat ${seatId} has no invited organisation to confirm in this workspace.`);

  revalidatePath(MATCHING_PATH, 'page');
}

/**
 * The state the "Aday Bul" form renders.
 *
 * `computeSeatCandidates` throws, which in a server component form means the
 * user gets Next's error screen instead of an explanation. This wrapper turns a
 * failure into a message the page can show next to the button, and reports how
 * many candidates were written so an empty result can say *why* it is empty.
 */
export interface SeatCandidateFormState {
  status: 'idle' | 'ok' | 'error';
  message?: string;
  count?: number;
  /** Set for a pilot refusal: the button shows `Common.pilotExpired` instead of `message`. */
  code?: PilotExpiredCode;
}

export async function computeSeatCandidatesForm(
  _prev: SeatCandidateFormState,
  formData: FormData
): Promise<SeatCandidateFormState> {
  const opportunityId = String(formData.get('opportunityId') ?? '');
  const seatId = String(formData.get('seatId') ?? '');

  if (!opportunityId || !seatId) {
    return { status: 'error', message: 'Eksik istek: fırsat veya koltuk belirtilmedi.' };
  }

  try {
    const created = await computeSeatCandidates(opportunityId, seatId);
    return { status: 'ok', count: created.length };
  } catch (e) {
    // The refusal is caught here, so its digest never reaches the browser;
    // the code is what tells the button to say "pilot ended".
    if (isPilotExpired(e)) return { status: 'error', code: PILOT_EXPIRED_CODE };
    return { status: 'error', message: errorMessage(e) };
  }
}
