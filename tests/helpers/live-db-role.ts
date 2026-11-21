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

/**
 * True only on a GitHub Actions runner (`GITHUB_ACTIONS=true`, which the runner sets itself).
 *
 * This, not `isCi()`, is what lets a live suite run on a database named `fabrika`: that name
 * is the shared dev database everywhere except ci.yml's service container. `isCi()` takes any
 * `CI=1` typed in a shell, and with it 12 suites deleted rows from the shared database
 * (measured, FO-371). `skipOrFailInCi` keeps `isCi()`: refusing to skip is the safe direction.
 */
export function isGithubActions(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.GITHUB_ACTIONS === 'true';
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

/** An environment to read, as `process.env` or a plain object in a test. */
type EnvLike = Readonly<Record<string, string | undefined>>;

/**
 * True only on a real GitHub Actions runner as far as this repo can tell (NG-283): the runner sets
 * both `GITHUB_ACTIONS=true` and `CI=true` (seen in the env of the job's containers in the CI log
 * of run 44874105200). `GITHUB_ACTIONS=true` alone is one hand-typed variable away from opening the
 * shared `fabrika` database (measured), so a local imitation has to type both. Neither variable
 * is declared in ci.yml, the runner supplies them.
 */
export function isGithubRunner(env: EnvLike = process.env): boolean {
  return env.GITHUB_ACTIONS === 'true' && env.CI === 'true';
}

/**
 * The database names a developer or an agent may create for a live suite: `fabrika_test`, or
 * `fabrika_test_ng<number>[letter]` for a task (`fabrika_test_ng266`, `fabrika_test_ng266c`).
 * Anything else that merely contains "test" (`fabrika_test_prod`, `staging_test`, `prod_test_mirror`)
 * is refused (NG-283).
 */
const TEST_DB_NAME = /^fabrika_test(_ng[0-9]+[a-z]?)?$/;

/**
 * Whether a live suite that deletes rows or runs migrations may write to the database called
 * `name` (NG-266, NG-283): `fabrika_test[_ng<n>]`, the isolated gate's `fabrika_gate`
 * (scripts/gate-isolated.sh), or CI's `fabrika` service container, on a GitHub runner only
 * (`isGithubRunner`). The shared dev database is `fabrika` everywhere else, so it is refused.
 * The caller reads `name` with `usedDatabaseName` and stops when this returns false.
 */
export function isThrowawayDbName(name: string, env: EnvLike = process.env): boolean {
  if (name === 'fabrika_gate') return true;
  if (name === 'fabrika') return isGithubRunner(env);
  return TEST_DB_NAME.test(name);
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

/**
 * The line of an error that says why. Prisma's message opens with a blank line and then
 * "Invalid `prisma.$queryRawUnsafe()` invocation:", neither of which does; the cause comes
 * after them (measured, FO-366 F1).
 */
function errorCause(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const lines = e.message.split('\n').map((line) => line.trim()).filter(Boolean);
  return lines.find((line) => !/^Invalid `.*` invocation/.test(line)) ?? lines[0] ?? e.name;
}

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
    const reason = `could not read which database it would run on (${errorCause(e)})`;
    // 42501: the login worked but this role may not call pg_control_system() (a server that revoked
    // it from PUBLIC). Re-creating the role, which is what DB_FIX says, would not change that.
    if (e instanceof Error && e.message.includes('Code: `42501`')) {
      skipOrFailInCi(
        suite,
        `${reason}; as a superuser run GRANT EXECUTE ON FUNCTION pg_control_system() TO the role of this connection`,
        '`pnpm db:rls-role` does not grant this.',
      );
    } else {
      skipOrFailInCi(suite, reason);
    }
    return undefined;
  }
  const other = await readDbIdentity(fixtures);
  throwIfDifferentDatabase(suite, target, other);
  return target.db;
}

function throwIfDifferentDatabase(suite: string, target: DbIdentity, other: DbIdentity): void {
  if (target.db !== other.db || target.cluster !== other.cluster) {
    throw new Error(
      `${suite}: DATABASE_URL and DATABASE_URL_RLS_TEST point at different databases ` +
        `(DATABASE_URL: "${other.db}" on cluster ${other.cluster}; DATABASE_URL_RLS_TEST: "${target.db}" on cluster ${target.cluster}). ` +
        "Fixtures would go to one and the code under test would run on the other; point both at the same throwaway database.",
    );
  }
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

/**
 * For a suite that opens a second connection of its own (a raw `pg` client on
 * DATABASE_URL_RLS_TEST) and writes through it. Throws, never skips, unless `used` is on the same
 * database and cluster as `fixtures` AND is a role RLS applies to: pointed at a privileged role on
 * the shared database, the writes the suite expects to be refused would be applied (FO-371 §2).
 * Call it before the first write.
 */
export async function assertAppConnection(
  used: RawQueryable,
  fixtures: RawQueryable,
  suite: string,
): Promise<RoleFacts> {
  let target: DbIdentity;
  try {
    target = await readDbIdentity(used);
  } catch (e) {
    throw new Error(`${suite}: could not verify the second connection before writing through it (${errorCause(e)})`);
  }
  throwIfDifferentDatabase(suite, target, await readDbIdentity(fixtures));
  return assertRlsSubjectRole(used, suite);
}
