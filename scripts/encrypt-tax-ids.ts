/**
 * Moves the buyer tax number (`buyerVknTckn`) of TenantBillingIdentity and
 * Invoice between plaintext and the AES-256-GCM envelope (NG-40, §18.3).
 *
 *   pnpm tsx scripts/encrypt-tax-ids.ts                # dry run: counts only, writes nothing
 *   pnpm tsx scripts/encrypt-tax-ids.ts --apply        # plaintext -> envelope
 *   pnpm tsx scripts/encrypt-tax-ids.ts --rollback     # envelope  -> plaintext (reversible)
 *   add `--tenant <id>` to limit any of the three to one tenant's rows
 *
 * LOCAL ONLY: the script refuses a database host that is not localhost / 127.0.0.1 / ::1.
 * Production is converted by a separate, approved step, not by this run.
 *
 * Needs DATABASE_URL (an owner-class role: it reads past FORCE RLS) and
 * TAX_ID_ENCRYPTION_KEY, both from the environment. Neither value is printed.
 * Only counts are: how many rows were plain, how many are enveloped.
 *
 * It talks to Postgres with `pg` directly, NOT through the Prisma client, whose
 * extension would encrypt/decrypt behind the script's back.
 *
 * Idempotent: --apply touches only rows without the envelope prefix and
 * --rollback only rows with it, so a second run changes 0 rows. Each table runs
 * in one transaction; any failure rolls that table back whole.
 * Rollback of the whole step = `--rollback` (needs the same key).
 */
import pg from 'pg';
import { TAX_ID_PREFIX, decryptTaxId, encryptTaxId, resolveTaxIdKey } from '../src/lib/billing/tax-id-crypto';

const TABLES = ['TenantBillingIdentity', 'Invoice'] as const;
const tenantIdx = process.argv.indexOf('--tenant');
const tenantOnly = tenantIdx >= 0 ? process.argv[tenantIdx + 1] : undefined;
if (tenantIdx >= 0 && !tenantOnly) fail('--tenant needs an id');
const mode = process.argv.includes('--apply') ? 'apply' : process.argv.includes('--rollback') ? 'rollback' : 'dry';

function fail(msg: string): never {
  console.error(`encrypt-tax-ids: ${msg}`);
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) fail('DATABASE_URL is not set');
const host = new URL(url).hostname;
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
  fail('refusing a non-local database host (this script is local-only)');
}
if (!resolveTaxIdKey()) fail('TAX_ID_ENCRYPTION_KEY is missing or is not a 32-byte key');

async function main(): Promise<void> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    for (const table of TABLES) {
      const pk = table === 'Invoice' ? 'id' : 'tenantId';
      const counts = await client.query<{ plain: string; enc: string }>(
        `SELECT count(*) FILTER (WHERE "buyerVknTckn" NOT LIKE $1) AS plain,
                count(*) FILTER (WHERE "buyerVknTckn" LIKE $1) AS enc
           FROM "${table}" WHERE ($2::text IS NULL OR "tenantId" = $2)`,
        [`${TAX_ID_PREFIX}%`, tenantOnly ?? null]
      );
      console.log(`${table}: before  plain=${counts.rows[0]?.plain} enveloped=${counts.rows[0]?.enc}`);
      if (mode === 'dry') continue;

      await client.query('BEGIN');
      try {
        const sel =
          mode === 'apply'
            ? `SELECT "${pk}" AS pk, "buyerVknTckn" AS v FROM "${table}" WHERE "buyerVknTckn" NOT LIKE $1 AND ($2::text IS NULL OR "tenantId" = $2) FOR UPDATE`
            : `SELECT "${pk}" AS pk, "buyerVknTckn" AS v FROM "${table}" WHERE "buyerVknTckn" LIKE $1 AND ($2::text IS NULL OR "tenantId" = $2) FOR UPDATE`;
        const rows = await client.query<{ pk: string; v: string }>(sel, [`${TAX_ID_PREFIX}%`, tenantOnly ?? null]);
        for (const r of rows.rows) {
          const next = mode === 'apply' ? encryptTaxId(r.v) : decryptTaxId(r.v);
          await client.query(`UPDATE "${table}" SET "buyerVknTckn" = $1 WHERE "${pk}" = $2`, [next, r.pk]);
        }
        await client.query('COMMIT');
        console.log(`${table}: ${mode === 'apply' ? 'encrypted' : 'decrypted'} ${rows.rowCount} row(s)`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
      const after = await client.query<{ plain: string; enc: string }>(
        `SELECT count(*) FILTER (WHERE "buyerVknTckn" NOT LIKE $1) AS plain,
                count(*) FILTER (WHERE "buyerVknTckn" LIKE $1) AS enc
           FROM "${table}" WHERE ($2::text IS NULL OR "tenantId" = $2)`,
        [`${TAX_ID_PREFIX}%`, tenantOnly ?? null]
      );
      console.log(`${table}: after   plain=${after.rows[0]?.plain} enveloped=${after.rows[0]?.enc}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => fail(e instanceof Error ? e.message : 'failed'));
