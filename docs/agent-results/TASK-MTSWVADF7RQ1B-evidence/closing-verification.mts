/**
 * TASK-MTSWVADF7RQ1B Closing Verification Probe
 * Runs under NOBYPASSRLS role `fabrika_app` to verify RAG AiUsageLog writes.
 */
import pg from 'pg';
import { env } from '../../../src/lib/env';
import { ingestDocument } from '../../../src/lib/rag';
import { handleTestRagQuery } from '../../../src/app/[locale]/admin/cordis/actions';

const rlsUrl = process.env.DATABASE_URL_RLS_TEST || 'postgresql://fabrika_app:fabrika_app_pass@localhost:5432/fabrika';

async function main() {
  console.log('=== TASK-MTSWVADF7RQ1B Closing Verification Probe ===');

  // Explicitly set env.OPENAI_API_KEY so env module uses it even if process.env was set after import
  (env as Record<string, unknown>).OPENAI_API_KEY = 'sk-fake-test-key-for-probe';

  const client = new pg.Client({ connectionString: rlsUrl });
  await client.connect();

  const roleRes = await client.query('SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user');
  console.log('Active DB Role:', roleRes.rows[0]);

  // Set environment DATABASE_URL to RLS test role for this process
  process.env.DATABASE_URL = rlsUrl;
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'sk-fake-test-key-for-probe';

  // Mock OpenAI embeddings HTTP endpoint to return valid 1536-dim vector response
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    if (urlStr.includes('api.openai.com/v1/embeddings')) {
      console.log('[fetch mock] OpenAI embeddings called!');
      return new Response(
        JSON.stringify({
          data: [{ embedding: new Array(1536).fill(0.0123) }],
          usage: { prompt_tokens: 42, total_tokens: 42 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return originalFetch(url, init);
  }) as typeof fetch;

  // 1. Ingest Document under NOBYPASSRLS role
  console.log('\n--- 1. Testing Document Ingestion under fabrika_app (NOBYPASSRLS) ---');
  const docId = await ingestDocument(
    'Closing Verification Policy Document',
    'This is policy document text for testing RAG ingestion under NOBYPASSRLS role fabrika_app.',
    'POLICY_DOC',
    'demo-tenant',
    { userId: 'user-closing-test' }
  );
  console.log('Ingested Document ID:', docId);

  // Read raw AiUsageLog from Postgres under demo-tenant context (session-level set_config)
  await client.query("SELECT set_config('app.tenant_id', 'demo-tenant', false)");
  const logResDemo = await client.query(
    `SELECT id, "tenantId", "userId", module, purpose, provider, model, "promptHash", "inputTokens", "outputTokens", credits, "createdAt"
     FROM "AiUsageLog"`
  );
  console.log('\nRAW AiUsageLog rows under demo-tenant context:');
  console.log(JSON.stringify(logResDemo.rows, null, 2));

  await client.query("SELECT set_config('app.tenant_id', '__platform__', false)");
  const logResPlatform = await client.query(
    `SELECT id, "tenantId", "userId", module, purpose, provider, model, "promptHash", "inputTokens", "outputTokens", credits, "createdAt"
     FROM "AiUsageLog"`
  );
  console.log('\nRAW AiUsageLog rows under __platform__ context:');
  console.log(JSON.stringify(logResPlatform.rows, null, 2));

  // 2. Test handleTestRagQuery (F-2 check)
  console.log('\n--- 2. Testing handleTestRagQuery (F-2 double call check) ---');
  await client.query("SELECT set_config('app.tenant_id', '__platform__', false)");
  const countBefore = (await client.query(`SELECT count(*)::int as n FROM "AiUsageLog"`)).rows[0].n;
  
  const ragResult = await handleTestRagQuery('Horizon Europe climate goals', 3);
  console.log('handleTestRagQuery returned chunks count:', ragResult.chunks.length);
  console.log('handleTestRagQuery prompt length:', ragResult.ragPrompt.length);

  await client.query("SELECT set_config('app.tenant_id', '__platform__', false)");
  const countAfter = (await client.query(`SELECT count(*)::int as n FROM "AiUsageLog"`)).rows[0].n;
  const delta = Number(countAfter) - Number(countBefore);
  console.log(`AiUsageLog delta for handleTestRagQuery: ${delta} (Expected: 1)`);

  if (delta !== 1) {
    console.error(`❌ F-2 STILL OPEN! Expected 1 embedding call, got ${delta}`);
    process.exit(1);
  } else {
    console.log('✅ F-2 FIXED! Exactly 1 embedding call & AiUsageLog row logged.');
  }

  // Cleanup probe data
  await client.query(`DELETE FROM "Chunk" WHERE "documentId" = $1`, [docId]);
  await client.query(`DELETE FROM "Document" WHERE id = $1`, [docId]);
  await client.end();
  console.log('\nProbe cleanup complete.');
}

main().catch(err => {
  console.error('Probe failed:', err);
  process.exit(1);
});
