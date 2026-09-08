import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
function dotenv(): Record<string, string> {
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
async function main(){
const raw = new pg.Client({ connectionString: dotenv().DATABASE_URL_RLS_TEST });
await raw.connect();
for (const [label, sql, params] of [
  ['SystemAlert probe rows', `delete from "SystemAlert" where source = $1 or message like $2`, ['probe-MTSYCMWFL22CA', '%PROBE-MTSYCMWFL22CA%']],
  ['Chunk probe rows', `delete from "Chunk" where "documentId" in (select id from "Document" where title like $1)`, ['%PROBE-MTSYCMWFL22CA%']],
  ['Document probe rows', `delete from "Document" where title like $1`, ['%PROBE-MTSYCMWFL22CA%']],
  ['CordisProject probe rows', `delete from "CordisProject" where id like $1`, ['PROBE-MTSYCMWFL22CA%']],
] as [string, string, unknown[]][]) {
  const r = await raw.query(sql, params);
  console.log(label, '→ deleted', r.rowCount);
}
const left = await raw.query(`select count(*)::int as n from "SystemAlert" where source = 'probe-MTSYCMWFL22CA'`);
console.log('probe alerts remaining:', left.rows[0].n);
await raw.end();
}
main().then(()=>process.exit(0),(e)=>{console.error(e);process.exit(1);});
