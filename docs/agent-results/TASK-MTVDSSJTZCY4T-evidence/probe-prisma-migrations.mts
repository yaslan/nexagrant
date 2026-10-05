import { readFileSync, existsSync } from 'node:fs';
import pg from 'pg';
const env = existsSync('.env') ? Object.fromEntries(readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(), l.slice(l.indexOf('=')+1).trim().replace(/^["']|["']$/g,'')])) : {};
const url = process.env.DATABASE_URL ?? env.DATABASE_URL!;
const c = new pg.Client({ connectionString: url });
await c.connect();
const t = await c.query(`select to_regclass('_prisma_migrations') as r`);
console.log('_prisma_migrations:', t.rows[0].r);
if (t.rows[0].r) {
  const r = await c.query(`select migration_name, checksum, finished_at from _prisma_migrations order by started_at`);
  for (const row of r.rows) console.log(' -', row.migration_name, '| checksum', String(row.checksum).slice(0,12)+'…', '| finished', row.finished_at ? 'yes':'NO');
}
await c.end();
