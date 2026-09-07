/**
 * Applies prisma/rls.sql to the local database over the wire protocol.
 *
 * Why this exists: `pnpm db:rls` used to shell out to `psql -f prisma/rls.sql`,
 * so on a machine without the postgres client binaries the policies could not be
 * installed at all — silently. On 2026-09-07 the schema was rebuilt mid-sprint
 * and the policies were not reinstalled: the repo declared 38 tenant_isolation
 * policies while the database had 1, and `tests/rls.spec.ts` was the only thing
 * that noticed. Reproducibility is the point; a gate you cannot run is not a gate.
 *
 *   pnpm db:rls
 *
 * Prints the before/after policy count so the result is measured, not assumed.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

const ENV_PATH = resolve(process.cwd(), '.env');

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

function redact(url: string): string {
  return url.replace(/:\/\/([^:/@]+):([^@]*)@/, (_m, user) => `://${user}:***@`);
}

/** psql meta-commands (`\set …`) are not valid over the wire protocol. */
function loadSql(file: string): string {
  return readFileSync(resolve(process.cwd(), file), 'utf8')
    .split('\n')
    .filter((line) => !line.startsWith('\\'))
    .join('\n');
}

async function policyCount(client: pg.Client): Promise<number> {
  const res = await client.query<{ n: number }>(
    `select count(*)::int as n from pg_policies where schemaname = 'public'`
  );
  return res.rows[0]?.n ?? 0;
}

async function main() {
  const dotenv = readDotenv();
  const adminUrl = process.env.DATABASE_URL ?? dotenv.DATABASE_URL;
  if (!adminUrl) throw new Error('DATABASE_URL is not set; cannot reach the database.');

  // Same guard as scripts/setup-rls-role.ts: this rewrites security policy, so
  // it may only ever run against a local database.
  if (!/localhost|127\.0\.0\.1/.test(adminUrl)) {
    throw new Error(`Refusing to run against a non-local database: ${redact(adminUrl)}`);
  }

  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    const before = await policyCount(client);
    await client.query(loadSql('prisma/rls.sql'));
    const after = await policyCount(client);
    console.log(`✅ prisma/rls.sql applied. Policies in public: ${before} → ${after}`);
    if (after === 0) throw new Error('No policies present after apply; refusing to report success.');
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(`❌ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
