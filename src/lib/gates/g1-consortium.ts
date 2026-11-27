import type { TenantTx } from '../db';
import { isPresentId } from '../required-id';
import { DEFAULT_GATE_RULES } from '../scoring/defaults';
import { visibleSeatCandidates } from '../scoring/seat-candidate-view';

/**
 * The consortium half of G1 (spec §12): critical roles filled, a backup for each, and a letter of
 * intent from each member (NG-364, NG-20 F11).
 *
 * One place for the three seat rules, read by the gate (src/lib/gates/evaluate.ts) and by the
 * consortium screen through `loadG1ConsortiumInputs`, so the screen shows what the gate will decide
 * instead of keeping its own copy of the rules (NG-20 F5/F6).
 */

export type G1Seat = {
  id: string;
  roleKey: string;
  required: boolean;
  status: string;
  organizationId: string | null;
  partnerOrgId: string | null;
  memberStage: string | null;
  loiReceivedAt: Date | null;
};

export type G1SeatCandidate = {
  seatId: string;
  organizationId: string | null;
  partnerOrgId: string | null;
  breakdown: unknown;
};

/** Someone sits on the seat: a CORDIS organisation or a tenant-private partner. */
export function seatNamesMember(seat: SeatMember): boolean {
  return Boolean(seat.organizationId || seat.partnerOrgId);
}

/** A CONFIRMED seat with no organisation confirms nobody (src/modules/m8/server/seat-transitions.ts). */
export function isSeatFilled(seat: G1Seat): boolean {
  return seat.status === 'CONFIRMED' && seatNamesMember(seat);
}

/** The two columns a seat or a candidate names its member by (the screen's rows carry them optionally). */
export type SeatMember = { organizationId: string | null; partnerOrgId?: string | null };

/**
 * A backup is someone other than whoever holds the seat; the matcher can list the holder too.
 * The consortium screen calls this as well (NG-20 Ö5): one rule, not a copy.
 */
export function isBackupFor(candidate: SeatMember, seat: SeatMember): boolean {
  const candidateOrg = candidate.organizationId ?? null;
  const candidatePartner = candidate.partnerOrgId ?? null;
  return (
    (candidateOrg !== null && candidateOrg !== (seat.organizationId ?? null)) ||
    (candidatePartner !== null && candidatePartner !== (seat.partnerOrgId ?? null))
  );
}

/** Stages at which the member has sent its letter of intent (MemberStage order: INTERESTED < MET < LOI < CONFIRMED). */
export const STAGES_WITH_LETTER: readonly string[] = ['LOI', 'CONFIRMED'];

/**
 * The seat's member has a letter of intent on file: someone sits on the seat, its stage is LOI or
 * later, and the letter's date is recorded. A stage moved back below LOI keeps the date for the
 * record but no longer counts. The columns are cleared when an invite seats another organisation,
 * so a former member's letter cannot count for the new one.
 */
export function hasLetterOfIntent(seat: Pick<G1Seat, 'organizationId' | 'partnerOrgId' | 'memberStage' | 'loiReceivedAt'>): boolean {
  return (
    seatNamesMember(seat) &&
    seat.memberStage !== null &&
    STAGES_WITH_LETTER.includes(seat.memberStage) &&
    seat.loiReceivedAt !== null
  );
}

export type G1ConsortiumFacts = {
  criticalSeats: G1Seat[];
  unfilled: G1Seat[];
  /** Only computed when candidates were read (`null` otherwise). */
  withoutBackup: G1Seat[] | null;
  /**
   * Critical seats whose member has no letter of intent. A seat that names nobody is not listed:
   * it is already in `unfilled`, and there is no member to ask a letter from.
   */
  withoutLetter: G1Seat[];
};

