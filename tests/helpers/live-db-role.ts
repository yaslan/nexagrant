/**
 * Guards for the `*.live.test.ts` suites (TASK-MULRU574R88BA, K-6 of
 * TASK-MULQLVLW21FE2).
 *
 * A live test can go green for the wrong reason in two ways, and neither shows
 * up in the test output:
 *
 *   1. It is connected as a role RLS does not apply to. `fabrika` is SUPERUSER +
 *      BYPASSRLS, so every cross-tenant assertion made through it passes on a
 *      database with no policies at all. `assertRlsSubjectRole` throws instead.
 *
 *   2. The database or `DATABASE_URL_RLS_TEST` is missing and the suite skips
 *      itself. On a laptop that is the friendly thing to do; in CI it means the
 *      gate reports green having measured nothing. `skipOrFailInCi` warns
 *      locally and throws when `CI` is set.
 *
 * Some live suites deliberately run as the app's own BYPASSRLS role, because
 * the property they measure is the application code's own guard and RLS would
 * hide the defect (tests/concept-template-tenant-scope.live.test.ts explains
 * why). Pointed at the RLS role, those go green vacuously — the mirror image of
 * (1). `assertAppOwnerRole` pins them to the role they claim to measure.
 *
 * Every throw here is meant to happen at module scope or in `beforeAll`, so the
 * whole file goes red rather than one test among many.
 */

/** Anything with Prisma's `$queryRawUnsafe` — the singleton or a `createDbClient` handle. */
export interface RawQueryable {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
}

export interface RoleFacts {
  user: string;
  rolsuper: boolean;
  rolbypassrls: boolean;
}

/** True when `CI` is set to anything but an explicit off value. */
export function isCi(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.CI;
  return (
    v !== undefined && !["", "0", "false"].includes(v.trim().toLowerCase())
  );
}

/**
 * Called where a live suite is about to skip itself. Locally: a warning and the
 * skip goes ahead. In CI: throws, because a skipped suite there is a false green.
 */
export function skipOrFailInCi(suite: string, reason: string): void {
  if (isCi()) {
    throw new Error(
      `${suite}: refusing to skip in CI — ${reason}. ` +
        "Provide the database and DATABASE_URL_RLS_TEST (`pnpm db:rls-role`) in the CI job.",
    );
  }
  console.warn(`${suite} skipped: ${reason}`);
}

/**
 * Returns the RLS-subject connection string, or `undefined` after a local
 * warning. In CI a missing value throws.
 */
export function requireRlsTestUrl(
  url: string | undefined,
  suite: string,
): string | undefined {
  if (url) return url;
  skipOrFailInCi(
    suite,
    "DATABASE_URL_RLS_TEST is not set (run `pnpm db:rls-role`)",
  );
  return undefined;
}

export async function readRole(client: RawQueryable): Promise<RoleFacts> {
  const rows = await client.$queryRawUnsafe<RoleFacts[]>(
    'SELECT current_user::text AS "user", rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user',
  );
  const role = rows[0];
  if (!role) throw new Error("could not read the connected role from pg_roles");
  return role;
}

/** Throws unless the connection is a role the RLS policies actually apply to. */
export async function assertRlsSubjectRole(
  client: RawQueryable,
  suite: string,
): Promise<RoleFacts> {
  const role = await readRole(client);
  if (role.rolsuper || role.rolbypassrls) {
    throw new Error(
      `${suite}: connected as "${role.user}" (rolsuper=${role.rolsuper}, rolbypassrls=${role.rolbypassrls}). ` +
        "RLS does not apply to this role, so every isolation assertion here would pass vacuously. " +
        "Point DATABASE_URL_RLS_TEST at the NOBYPASSRLS role (`pnpm db:rls-role`).",
    );
  }
  return role;
}

/**
 * Throws unless the connection bypasses RLS, for suites that measure the app's
 * own guards and would be vacuous if the policies did the refusing instead.
 */
export async function assertAppOwnerRole(
  client: RawQueryable,
  suite: string,
): Promise<RoleFacts> {
  const role = await readRole(client);
  if (!role.rolbypassrls && !role.rolsuper) {
    throw new Error(
      `${suite}: connected as "${role.user}", which is subject to RLS. This suite measures the ` +
        "application's own guard under the app's BYPASSRLS role; over an RLS-subject role the " +
        "policies would refuse first and the assertions would pass without testing the code. " +
        "Point DATABASE_URL at the owning role.",
    );
  }
  return role;
}
