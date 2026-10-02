import { exec } from 'child_process';
import { promisify } from 'util';
import { createDbClient } from '../../src/lib/db';
import { withSystemScope } from '../../src/lib/system-scope';

const execAsync = promisify(exec);

async function globalSetup() {
  const { stdout } = await execAsync('ps aux | grep -E "node.*next dev" | grep -v grep | head -1 || echo ""');
  const match = stdout.match(/\S+\s+(\d+)/);
  const pid = match ? match[1] : 'none';

  console.log(`[e2e-gate] Dev server info: PID=${pid}`);

  try {
    const { stdout: env } = await execAsync(`ps eww ${pid} 2>/dev/null | grep -o 'INVOICE_SUPPLIER_NAME=\\S*' || echo 'env-not-loaded'`);
    console.log(`[e2e-gate] Test data: ${env.trim() ? 'INVOICE_SUPPLIER_NAME loaded' : 'env-not-loaded (stale server)'}`);
  } catch {
    console.log(`[e2e-gate] Test data: unable to check (new server)`);
  }

  // Seed test fixtures: demo tenant, test user, and consent record
  try {
    const prisma = createDbClient(process.env.DATABASE_URL || 'postgresql://fabrika:fabrika@localhost:5433/fabrika');
    const TENANT_ID = 'demo-tenant';
    const WORKSPACE_SLUG = 'main';
    const TEST_EMAIL = 'demo@fabrika.test';

    // Ensure demo tenant exists
    await prisma.tenant.upsert({
      where: { id: TENANT_ID },
      update: {},
      create: {
        id: TENANT_ID,
        name: 'Demo Tenant',
        slug: TENANT_ID,
        country: 'TR',
        orgType: 'SME',
      },
    });

    // Ensure main workspace exists
    await prisma.workspace.upsert({
      where: {
        tenantId_slug: {
          tenantId: TENANT_ID,
          slug: WORKSPACE_SLUG,
        },
      },
      update: {},
      create: {
        tenantId: TENANT_ID,
        name: 'Main Workspace',
        slug: WORKSPACE_SLUG,
      },
    });

    // Create or update test user with system scope to bypass RLS
    await withSystemScope('platform-admin', 'e2e-fixture-seeding', async (tx) => {
      const user = await tx.user.upsert({
        where: { email: TEST_EMAIL },
        update: {},
        create: {
          email: TEST_EMAIL,
          name: 'Test User',
        },
      });

      // Create Membership record to link user to workspace
      const workspaceId = `${TENANT_ID}-${WORKSPACE_SLUG}`;
      await tx.membership.upsert({
        where: {
          userId_workspaceId: {
            userId: user.id,
            workspaceId,
          },
        },
        update: {},
        create: {
          userId: user.id,
          workspaceId,
          role: 'ADMIN',
        },
      });

      // Create Consent record for terms acceptance
      await tx.consent.upsert({
        where: {
          tenantId_userId_kind: {
            tenantId: TENANT_ID,
            userId: user.id,
            kind: 'TERMS_ACCEPTANCE',
          },
        },
        update: { acceptedAt: new Date() },
        create: {
          tenantId: TENANT_ID,
          userId: user.id,
          kind: 'TERMS_ACCEPTANCE',
          version: '1.0',
          acceptedAt: new Date(),
        },
      });
    });

    console.log(`[e2e-gate] Fixtures: demo-tenant + test user seeded`);
    await prisma.$disconnect();
  } catch (error) {
    console.error(`[e2e-gate] Fixture seeding failed:`, error instanceof Error ? error.message : error);
    // Don't fail the global setup on fixture error; tests may still run
  }
}

export default globalSetup;
