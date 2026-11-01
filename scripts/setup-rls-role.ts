/**
 * Creates the RLS-subject application role `fabrika_app` on the local database,
 * then proves the role is not exempt from row level security.
 *
 *   pnpm db:rls-role              # create if missing; otherwise re-apply grants here
 *   pnpm db:rls-role:rollback     # remove the role again
 *
 * The role is cluster-wide but DATABASE_URL_RLS_TEST lives in one checkout's
 * .env. Re-setting the password from here would silently break every other
 * checkout that shares the database, so an existing role's password is never
 * altered: it must already match this .env, or the script fails. Rotating means
 * rollback + create (see the error message for the exact steps).
 *
 * Grants are per database, the role is per cluster. An existing role therefore
 * still gets the grant half of prisma/rls-app-role.sql applied to THIS database
 * (TASK-MVNMZ521MJ3AD), and the login proof runs against THIS database, not the
 * one the .env URL happens to name.
 *
 * The role's password is never written into a .sql file. It comes from
 * DATABASE_URL_RLS_TEST in .env; if that variable is absent, a random password
 * is generated and the connection string is appended to .env once.
 *
 * This script deliberately does NOT touch DATABASE_URL. See
 * prisma/rls-app-role.sql for why the two connections stay separate.
 */
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

const ROLE = 'fabrika_app';
const ENV_KEY = 'DATABASE_URL_RLS_TEST';
const ENV_PATH = resolve(process.cwd(), '.env');
const rollback = process.argv.includes('--rollback');

/** Minimal .env reader: we only need two keys and must not clobber process.env. */
function readDotenv(): Record<string, string> {
  if (!existsSync(ENV_PATH)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1).replace(/^["']|["']$/g, '');
  }
  return out;
}

/** Strips psql meta-commands (`\set …`), which the wire protocol cannot run. */
function loadSql(file: string): string {
  return readFileSync(resolve(process.cwd(), file), 'utf8')
    .split('\n')
    .filter((line) => !line.startsWith('\\'))
    .join('\n');
}

/** Hosts this script may touch; parsed hostname, not a substring (see scripts/apply-rls.ts). */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', 'postgres']);

/** Unparseable URL → '' (fails the guard closed). */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function redact(url: string): string {
  return url.replace(/:\/\/([^:/@]+):([^@]*)@/, (_m, user) => `://${user}:***@`);
}

async function main() {
  const dotenv = readDotenv();
  const adminUrl = process.env.DATABASE_URL ?? dotenv.DATABASE_URL;
  if (!adminUrl) throw new Error('DATABASE_URL is not set; cannot reach the local database.');

  if (!LOCAL_HOSTS.has(hostOf(adminUrl))) {
    throw new Error(`Refusing to run against a non-local database: ${redact(adminUrl)}`);
  }

  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();

  try {
    if (rollback) {
      await admin.query(loadSql('prisma/rls-app-role-rollback.sql'));
      console.log(`✅ ${ROLE} removed. Drop ${ENV_KEY} from .env to finish.`);
      return;
    }

    const { rows: existing } = await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [ROLE]);
    const configuredUrl = process.env[ENV_KEY] ?? dotenv[ENV_KEY];

    if (existing.length > 0) {
      if (!configuredUrl) {
        throw new Error(
          `${ROLE} already exists but ${ENV_KEY} is not set in this .env, so its password is unknown. ` +
            `Copy ${ENV_KEY} from the checkout that created the role. To rotate it instead, run ` +
            `pnpm db:rls-role:rollback and then pnpm db:rls-role; every other checkout must then copy the new value.`
        );
      }
      await assertRoleAttributes(admin);
      // Keep mode: the SQL re-asserts attributes and grants but never touches the
      // password, so the shared credential stays exactly as this .env knows it.
      await admin.query("SELECT set_config('fabrika.app_password_keep', 'on', false)");
      await admin.query(loadSql('prisma/rls-app-role.sql'));
      const user = await proveLogin(onDatabase(configuredUrl, adminUrl));
      console.log(`✅ ${ROLE} already exists; grants applied to this database. ${ENV_KEY} logs in as ${user}. Password left unchanged.`);
      return;
    }

    // Password: reuse the one already in .env so re-runs stay idempotent,
    // otherwise mint one and persist the connection string.
    let appUrl = configuredUrl;
    let password: string;
    if (appUrl) {
      password = decodeURIComponent(new URL(appUrl).password);
      if (!password) throw new Error(`${ENV_KEY} has no password component.`);
    } else {
      password = randomBytes(24).toString('base64url');
      const base = new URL(adminUrl);
      base.username = ROLE;
      base.password = password;
      appUrl = base.toString();
      appendFileSync(ENV_PATH, `\n# RLS-subject role (NOBYPASSRLS) used by tests/rls.spec.ts. Not the app connection.\n${ENV_KEY}=${appUrl}\n`);
      console.log(`ℹ️  generated a password and appended ${ENV_KEY} to .env`);
    }

    // The password travels as a bound parameter into a session GUC, so it never
    // appears in the .sql file and never gets string-interpolated into DDL here.
    await admin.query('SELECT set_config($1, $2, false)', ['fabrika.app_password', password]);
    await admin.query(loadSql('prisma/rls-app-role.sql'));

    await assertRoleAttributes(admin);
    const user = await proveLogin(appUrl);
    console.log(`✅ ${ROLE} connects as ${user}, app.tenant_id unset by default.`);
    console.log(`   ${ENV_KEY}=${redact(appUrl)}`);
  } finally {
    await admin.end();
  }
}

