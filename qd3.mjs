import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.DATABASE_URL || 'postgresql://fabrika:fabrika@localhost:5432/fabrika' });
await c.connect();
const r = await c.query(`select u.email, m."tenantId", t.slug, m.role from "Membership" m join "User" u on u.id=m."userId" join "Tenant" t on t.id=m."tenantId" where m."tenantId" in ('demo-tenant','cmtq0eiyo0000vsxka42mx21k') limit 10`);
console.log(JSON.stringify(r.rows,null,1));
const w = await c.query(`select slug, "tenantId" from "Workspace" limit 8`);
console.log('workspaces', JSON.stringify(w.rows));
await c.end();
