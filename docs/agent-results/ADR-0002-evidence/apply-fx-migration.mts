/**
 * Applies one hand-written migration file over the wire protocol, with the same
 * localhost-only guard scripts/apply-rls.ts uses. Scratchpad tool, not shipped.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

const ENV_PATH = resolve(process.cwd(), '.env');

function readDotenv(): Record<string, string> {
  if (!existsSync(ENV_PATH)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    out[t.slice(0, eq)] = t.slice(eq + 1).replace(/^["']|["']$/g, '');
  }
  return out;
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('usage: apply-fx-migration.ts <sql file>');
  const dotenv = readDotenv();
  const url = process.env.DATABASE_URL ?? dotenv.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set.');
  if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error('Refusing: non-local database.');

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const cols = async () =>
      (await client.query(
        `select column_name, data_type, numeric_precision, numeric_scale
           from information_schema.columns
          where table_name = 'Invoice'
            and column_name in ('fxRate','fxRateDate','fxRateSource','grandTotalTryMinor')
          order by column_name`
      )).rows;
    const cons = async () =>
      (await client.query(
        `select conname from pg_constraint where conname = 'Invoice_fx_required_for_foreign_currency'`
      )).rows;
    const foreign = async () =>
      (await client.query(`select count(*)::int as n from "Invoice" where "currency" <> 'TRY'`)).rows[0];
    const total = async () =>
      (await client.query(`select count(*)::int as n from "Invoice"`)).rows[0];

    console.log('BEFORE  rows(total):', await total(), ' rows(non-TRY):', await foreign());
    console.log('BEFORE  fx columns:', await cols());
    console.log('BEFORE  check constraint:', await cons());

    await client.query(readFileSync(resolve(process.cwd(), file), 'utf8'));

    console.log('AFTER   rows(total):', await total(), ' rows(non-TRY):', await foreign());
    console.log('AFTER   fx columns:', await cols());
    console.log('AFTER   check constraint:', await cons());
  } finally {
    await client.end();
  }
}

main().catch((e: unknown) => {
  console.error(`FAILED: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
