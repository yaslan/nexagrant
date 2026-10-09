/**
 * A write refused because the caller's role does not carry the permission the
 * action needs, as the browser sees it (TASK-MUN80UOUPB2A4, FB GÜVENLİK Y-3).
 *
 * The refusal itself is `ForbiddenRoleError` (src/lib/tenant.ts), thrown by
 * `requireTenantAction({ can })` and `assertTenantActionRole`. It carries
 * `digest = FORBIDDEN_ROLE_DIGEST` for the same reason a pilot refusal does
 * (src/lib/pilot-expired.ts): in production the digest is the only thing the
 * browser receives, and without it every screen would answer "… please try
 * again" to a refusal that trying again cannot change.
 *
 * No server-only import here: client components import it too.
 */

/** The digest (and `code`) a role refusal carries across the action boundary. */
export const FORBIDDEN_ROLE_DIGEST = 'FORBIDDEN_ROLE';

/** The error code a value-returning action answers for a role refusal. */
export const FORBIDDEN_ROLE_CODE = 'forbiddenRole';
export type ForbiddenRoleCode = typeof FORBIDDEN_ROLE_CODE;

/**
 * True for a role refusal in any shape it reaches us: the server-side error
 * (`code`), the error a rejected action gives the browser (`digest`), or the
 * code a value-returning action answered.
 */
export function isForbiddenRole(error: unknown): boolean {
  if (error === FORBIDDEN_ROLE_CODE) return true;
  if (typeof error !== 'object' || error === null) return false;
  const { code, digest } = error as { code?: unknown; digest?: unknown };
  return code === FORBIDDEN_ROLE_DIGEST || digest === FORBIDDEN_ROLE_DIGEST;
}
