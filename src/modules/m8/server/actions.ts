'use server';

import { withTenant } from '@/lib/db';
import { ForbiddenRoleError, requireTenantAction } from '@/lib/tenant';
import { isPresentId } from '@/lib/required-id';
import { PILOT_EXPIRED_CODE, isPilotExpired, type PilotExpiredCode } from '@/lib/pilot-expired';
import { FORBIDDEN_ROLE_CODE, isForbiddenRole, type ForbiddenRoleCode } from '@/lib/forbidden-role';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { generateSeatCandidates } from './matching';
import { MEMBER_STAGE_ORDER, setMemberStage, type MemberStageRefusal, type MemberStageValue } from './member-stage';
import { CONFIRM_SEAT_PERMISSION, canConfirmSeat, inviteSeatCandidate } from './seat-transitions';
import {
  SeatConfirmConflictError,
  SeatNotConfirmableError,
  COMPUTE_FAILED_CODE,
  SEAT_NOT_FOUND_CODE,
  SeatNotFoundError,
  type SeatCandidateErrorCode,
} from './errors';

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
  const { tenantId } = await requireTenantAction({ can: 'manage_workspaces' });
  // Client-supplied: with `seatId` undefined the lookup below matches any seat
  // and the rewrite clears every seat's candidates (TASK-MUMSUA77J1C6Q).
  if (!isPresentId(seatId) || !isPresentId(opportunityId)) {
    throw new SeatNotFoundError('Seat not found in this workspace.');
  }

  const seat = await withTenant<{ id: string } | null>(tenantId, (tx) =>
    tx.consortiumSeat.findFirst({
      where: { id: seatId, opportunityId, tenantId },
      select: { id: true },
    })
  );
  if (!seat) throw new SeatNotFoundError(`Seat ${seatId} not found in this workspace.`);

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
  const { tenantId } = await requireTenantAction({ can: 'manage_workspaces' });
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
 * read from the seat, not taken from the client. `expectedOrganizationId` only
 * narrows: a button that named one organisation does not confirm another one
 * invited to the seat since the page rendered.
 */
export async function confirmSeatAssignment(seatId: string, opportunityId: string, expectedOrganizationId?: string) {
  const { tenantId, role } = await requireTenantAction();
  if (!canConfirmSeat(role)) {
    throw new ForbiddenRoleError(CONFIRM_SEAT_PERMISSION);
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
    if (expectedOrganizationId !== undefined && expectedOrganizationId !== organizationId) return 0;

    const opp = await tx.opportunity.findFirst({
      where: { id: opportunityId, tenantId },
      select: { id: true, topicId: true }
    });

    if (!opp) return 0;

    // `Opportunity` carries a `topicId` column but no `topic` relation and no
    // `callId`, so the call is resolved in two steps rather than included —
    // `include: { topic: true }` threw PrismaClientValidationError here.
    // The column holds the Topic's id or its portal identifier: the board form
    // and the call page write the identifier (see src/lib/scoring/g0-compute.ts).
    // Looked up by id alone, the rule never fired on an opportunity a user opened.
    const topic = opp.topicId
      ? ((await tx.topic.findUnique({ where: { id: opp.topicId }, select: { callId: true } })) ??
        (await tx.topic.findUnique({ where: { identifier: opp.topicId }, select: { callId: true } })))
      : null;

    if (topic?.callId) {
      const siblingTopics: { id: string; identifier: string }[] = await tx.topic.findMany({
        where: { callId: topic.callId },
        select: { id: true, identifier: true }
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
            topicId: { in: siblingTopics.flatMap((t) => [t.id, t.identifier]) },
            id: { not: opportunityId },
            status: 'ACTIVE'
          }
        },
        include: { opportunity: true }
      });
      if (conflict) {
        throw new SeatConfirmConflictError(`Conflict: Organization is already CONFIRMED in another active opportunity for the same call (${conflict.opportunity.title}).`);
      }
    }

    // The status and organisation read above are part of the WHERE clause, so a
    // re-invite between the read and this write confirms nothing.
    const result = await tx.consortiumSeat.updateMany({
      where: { id: seatId, opportunityId, tenantId, status: 'INVITED', organizationId },
      // NG-364: the member stage follows the seat (member-stage.ts). The letter of intent is not
      // touched: confirming does not invent one, and G1 still asks for it.
      data: { status: 'CONFIRMED', memberStage: 'CONFIRMED', memberStageAt: new Date() }
    });
    return result.count;
  });

  if (updated === 0) throw new SeatNotConfirmableError(`Seat ${seatId} has no invited organisation to confirm in this workspace.`);

  revalidatePath(MATCHING_PATH, 'page');
}

const CONSORTIUM_PATH = '/[locale]/(app)/[workspace]/pipeline/[id]/consortium';

