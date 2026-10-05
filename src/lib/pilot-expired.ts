/**
 * A write refused because the tenant's free pilot has ended, as the browser
 * sees it (TASK-MUMIIUEGJ6N8B, İNCELEME-17 Ö-1).
 *
 * The refusal itself is `PilotExpiredError` (src/lib/billing/pilot.ts), thrown
 * by `requireTenantAction`. Without this module the UI showed each action's
 * generic "… could not be saved. Please try again." — and trying again is
 * refused the same way. This file is the one place that recognises the refusal,
 * on both sides of a server action:
 *
 * - An action that lets the error escape: `requireTenantAction` stamps
 *   `digest = PILOT_EXPIRED_DIGEST` on it. Next.js keeps a digest that is
 *   already set, and in production that digest is the only thing the browser
 *   receives (the message is withheld), so `isPilotExpired` checks it.
 * - An action that turns every failure into a value (`{ ok: false, error:
 *   'failed' }`): its existing catch returns `failureCode(error, 'failed')`,
 *   which answers `'pilotExpired'` for this refusal.
 *
 * The client reads either shape with `useActionErrorText`
 * (src/lib/hooks/use-action-error-text.ts). No server-only import here: client
 * components import it too.
 */

/** The digest (and `code`) a pilot refusal carries across the action boundary. */
export const PILOT_EXPIRED_DIGEST = 'PILOT_EXPIRED';

/** The error code a value-returning action answers for a pilot refusal. */
export const PILOT_EXPIRED_CODE = 'pilotExpired';
export type PilotExpiredCode = typeof PILOT_EXPIRED_CODE;

/**
 * True for a pilot refusal in any shape it reaches us: the server-side error
 * (`code`), the error a rejected action gives the browser (`digest`), or the
 * code a value-returning action answered.
 */
export function isPilotExpired(error: unknown): boolean {
  if (error === PILOT_EXPIRED_CODE) return true;
  if (typeof error !== 'object' || error === null) return false;
  const { code, digest } = error as { code?: unknown; digest?: unknown };
  return code === PILOT_EXPIRED_DIGEST || digest === PILOT_EXPIRED_DIGEST;
}

/**
 * The error code for a caught value: `'pilotExpired'` for a pilot refusal,
 * `fallback` for anything else. For the catch-all of an action that reports
 * failures as values.
 */
export function failureCode<F extends string>(error: unknown, fallback: F): F | PilotExpiredCode {
  return isPilotExpired(error) ? PILOT_EXPIRED_CODE : fallback;
}
