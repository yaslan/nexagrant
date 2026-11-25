/**
 * NG-20 Faz 1 — how a seat is drawn on the consortium screen. Display only: no gate rule here
 * (those stay in src/lib/gates/evaluate.ts), and no state change (src/modules/m8/server/
 * seat-transitions.ts). Pure, so the server page and the client manager share it and a unit
 * test covers it.
 */

/** `orgMap` key of a tenant-private partner, so it cannot collide with a CORDIS PIC (F8). */
export function partnerOrgKey(partnerOrgId: string): string {
  return `partner:${partnerOrgId}`;
}

/**
 * The three steps today's data can tell apart (NG-20 design F1–F3): a candidate list exists,
 * the organisation was invited, the organisation confirmed. "Interested", "met" and "letter of
 * intent" have no data yet (NG-364, Faz 2).
 */
export const SEAT_STEP_COUNT = 3;

export type SeatStage =
  | { kind: 'open'; step: 0 }
  | { kind: 'candidate'; step: 1 }
  | { kind: 'invited'; step: 2 }
  | { kind: 'confirmed'; step: 3 }
  | { kind: 'declined' }
  | { kind: 'unknown' };

/**
 * `CANDIDATE` is in the enum but nothing writes it (F3): the candidate step is read from the
 * seat's visible candidate rows instead.
 */
export function seatStage(status: string, candidateCount: number): SeatStage {
  switch (status) {
    case 'CONFIRMED':
      return { kind: 'confirmed', step: 3 };
    case 'INVITED':
      return { kind: 'invited', step: 2 };
    case 'DECLINED':
      return { kind: 'declined' };
    case 'OPEN':
    case 'CANDIDATE':
      return candidateCount > 0 || status === 'CANDIDATE' ? { kind: 'candidate', step: 1 } : { kind: 'open', step: 0 };
    default:
      return { kind: 'unknown' };
  }
}
