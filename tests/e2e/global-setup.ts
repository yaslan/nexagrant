import { exec } from 'child_process';
import { promisify } from 'util';
import { Client } from 'pg';

const execAsync = promisify(exec);

/**
 * Database preflight (TASK-MUPVLWSIPC5WU). The specs sign in through the demo
 * seats, and the JWT callback reads their membership from the database the dev
 * server uses. On a database without the schema every sign-in logs
 * "[Auth.jwt] membership lookup failed" and the whole suite fails one timeout at
 * a time. Stop here instead, with the commands that prepare it — the same ones
 * CI runs (ci.yml "Prepare database"). Nothing is created or changed here: the
 * demo tenant and seats come from `pnpm db:seed`.
 */
const DEMO_TENANT_ID = 'demo-tenant';

async function checkDatabase(url: string) {
  const client = new Client({ connectionString: url });
  const where = (() => {
    try {
      const u = new URL(url);
      return `${u.hostname}:${u.port || 5432}${u.pathname}`;
    } catch {
      return 'DATABASE_URL';
    }
  })();
  const prepare =
    'pnpm exec prisma db push && pnpm db:rls-role && scripts/apply-migrations.sh && pnpm db:rls && pnpm db:seed';
  await client.connect();
  try {
    const { rows } = await client.query(`SELECT to_regclass('public."Tenant"') IS NOT NULL AS ok`);
    if (!rows[0]?.ok) {
      throw new Error(`[e2e-gate] ${where} has no schema (table "Tenant" missing). Prepare it with: ${prepare}`);
    }
    // Tenant is under FORCE RLS: without the system scope the owner role sees 0 rows.
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.system_scope', 'on', true)`);
    const seeded = await client.query(`SELECT 1 FROM "Tenant" WHERE id = $1`, [DEMO_TENANT_ID]);
    await client.query('COMMIT');
    if (seeded.rows.length === 0) {
      throw new Error(`[e2e-gate] ${where} has no demo tenant "${DEMO_TENANT_ID}". Run: pnpm db:seed`);
    }
    console.log(`[e2e-gate] Database: ${where} (schema + demo seed present)`);
  } finally {
    await client.end();
  }
}

async function globalSetup() {
  const { stdout } = await execAsync('ps aux | grep -E "node.*next dev" | grep -v grep | head -1 || echo ""');
  const match = stdout.match(/\S+\s+(\d+)/);
  const pid = match ? match[1] : 'none';

  // Log server info at the start of e2e tests so gate output shows what server is running
  console.log(`[e2e-gate] Dev server info: PID=${pid}`);

  try {
    const { stdout: env } = await execAsync(`ps eww ${pid} 2>/dev/null | grep -o 'INVOICE_SUPPLIER_NAME=\\S*' || echo 'env-not-loaded'`);
    console.log(`[e2e-gate] Test data: ${env.trim() ? 'INVOICE_SUPPLIER_NAME loaded' : 'env-not-loaded (stale server)'}`);
  } catch {
    console.log(`[e2e-gate] Test data: unable to check (new server)`);
  }

  if (!process.env.DATABASE_URL) {
    console.log('[e2e-gate] DATABASE_URL not set; database preflight skipped');
    return;
  }
  await checkDatabase(process.env.DATABASE_URL);
}

export default globalSetup;
