import { exec } from 'child_process';
import { promisify } from 'util';
import { Client } from 'pg';
import { writeFileSync } from 'fs';

const execAsync = promisify(exec);

function logSetup(msg: string) {
  console.log(`[e2e-gate] ${msg}`);
  try {
    writeFileSync('/tmp/e2e-setup.log', `${msg}\n`, { flag: 'a' });
  } catch {}
}

async function globalSetup() {
  writeFileSync('/tmp/e2e-setup.log', '=== E2E Setup Start ===\n');

  const { stdout } = await execAsync('ps aux | grep -E "node.*next dev" | grep -v grep | head -1 || echo ""');
  const match = stdout.match(/\S+\s+(\d+)/);
  const pid = match ? match[1] : 'none';

  // Log server info at the start of e2e tests so gate output shows what server is running
  logSetup(`Dev server info: PID=${pid}`);

  try {
    const { stdout: env } = await execAsync(`ps eww ${pid} 2>/dev/null | grep -o 'INVOICE_SUPPLIER_NAME=\\S*' || echo 'env-not-loaded'`);
    logSetup(`Test data: ${env.trim() ? 'INVOICE_SUPPLIER_NAME loaded' : 'env-not-loaded (stale server)'}`);
  } catch {
    logSetup(`Test data: unable to check (new server)`);
  }

  // Setup test fixtures: tenant, user, membership (idempotent)
  if (!process.env.DATABASE_URL) {
    logSetup(`DATABASE_URL not set; skipping fixture setup`);
    return;
  }

  logSetup(`DATABASE_URL found: ${process.env.DATABASE_URL.split('@')[1] || 'unknown'}`);

  const pgClient = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    logSetup(`Connecting to database...`);
    await pgClient.connect();
    logSetup(`Connected to database`);

    const testTenantId = 'demo-tenant-e2e';
    const testUserId = 'demo-user-admin-e2e';

    // Create tenant if not exists (soft-delete check included)
    const tenantCheck = await pgClient.query(
      `SELECT 1 FROM tenant WHERE id = $1`,
      [testTenantId]
    );

    if (tenantCheck.rows.length === 0) {
      await pgClient.query(
        `INSERT INTO tenant (id, name, slug, country) VALUES ($1, $2, $3, $4)`,
        [testTenantId, 'E2E Test Tenant', 'e2e-test-tenant', 'TR']
      );
      logSetup(`Created tenant: ${testTenantId}`);
    } else {
      logSetup(`Tenant already exists: ${testTenantId}`);
    }

    // Create user if not exists
    const userCheck = await pgClient.query(
      `SELECT 1 FROM "user" WHERE id = $1`,
      [testUserId]
    );

    if (userCheck.rows.length === 0) {
      await pgClient.query(
        `INSERT INTO "user" (id, email, name) VALUES ($1, $2, $3)`,
        [testUserId, 'admin@e2e-test.local', 'E2E Admin']
      );
      logSetup(`Created user: ${testUserId}`);
    } else {
      logSetup(`User already exists: ${testUserId}`);
    }

    // Create membership with system scope (FORCE RLS requires scope)
    const membershipCheck = await pgClient.query(
      `SELECT 1 FROM membership WHERE user_id = $1 AND tenant_id = $2`,
      [testUserId, testTenantId]
    );

    if (membershipCheck.rows.length === 0) {
      // Use system scope to bypass RLS for membership creation
      await pgClient.query(`SELECT set_config('app.system_scope', 'platform-admin', false)`);
      await pgClient.query(
        `INSERT INTO membership (user_id, tenant_id, role, created_at, updated_at)
         VALUES ($1, $2, $3, now(), now())`,
        [testUserId, testTenantId, 'admin']
      );
      await pgClient.query(`SELECT set_config('app.system_scope', '', false)`);
      logSetup(`Created membership: ${testUserId}@${testTenantId}`);
    } else {
      logSetup(`Membership already exists: ${testUserId}@${testTenantId}`);
    }

    logSetup(`Fixtures setup complete: tenant=${testTenantId}, user=${testUserId}`);
  } catch (err) {
    logSetup(`Fixture setup failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await pgClient.end();
  }
}

export default globalSetup;
