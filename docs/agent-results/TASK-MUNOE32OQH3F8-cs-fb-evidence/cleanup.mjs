import 'dotenv/config'; import pg from 'pg';
const db = new pg.Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
const rows = (await db.query(`SELECT id FROM "PublicLead" WHERE email LIKE 'csfb-i61-%@example.test'`)).rows;
let d = 0; for (const x of rows) d += (await db.query('DELETE FROM "PublicLead" WHERE id=$1', [x.id])).rowCount;
console.log(`cleanup leftovers: ${d}/${rows.length} deleted one id at a time`); await db.end();
