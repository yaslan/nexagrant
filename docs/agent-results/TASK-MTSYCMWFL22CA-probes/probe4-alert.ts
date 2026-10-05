/** PROBE 4 — does `recordAlert` actually land a SystemAlert row as fabrika_app? */
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
const env = dotenv();
const appUrl = env.DATABASE_URL_RLS_TEST!;
process.env.DATABASE_URL = appUrl;

async function main() {
  const raw = new pg.Client({ connectionString: appUrl });
  await raw.connect();
  const since = new Date();

  const { recordAlert } = await import('@/lib/observability/system-alert');
  const res = await recordAlert({
    level: 'error',
    source: 'probe-MTSYCMWFL22CA',
    message: 'probe alert — does this row land?',
    meta: { probe: true },
  });
  console.log('recordAlert returned :', JSON.stringify(res));

  const rows = await raw.query(
    `select id, level, source, message, "createdAt" from "SystemAlert" where source = $1`,
    ['probe-MTSYCMWFL22CA']
  );
  console.log('rows found :', rows.rowCount);
  console.table(rows.rows);

  const rls = await raw.query(
    `select relname, relrowsecurity, relforcerowsecurity from pg_class where relname = 'SystemAlert'`
  );
  console.table(rls.rows);

  const recent = await raw.query(
    `select level, source, left(message, 60) as message, "createdAt" from "SystemAlert"
      where "createdAt" >= $1 - interval '10 minutes' order by "createdAt" desc limit 10`,
    [since]
  );
  console.log('SystemAlert rows in the last 10 minutes:', recent.rowCount);
  console.table(recent.rows);

  const d = await raw.query(`delete from "SystemAlert" where source = $1`, ['probe-MTSYCMWFL22CA']);
  console.log('cleanup deleted', d.rowCount);
  await raw.end();
}
main().then(() => process.exit(0), (e) => { console.error('PROBE FAILED:', e); process.exit(1); });