/** Prints the role row and refuses a role that would be exempt from RLS. */
async function assertRoleAttributes(admin: pg.Client) {
  const { rows } = await admin.query(
    'SELECT rolname, rolsuper, rolbypassrls, rolcanlogin, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = $1',
    [ROLE]
  );
  if (rows.length === 0) throw new Error(`${ROLE} was not created.`);
  console.table(rows);

  const role = rows[0];
  if (role.rolsuper || role.rolbypassrls) {
    throw new Error(`${ROLE} is superuser/bypassrls — it would not be subject to RLS. Aborting.`);
  }
}

/**
 * Same credential and options, pointed at the server and database of the admin
 * URL. The grants were applied there, so the login proof must go there too
 * (TASK-MVNMZ521MJ3AD Ö1); the host and port of the .env URL are not used.
 */
function onDatabase(url: string, databaseUrl: string): string {
  const target = new URL(databaseUrl);
  const next = new URL(url);
  next.host = target.host;
  next.pathname = target.pathname;
  return next.toString();
}

/**
 * Proves the credential logs in AND can read a tenant table on this database;
 * returns the login user. A login alone proves nothing: a role can connect to a
 * database it has no table grants on (TASK-MVNMZ521MJ3AD).
 */
async function proveLogin(appUrl: string): Promise<string> {
  const appClient = new pg.Client({ connectionString: appUrl });
  try {
    await appClient.connect();
  } catch (error) {
    if ((error as { code?: string }).code === '28P01') {
      throw new Error(
        `${ENV_KEY} password does not match the ${ROLE} role on this database. Another checkout likely ` +
          `set it last. Copy ${ENV_KEY} from that checkout's .env, or rotate with pnpm db:rls-role:rollback ` +
          `and then pnpm db:rls-role (other checkouts must then copy the new value).`
      );
    }
    throw error;
  }
  try {
    const who = await appClient.query('SELECT current_user, current_setting($1, true) AS tenant', ['app.tenant_id']);
    try {
      await appClient.query('SELECT 1 FROM "Tenant" LIMIT 1');
    } catch (error) {
      if ((error as { code?: string }).code === '42501') {
        throw new Error(
          `${ROLE} logs in on this database but has no SELECT on "Tenant": the GRANTs in prisma/rls-app-role.sql ` +
            `did not reach this database. Run pnpm db:rls-role again and check the output above.`
        );
      }
      throw error;
    }
    return who.rows[0].current_user;
  } finally {
    await appClient.end();
  }
}

main().catch((error: unknown) => {
  console.error('❌', error instanceof Error ? error.message : error);
  process.exit(1);
});