/** Pure: the G1 seat facts from the opportunity's seats and (optionally) their stored candidates. */
export function g1ConsortiumFacts(seats: readonly G1Seat[], candidates: readonly G1SeatCandidate[] | null): G1ConsortiumFacts {
  const criticalSeats = seats.filter((s) => s.required);
  // NG-100 B-1: a backup is a row the screens show, so gate and screen agree on who is a backup.
  const visible = candidates === null ? null : visibleSeatCandidates(candidates);
  return {
    criticalSeats,
    unfilled: criticalSeats.filter((s) => !isSeatFilled(s)),
    withoutBackup:
      visible === null ? null : criticalSeats.filter((s) => !visible.some((c) => c.seatId === s.id && isBackupFor(c, s))),
    withoutLetter: criticalSeats.filter((s) => seatNamesMember(s) && !hasLetterOfIntent(s)),
  };
}

/** The stored candidates of these seats, inside the tenant. */
export function readG1Candidates(tx: TenantTx, tenantId: string, seatIds: string[]): Promise<G1SeatCandidate[]> {
  return tx.seatCandidate.findMany({
    where: { tenantId, seatId: { in: seatIds } },
    select: { seatId: true, organizationId: true, partnerOrgId: true, breakdown: true },
  });
}

export type G1ConsortiumSeatView = {
  seatId: string;
  roleKey: string;
  required: boolean;
  filled: boolean;
  hasBackup: boolean;
  memberStage: string | null;
  memberStageAt: string | null;
  letterOfIntent: { onFile: boolean; receivedAt: string | null; documentUrl: string | null };
};

/** What the consortium screen needs to show the G1 conditions; the same facts the gate files as inputs. */
export type G1ConsortiumInputs = {
  criticalSeatsCount: number;
  unfilledCriticalRoles: string[];
  criticalRolesWithoutBackup: string[];
  criticalRolesWithoutLoi: string[];
  /**
   * Whether G1 refuses on `criticalRolesWithoutLoi` (`requireLetterOfIntentForCriticalSeats`). Off by
   * default (NG-364, owner decision 25.11.2026): the screen shows a missing letter, not a blocker.
   */
  letterOfIntentRequired: boolean;
  seats: G1ConsortiumSeatView[];
};

/**
 * The G1 consortium inputs of one opportunity, for the screen. `null` when the opportunity is not
 * this tenant's. Run inside `withTenant`; every read also carries its own `tenantId` clause.
 * Reads only, files nothing: the gate itself (`evaluateGate`) is what records a decision.
 */
export async function loadG1ConsortiumInputs(
  tx: TenantTx,
  tenantId: string,
  opportunityId: string,
): Promise<G1ConsortiumInputs | null> {
  if (!isPresentId(tenantId) || !isPresentId(opportunityId)) return null;
  const opp = await tx.opportunity.findFirst({ where: { id: opportunityId, tenantId }, select: { id: true } });
  if (!opp) return null;

  const seats = await tx.consortiumSeat.findMany({
    where: { tenantId, opportunityId },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      roleKey: true,
      required: true,
      status: true,
      organizationId: true,
      partnerOrgId: true,
      memberStage: true,
      memberStageAt: true,
      loiReceivedAt: true,
      loiDocumentUrl: true,
    },
  });
  const candidates = visibleSeatCandidates(await readG1Candidates(tx, tenantId, seats.map((s) => s.id)));
  const facts = g1ConsortiumFacts(seats, candidates);
  const withoutBackup = facts.withoutBackup ?? [];

  return {
    criticalSeatsCount: facts.criticalSeats.length,
    unfilledCriticalRoles: facts.unfilled.map((s) => s.roleKey),
    criticalRolesWithoutBackup: withoutBackup.map((s) => s.roleKey),
    criticalRolesWithoutLoi: facts.withoutLetter.map((s) => s.roleKey),
    letterOfIntentRequired: DEFAULT_GATE_RULES.G1.requireLetterOfIntentForCriticalSeats,
    seats: seats.map((s) => ({
      seatId: s.id,
      roleKey: s.roleKey,
      required: s.required,
      filled: isSeatFilled(s),
      hasBackup: candidates.some((c) => c.seatId === s.id && isBackupFor(c, s)),
      memberStage: s.memberStage,
      memberStageAt: s.memberStageAt?.toISOString() ?? null,
      letterOfIntent: {
        onFile: hasLetterOfIntent(s),
        receivedAt: s.loiReceivedAt?.toISOString() ?? null,
        documentUrl: s.loiDocumentUrl,
      },
    })),
  };
}
