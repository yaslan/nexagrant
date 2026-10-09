/**
 * Who may archive an opportunity.
 *
 * Lives outside the server-action file because both sides need it: `pipeline/actions.ts`
 * enforces it (a `'use server'` module can only export async functions, so the rule cannot live
 * there and still be readable by a page), and `pipeline/[id]/page.tsx` reads it to decide
 * whether to render the control at all. One rule, two call sites — never two copies.
 */

/** Roles that may archive any opportunity in the tenant, whoever owns it. */
export const ARCHIVE_ROLES: ReadonlySet<string> = new Set([
  'TENANT_OWNER',
  'TENANT_ADMIN',
  'PIPELINE_MANAGER',
]);

/**
 * Everyone outside {@link ARCHIVE_ROLES} may archive only an opportunity they own.
 *
 * An unowned opportunity (`ownerId: null`) is archivable only by the pipeline roles: "nobody
 * owns it" must not read as "everybody owns it".
 */
export function canArchiveOpportunity(
  role: string,
  ownerId: string | null,
  userId: string,
): boolean {
  if (ARCHIVE_ROLES.has(role)) return true;
  return ownerId !== null && ownerId === userId;
}
