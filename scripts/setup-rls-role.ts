/**
 * Creates (or re-asserts) the RLS-subject application role `fabrika_app` on the
 * local database, then proves the role is not exempt from row level security.
 *
 *   pnpm db:rls-role              # create / update
 *   pnpm db:rls-role:rollback     # remove the role again
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

function redact(url: string): string {
  return url.replace(/:\/\/([^:/@]+):([^@]*)@/, (_m, user) => `://${user}:***@`);
}

async function main() {
  const dotenv = readDotenv();
  const adminUrl = process.env.DATABASE_URL ?? dotenv.DATABASE_URL;
  if (!adminUrl) throw new Error('DATABASE_URL is not set; cannot reach the local database.');

  if (!/localhost|127\.0\.0\.1/.test(adminUrl)) {
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

    // Password: reuse the one already in .env so re-runs stay idempotent,
    // otherwise mint one and persist the connection string.
    let appUrl = process.env[ENV_KEY] ?? dotenv[ENV_KEY];
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

    // Prove the credential actually logs in before anyone wires it into a test.
    const appClient = new pg.Client({ connectionString: appUrl });
    await appClient.connect();
    const who = await appClient.query('SELECT current_user, current_setting($1, true) AS tenant', ['app.tenant_id']);
    await appClient.end();
    console.log(`✅ ${ROLE} connects as ${who.rows[0].current_user}, app.tenant_id unset by default.`);
    console.log(`   ${ENV_KEY}=${redact(appUrl)}`);
  } finally {
    await admin.end();
  }
}

main().catch((error: unknown) => {
  console.error('❌', error instanceof Error ? error.message : error);
  process.exit(1);
});
