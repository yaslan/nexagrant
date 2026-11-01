/** Probes that the DB itself refuses a foreign-currency invoice with no rate. */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
function readDotenv(): Record<string, string> {
  const p = resolve(process.cwd(), '.env');
  if (!existsSync(p)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    out[t.slice(0, eq)] = t.slice(eq + 1).replace(/^["']|["']$/g, '');
  }
  return out;
}
async function main() {
  const url = process.env.DATABASE_URL ?? readDotenv().DATABASE_URL;
  if (!url || !/localhost|127\.0\.0\.1/.test(url)) throw new Error('non-local');
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  const tenant = (await c.query(`select id from "Tenant" limit 1`)).rows[0].id;

  async function attempt(label: string, cols: string, vals: string) {
    const id = `probe-${Math.random().toString(36).slice(2)}`;
    try {
      await c.query('BEGIN');
      await c.query(
        `insert into "Invoice" ("id","tenantId","number","issuedAt","buyerName","buyerVknTckn",
           "buyerTaxOffice","buyerAddress","buyerCity","lines","ettn"${cols})
         values ($1,$2,$3,now(),'Probe','1234567890','VD','Adr','Ist','[]'::jsonb,$4${vals})`,
        [id, tenant, id, id]
      );
      console.log(`${label}: ACCEPTED`);
    } catch (e: unknown) {
      console.log(`${label}: REJECTED — ${(e as Error).message}`);
    } finally {
      await c.query('ROLLBACK');
    }
  }

  await attempt('TRY invoice, no rate           ', `,"currency"`, `,'TRY'`);
  await attempt('USD invoice, NO rate           ', `,"currency"`, `,'USD'`);
  await attempt('USD invoice, rate = 0          ',
    `,"currency","fxRate","fxRateDate","fxRateSource","grandTotalTryMinor"`,
    `,'USD',0,'2026-09-08','TCMB',0`);
  await attempt('USD invoice, rate but no TL sum',
    `,"currency","fxRate","fxRateDate","fxRateSource"`,
    `,'USD',41.234567,'2026-09-08','TCMB'`);
  await attempt('USD invoice, full FX record    ',
    `,"currency","fxRate","fxRateDate","fxRateSource","grandTotalTryMinor"`,
    `,'USD',41.2345,'2026-09-08','TCMB',408222`);

  await c.end();
}
main().catch((e: unknown) => { console.error(String(e)); process.exit(1); });
