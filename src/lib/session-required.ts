/**
 * An action refused because the request has no signed-in tenant, as the
 * browser sees it (TASK-MV15MNI79MSWO, CE-693).
 *
 * The refusal itself is `TenantScopeError` (src/lib/tenant.ts), thrown by
 * `requireTenantAction` and, ahead of it, by `assertModuleAccess`
 * (src/lib/modules/access.ts) when the module gate finds no session. Before
 * this, the gate answered a lost session with `ModuleAccessError`, so a user
 * whose session had expired was told the module was switched off or outside
 * the plan, and sent to an administrator who could not help. The error now
 * carries `digest = SESSION_REQUIRED_DIGEST` for the same reason a role
 * refusal does (src/lib/forbidden-role.ts): in production the digest is the
 * only thing the browser receives.
 *
 * The client reads it with `useActionErrorText`
 * (src/lib/hooks/use-action-error-text.ts). No server-only import here: client
 * components import it too.
 */

/** The digest (and `code`) a missing-session refusal carries across the action boundary. */
export const SESSION_REQUIRED_DIGEST = 'TENANT_SCOPE_REQUIRED';

/**
 * True for a missing-session refusal in either shape it reaches us: the
 * server-side error (`code`) or the error a rejected action gives the browser
 * (`digest`).
 */
export function isSessionRequired(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, digest } = error as { code?: unknown; digest?: unknown };
  return code === SESSION_REQUIRED_DIGEST || digest === SESSION_REQUIRED_DIGEST;
}
