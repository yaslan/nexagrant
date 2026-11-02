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
 * A third way is specific to the suites that refuse the shared `fabrika`
 * database: the name they checked was not the database they then ran on.
 * `usedDatabaseName` reads it from the connection the suite's code uses.
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

import { execFileSync } from "node:child_process";

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

const DB_FIX =
  "Provide the database and DATABASE_URL_RLS_TEST (`pnpm db:rls-role`) in the CI job.";

/**
 * Called where a live suite is about to skip itself. Locally: a warning and the
 * skip goes ahead. In CI: throws, because a skipped suite there is a false green.
 * `fix` says what the CI job is missing when it is not the database.
 */
export function skipOrFailInCi(suite: string, reason: string, fix = DB_FIX): void {
  if (isCi()) {
    throw new Error(`${suite}: refusing to skip in CI — ${reason}. ${fix}`);
  }
  // process.stderr, not console.warn: vitest's `agent` reporter (chosen by itself when CLAUDECODE or
  // AI_AGENT is set), `--silent` and the json-only and tap reporters all drop the console output of
  // a file whose every test skipped, so the one line saying nothing ran went missing (measured, FO-357).
  process.stderr.write(`WARNING ${suite} skipped: ${reason}\n`);
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

/**
 * Returns `process.env[name]`, or `undefined` after a local warning. In CI a
 * missing value throws. For the non-database settings a live suite needs, such
 * as the AUTH_SECRET the real Auth.js callback signs with (İNCELEME-54 Y-1).
 */
export function requireTestEnv(name: string, suite: string): string | undefined {
  const value = process.env[name];
  if (value) return value;
  skipOrFailInCi(
    suite,
    `${name} is not set`,
    `Set a test-only ${name} in the Test step of .github/workflows/ci.yml.`,
  );
  return undefined;
}

/**
 * True only for a URL `scripts/db-target.sh` `db_is_local` accepts — the guard
 * db:setup and the pre-push hook use. Run, not ported, so the two cannot drift;
 * fail closed: no `sh` (or any error) reads as "not local". For a live test
 * that runs DDL, which must never reach a shared or production database.
 */
export function isLocalDbUrl(url: string): boolean {
  const script = '. scripts/db-target.sh\ntarget=$(db_target "$1")\ndb_is_local "$1" "${target%%/*}"';
  try {
    execFileSync("sh", ["-c", script, "probe", url], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

type DbIdentity = { db: string; cluster: string };

async function readDbIdentity(client: RawQueryable): Promise<DbIdentity> {
  const rows = await client.$queryRawUnsafe<DbIdentity[]>(
    'SELECT current_database()::text AS db, system_identifier::text AS cluster FROM pg_control_system()',
  );
  const identity = rows[0];
  if (!identity) throw new Error("could not read the connected database's identity");
  return identity;
}

/**
 * The name to judge "is this the shared database?" by: the database of `used`,
 * the connection the suite's code runs on, not of `fixtures`, the owner connection
 * that builds its rows. A live suite swaps the singleton to DATABASE_URL_RLS_TEST
 * and keeps the owner on DATABASE_URL, so with the two pointing apart a guard
 * reading the owner approves one database and the sweep runs on the other (FO-356
 * scenario I).
 *
 * Two connections on different databases, or the same name on different clusters,
 * throw in CI and locally alike: the fixtures would not be where the code looks, so
 * nothing the suite could report would mean anything. `used` being unreadable (a
 * stale fabrika_app password, 28P01) is a skip: nothing ran.
 *
 * @returns the database name, or `undefined` when the suite must skip.
 */
export async function usedDatabaseName(
  used: RawQueryable,
  fixtures: RawQueryable,
  suite: string,
): Promise<string | undefined> {
  let target: DbIdentity;
  try {
    target = await readDbIdentity(used);
  } catch (e) {
    skipOrFailInCi(suite, `could not read which database it would run on (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return undefined;
  }
  const other = await readDbIdentity(fixtures);
  if (target.db !== other.db || target.cluster !== other.cluster) {
    throw new Error(
      `${suite}: DATABASE_URL and DATABASE_URL_RLS_TEST point at different databases ` +
        `("${other.db}" on cluster ${other.cluster}, "${target.db}" on cluster ${target.cluster}). ` +
        "Fixtures would go to one and the code under test would run on the other; point both at the same throwaway database.",
    );
  }
  return target.db;
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
