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

/** The codes `computeSeatCandidatesForm` answers besides the pilot and role refusals. */
export const SEAT_NOT_FOUND_CODE = 'seatNotFound';
export const COMPUTE_FAILED_CODE = 'computeFailed';
export type SeatCandidateErrorCode = typeof SEAT_NOT_FOUND_CODE | typeof COMPUTE_FAILED_CODE;
