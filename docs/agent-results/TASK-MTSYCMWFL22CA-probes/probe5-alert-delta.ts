import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
function dotenv(): Record<string, string> {
  const p = resolve(process.cwd(), '.env');
  const out: Record<string, string> = {};
  if (!existsSync(p)) return out;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('='); if (eq === -1) continue;
    out[t.slice(0, eq)] = t.slice(eq + 1).replace(/^["']|["']$/g, '');
  }
  return out;
}
const env = dotenv();
process.env.DATABASE_URL = env.DATABASE_URL_RLS_TEST!;
process.env.OPENAI_API_KEY = '';
async function main(){
  const raw = new pg.Client({ connectionString: env.DATABASE_URL_RLS_TEST });
  await raw.connect();
  const before = (await raw.query(`select count(*)::int n from "SystemAlert"`)).rows[0].n;
  console.log('SystemAlert count before :', before);
  const { syncCordisBigData } = await import('@/lib/cordis-sync');
  const r = await syncCordisBigData([{ projectId: 'PROBE-MTSYCMWFL22CA-dbg', title: 'PROBE-MTSYCMWFL22CA-dbg title' }]);
  console.log('REPORTED:', JSON.stringify(r));
  const after = (await raw.query(`select count(*)::int n from "SystemAlert"`)).rows[0].n;
  console.log('SystemAlert count after  :', after, ' delta =', after - before);
  const rows = await raw.query(`select level, source, left(message,80) message, "createdAt", "repeatCount" from "SystemAlert" order by "createdAt" desc limit 5`);
  console.table(rows.rows);
  await raw.query(`delete from "Chunk" where "documentId" in (select id from "Document" where title like '%PROBE-MTSYCMWFL22CA%')`);
  await raw.query(`delete from "Document" where title like '%PROBE-MTSYCMWFL22CA%'`);
  await raw.query(`delete from "CordisProject" where id like 'PROBE-MTSYCMWFL22CA%'`);
  await raw.end();
}
main().then(()=>process.exit(0),(e)=>{console.error(e);process.exit(1);});
