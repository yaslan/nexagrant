import { createDbClient, type TenantTx } from '@/lib/db';
import { PLATFORM_SCOPE_TENANT_ID } from '@/lib/llm';
import type { PrismaClient } from '@prisma/client';

async function test() {
  const rlsUrl = process.env.DATABASE_URL!;
  const rlsClient = createDbClient(rlsUrl);

  console.log('=== COUNTERFACTUAL PROBE (NOBYPASSRLS role) ===');

  // Test A: Direct prisma.aiUsageLog.create WITHOUT app.tenant_id set
  try {
    await rlsClient.aiUsageLog.create({
      data: {
        tenantId: 'demo-tenant',
        module: 'K6',
        purpose: 'probe_test_no_tenant',
        provider: 'openai',
        model: 'text-embedding-3-large',
        promptHash: 'probe_hash_1',
        inputTokens: 10,
        outputTokens: 0,
        credits: 0,
      },
    });
    console.log('❌ A. Direct INSERT without app.tenant_id: SUCCEEDED (UNEXPECTED!)');
  } catch (err: unknown) {
    const msg = (err as Error).message;
    if (msg.includes('42501') || msg.includes('row-level security policy')) {
      console.log('✅ A. Direct INSERT without app.tenant_id: BLOCKED [42501] (EXPECTED)');
    } else {
      console.log('❓ A. Direct INSERT threw:', msg);
    }
  }

  // Test B: withTenant('demo-tenant') -> app.tenant_id set
  try {
    await withTenantOnAppRole(rlsClient, 'demo-tenant', async (tx) => {
      return tx.aiUsageLog.create({
        data: {
          tenantId: 'demo-tenant',
          module: 'K6',
          purpose: 'probe_test_tenant',
          provider: 'openai',
          model: 'text-embedding-3-large',
          promptHash: 'probe_hash_2',
          inputTokens: 10,
          outputTokens: 0,
          credits: 0,
        },
      });
    });
    console.log('✅ B. withTenant("demo-tenant") INSERT: SUCCEEDED (EXPECTED)');
  } catch (err: unknown) {
    console.log('❌ B. withTenant("demo-tenant") INSERT failed:', (err as Error).message);
  }

  // Test C: withTenant('__platform__') -> app.tenant_id = '__platform__'
  try {
    await withTenantOnAppRole(rlsClient, PLATFORM_SCOPE_TENANT_ID, async (tx) => {
      return tx.aiUsageLog.create({
        data: {
          tenantId: PLATFORM_SCOPE_TENANT_ID,
          module: 'K6',
          purpose: 'probe_test_platform',
          provider: 'openai',
          model: 'text-embedding-3-large',
          promptHash: 'probe_hash_3',
          inputTokens: 10,
          outputTokens: 0,
          credits: 0,
        },
      });
    });
    console.log('✅ C. withTenant("__platform__") INSERT: SUCCEEDED (EXPECTED)');
  } catch (err: unknown) {
    console.log('❌ C. withTenant("__platform__") INSERT failed:', (err as Error).message);
  }

  // Clean up
  const adminUrl = process.env.ADMIN_DATABASE_URL || 'postgresql://fabrika:fabrika@localhost:5432/fabrika';
  const admin = createDbClient(adminUrl);
  await admin.aiUsageLog.deleteMany({
    where: { purpose: { in: ['probe_test_no_tenant', 'probe_test_tenant', 'probe_test_platform'] } },
  });
  await admin.$disconnect();
  await rlsClient.$disconnect();
}

async function withTenantOnAppRole<T>(
  client: PrismaClient,
  tenantId: string,
  cb: (tx: TenantTx) => Promise<T>
): Promise<T> {
  return client.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return cb(tx);
  });
}

test().catch(console.error);
