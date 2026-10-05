/**
 * TASK-MUMSUA77J1C6Q — guards for `where` values in test teardowns.
 *
 * Prisma reads a `where` key whose value is `undefined` as "not set", so
 * `tenant.deleteMany({ where: { id: tenantId } })` with `tenantId` still
 * undefined (setup threw before assigning it) is `DELETE FROM "Tenant"` — every
 * tenant in the database, cascading to Workspace and Membership. That is how
 * the shared dev DB lost all its tenants on 29.09 (TASK-MUMO37MNYHV42 B-4).
 *
 * Every variable that reaches a teardown `where` goes through one of these.
 * tests/teardown-where-guard.test.ts fails the build when one does not.
 */

/** The value, or a throw when it is missing — never a silently dropped filter. */
export function requireId<T extends string | number>(value: T | null | undefined, label: string): T {
  if (value === undefined || value === null || value === '') {
    throw new Error(
      `teardown: ${label} is ${value === '' ? 'empty' : String(value)}; refusing to run a filterless delete`
    );
  }
  return value;
}

/**
 * The ids that exist, for an `{ in: [...] }` filter. A setup that failed half
 * way still gets the rows it did create cleaned up; an empty list matches
 * nothing, which is the safe side.
 */
export function presentIds<T extends string | number>(values: readonly (T | null | undefined)[]): T[] {
  return values.filter((v): v is T => v !== undefined && v !== null && v !== '');
}
