'use server';

import { withTenant } from '@/lib/db';
import { errorMessage } from '@/lib/errors';
import { requireTenantAction } from '@/lib/tenant';
import { revalidatePath } from 'next/cache';
import { generateSeatCandidates } from './matching';

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
  const { tenantId } = await requireTenantAction({ readOnly: true });

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

export async function assignCandidateToSeat(
  seatId: string,
  organizationId: string,
  status: 'CANDIDATE' | 'INVITED' | 'CONFIRMED',
  opportunityId: string
) {
  const { tenantId } = await requireTenantAction();

  const updated = await withTenant<number>(tenantId, async (tx) => {
    if (status === 'CONFIRMED') {
      const opp = await tx.opportunity.findFirst({
        where: { id: opportunityId, tenantId },
        select: { id: true, topicId: true }
      });

      if (!opp) throw new Error(`Opportunity ${opportunityId} not found in this workspace.`);

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
    }

    // `updateMany` so the tenant stays in the WHERE clause.
    const result = await tx.consortiumSeat.updateMany({
      where: { id: seatId, opportunityId, tenantId },
      data: {
        organizationId,
        status
      }
    });
    return result.count;
  });

  if (updated === 0) throw new Error(`Seat ${seatId} not found in this workspace.`);

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
    return { status: 'error', message: errorMessage(e) };
  }
}
