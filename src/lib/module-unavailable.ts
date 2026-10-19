/**
 * An action refused by the module gate, as the browser sees it
 * (TASK-MUUS5HE3OW0CT).
 *
 * The refusal itself is `ModuleAccessError` (src/lib/modules/access.ts), thrown
 * by `assertModuleAccess`. It carries `digest = MODULE_UNAVAILABLE_DIGEST` for
 * the same reason a role refusal does (src/lib/forbidden-role.ts): in
 * production the digest is the only thing the browser receives, so without it
 * a closed module answered with nothing at all (M7's TTO form) or a "try again"
 * that trying again cannot change.
 *
 * The client reads it with `useActionErrorText`
 * (src/lib/hooks/use-action-error-text.ts). No server-only import here: client
 * components import it too.
 */

/** The digest (and `code`) a module refusal carries across the action boundary. */
export const MODULE_UNAVAILABLE_DIGEST = 'MODULE_ACCESS_DENIED';

/**
 * True for a module refusal in either shape it reaches us: the server-side
 * error (`code`) or the error a rejected action gives the browser (`digest`).
 */
export function isModuleUnavailable(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, digest } = error as { code?: unknown; digest?: unknown };
  return code === MODULE_UNAVAILABLE_DIGEST || digest === MODULE_UNAVAILABLE_DIGEST;
}
