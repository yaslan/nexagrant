/**
 * The failures of an M8 matching run that the user can be told about
 * (TASK-MUNZ7N9IT8VPY, İNCELEME-75 follow-up).
 *
 * `computeSeatCandidatesForm` used to hand `errorMessage(e)` back to the button,
 * so a Prisma error travelled to the browser with the query shape in it. The
 * form now answers a code; a failure is only told apart from "something went
 * wrong" when it is one of these classes. The message stays for the server log.
 *
 * No `'use server'` here: that file may only export async functions.
 */

/** The seat or its opportunity is missing, or not in the caller's workspace. */
export class SeatNotFoundError extends Error {
  readonly code = 'M8_SEAT_NOT_FOUND';
  constructor(message: string) {
    super(message);
    this.name = 'SeatNotFoundError';
  }
}

/**
 * The organisation is already confirmed on another active opportunity on the same call. The message
 * names that opportunity for the server log; the screen gets a code, because the opportunity may sit
 * in a workspace the viewer cannot open.
 */
export class SeatConfirmConflictError extends Error {
  readonly code = 'M8_SEAT_CONFIRM_CONFLICT';
  constructor(message: string) {
    super(message);
    this.name = 'SeatConfirmConflictError';
  }
}

/** The confirmation matched no row: the seat is not invited, or not to the organisation on screen. */
export class SeatNotConfirmableError extends Error {
  readonly code = 'M8_SEAT_NOT_CONFIRMABLE';
  constructor(message: string) {
    super(message);
    this.name = 'SeatNotConfirmableError';
  }
}

/** The refusals of a seat confirmation, as `Consortium` message keys. */
export const SEAT_CONFIRM_CONFLICT_CODE = 'seatConfirmConflict';
export const SEAT_NOT_CONFIRMABLE_CODE = 'seatNotConfirmable';
export type SeatConfirmErrorCode = typeof SEAT_CONFIRM_CONFLICT_CODE | typeof SEAT_NOT_CONFIRMABLE_CODE;

/** The codes `computeSeatCandidatesForm` answers besides the pilot and role refusals. */
export const SEAT_NOT_FOUND_CODE = 'seatNotFound';
export const COMPUTE_FAILED_CODE = 'computeFailed';
export type SeatCandidateErrorCode = typeof SEAT_NOT_FOUND_CODE | typeof COMPUTE_FAILED_CODE;
