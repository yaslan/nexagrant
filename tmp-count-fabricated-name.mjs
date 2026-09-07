import fs from 'node:fs';
import pg from 'pg';
const url = fs.readFileSync('.env','utf8').match(/^DATABASE_URL=(.*)$/m)[1].replace(/^["']|["']$/g,'');
const c = new pg.Client({ connectionString: url });
await c.connect();
await c.query(`insert into "ModuleState"(id,"tenantId","moduleId",status,settings,"changedBy","changedAt")
 values('ms-demo-m10','demo-tenant','M10','ON','{}','TASK-MTR60M5ESB5PZ e2e fixture',now())
 on conflict (id) do update set status='ON'`);
console.table((await c.query(`select id,"tenantId","moduleId",status from "ModuleState" order by "moduleId"`)).rows);
await c.end();
