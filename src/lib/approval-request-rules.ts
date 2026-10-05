/**
 * The approvals screen's (Onay Merkezi) limits and refusal codes — AKTAR-MURBCJ0A-1.
 *
 * No server-only import here: the client component reads the same limits for
 * its `maxLength` attributes and maps the same codes to i18n copy, so the
 * browser and the server can never disagree about what a code is called. The
 * server (src/lib/approval-requests.ts) is the one that enforces them.
 */

export const APPROVAL_TITLE_MAX = 200;
export const APPROVAL_DESCRIPTION_MAX = 2000;
/** Serialized JSON length of the payload. */
export const APPROVAL_PAYLOAD_MAX = 10_000;
export const APPROVAL_REASON_MAX = 1000;
export const APPROVAL_EXPIRY_HOURS_DEFAULT = 48;
export const APPROVAL_EXPIRY_HOURS_MAX = 24 * 30;

/**
 * Every refusal an approvals action answers as a value. The client shows
 * `Approvals.errors.<code>`; tests/approval-requests.test.ts checks that both
 * locales carry a key spelled exactly like each code.
 */
export const APPROVAL_REQUEST_ERRORS = [
  'invalidActionType',
  'invalidRequiredRole',
  'invalidExpiry',
  'invalidWorkspace',
  'titleRequired',
  'titleTooLong',
  'descriptionTooLong',
  'invalidPayload',
  'payloadTooLarge',
  'reasonRequired',
  'reasonTooLong',
  'notFound',
  'notPending',
  'expired',
  'selfApproval',
  'insufficientRole',
  'notRequester',
] as const;

export type ApprovalRequestError = (typeof APPROVAL_REQUEST_ERRORS)[number];

/**
 * The status a reader should see. A PENDING row past its `expiresAt` is shown
 * as EXPIRED before any action has written that down (see `expireIfDue`).
 */
export function effectiveApprovalStatus(status: string, expiresAt: Date | string, now = new Date()): string {
  return status === 'PENDING' && new Date(expiresAt).getTime() <= now.getTime() ? 'EXPIRED' : status;
}
