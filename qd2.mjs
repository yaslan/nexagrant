import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.DATABASE_URL || 'postgresql://fabrika:fabrika@localhost:5432/fabrika' });
await c.connect();
const t = await c.query(`select table_name from information_schema.tables where table_schema='public' and (table_name ilike '%alendar%' or table_name ilike '%Brief%')`);
console.log('tables:', JSON.stringify(t.rows));
const col = await c.query(`select column_name from information_schema.columns where table_name='MeetingBrief'`);
console.log('MeetingBrief cols:', col.rows.map(r=>r.column_name).join(','));
await c.end();