/**
 * NG-364 input of `setSeatMemberStage`. The letter's document must be an https link: the screen
 * renders it as one, so `javascript:` or `data:` must never reach the row. A date-only value is
 * read as UTC midnight (CLAUDE.md §10: the database is UTC).
 */
const MemberStageInput = z.object({
  seatId: z.string().trim().min(1).max(64),
  opportunityId: z.string().trim().min(1).max(64),
  stage: z.enum(MEMBER_STAGE_ORDER),
  loiReceivedAt: z.union([z.iso.date(), z.iso.datetime({ offset: true })]).optional(),
  loiDocumentUrl: z.url({ protocol: /^https$/ }).max(2048).optional(),
});

export type SetSeatMemberStageResult =
  | {
      ok: true;
      memberStage: MemberStageValue;
      memberStageAt: string;
      loiReceivedAt: string | null;
      loiDocumentUrl: string | null;
    }
  | { ok: false; code: 'INVALID_INPUT' | 'SEAT_NOT_FOUND' | 'SEAT_CHANGED' | MemberStageRefusal };

/**
 * NG-364 (K-586296 = B): moves the member stage of a consortium seat (interested → met → letter
 * of intent → confirmed) and records the letter. The rules are `planMemberStageChange`'s
 * (member-stage.ts); this action checks the role, validates the input and answers a code the
 * screen translates. Same permission as the invite: stage CONFIRMED needs a seat the confirmation
 * (`manage_approvals`) has already moved, so this action cannot confirm anyone.
 */
export async function setSeatMemberStage(input: unknown): Promise<SetSeatMemberStageResult> {
  const { tenantId } = await requireTenantAction({ can: 'manage_workspaces' });
  const parsed = MemberStageInput.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'INVALID_INPUT' };
  const { seatId, opportunityId, stage, loiReceivedAt, loiDocumentUrl } = parsed.data;

  const result = await withTenant(tenantId, (tx) =>
    setMemberStage(tx, {
      tenantId,
      opportunityId,
      seatId,
      request: {
        to: stage,
        ...(loiReceivedAt !== undefined ? { loiReceivedAt: new Date(loiReceivedAt) } : {}),
        ...(loiDocumentUrl !== undefined ? { loiDocumentUrl } : {}),
      },
      now: new Date(),
    }),
  );
  if (!result.ok) return result;

  revalidatePath(CONSORTIUM_PATH, 'page');
  return {
    ok: true,
    memberStage: result.data.memberStage,
    memberStageAt: result.data.memberStageAt.toISOString(),
    loiReceivedAt: result.data.loiReceivedAt?.toISOString() ?? null,
    loiDocumentUrl: result.data.loiDocumentUrl,
  };
}

/**
 * The state the "Aday Bul" form renders.
 *
 * `computeSeatCandidates` throws, which in a server component form means the
 * user gets Next's error screen instead of an explanation. This wrapper turns a
 * failure into a code the button translates, and reports how many candidates
 * were written so an empty result can say *why* it is empty.
 *
 * The failure is a code, never the caught error's text: that text used to be
 * returned as `message`, and a Prisma error carried table and column names to
 * the browser with it (TASK-MUNZ7N9IT8VPY). The detail goes to the server log.
 */
export interface SeatCandidateFormState {
  status: 'idle' | 'ok' | 'error';
  count?: number;
  /**
   * Set with every `'error'`: a pilot or role refusal (`Common.pilotExpired` /
   * `Common.forbiddenRole`), a seat that is not in this workspace
   * (`Consortium.seatNotFound`), or anything else (`Consortium.computeFailed`).
   */
  code?: PilotExpiredCode | ForbiddenRoleCode | SeatCandidateErrorCode;
}

export async function computeSeatCandidatesForm(
  _prev: SeatCandidateFormState,
  formData: FormData
): Promise<SeatCandidateFormState> {
  const opportunityId = String(formData.get('opportunityId') ?? '');
  const seatId = String(formData.get('seatId') ?? '');

  if (!opportunityId || !seatId) {
    return { status: 'error', code: SEAT_NOT_FOUND_CODE };
  }

  try {
    const created = await computeSeatCandidates(opportunityId, seatId);
    return { status: 'ok', count: created.length };
  } catch (e) {
    // The refusal is caught here, so its digest never reaches the browser;
    // the code is what tells the button to say "pilot ended".
    if (isPilotExpired(e)) return { status: 'error', code: PILOT_EXPIRED_CODE };
    if (isForbiddenRole(e)) return { status: 'error', code: FORBIDDEN_ROLE_CODE };
    if (e instanceof SeatNotFoundError) return { status: 'error', code: SEAT_NOT_FOUND_CODE };
    console.error('[m8] computeSeatCandidatesForm failed', e);
    return { status: 'error', code: COMPUTE_FAILED_CODE };
  }
}
