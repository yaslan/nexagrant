import { createDbClient } from '@/lib/db';
import { ingestDocument, retrieveChunks } from '@/lib/rag';

// Provider stub
globalThis.fetch = (async (_url: string) => ({
  ok: true,
  status: 200,
  text: async () => '',
  json: async () => ({
    data: [{ embedding: new Array(1536).fill(0.01) }],
    usage: { prompt_tokens: 137 },
  }),
})) as unknown as typeof fetch;

async function test() {
  const adminUrl = process.env.ADMIN_DATABASE_URL || 'postgresql://fabrika:fabrika@localhost:5432/fabrika';
  const admin = createDbClient(adminUrl);

  console.log('Testing RAG ingestDocument and retrieveChunks under fabrika_app NOBYPASSRLS...');

  // 1. Shared document ingest (tenantId is undefined)
  const sharedDocId = await ingestDocument(
    'Shared Work Programme',
    'This is shared EU Horizon Europe text for testing RLS.',
    'work_programme'
  );
  console.log('1. Shared doc ingested with id:', sharedDocId);

  // 2. Tenant document ingest (tenantId is 'demo-tenant')
  const tenantDocId = await ingestDocument(
    'Tenant Document',
    'This is private tenant document text.',
    'custom',
    'demo-tenant'
  );
  console.log('2. Tenant doc ingested with id:', tenantDocId);

  // 3. Retrieve shared chunks
  const sharedChunks = await retrieveChunks('Horizon Europe', 5);
  console.log('3. Retrieved shared chunks count:', sharedChunks.length);

  // 4. Retrieve tenant chunks
  const tenantChunks = await retrieveChunks('private tenant', 5, 'demo-tenant');
  console.log('4. Retrieved tenant chunks count:', tenantChunks.length);

  // 5. Verify database rows created
  const docs = await admin.document.findMany({
    where: { id: { in: [sharedDocId, tenantDocId] } },
    select: { id: true, tenantId: true, title: true },
  });
  console.log('5. DB Document rows created:\n', JSON.stringify(docs, null, 2));

  const chunks = await admin.chunk.findMany({
    where: { documentId: { in: [sharedDocId, tenantDocId] } },
    select: { id: true, documentId: true, tenantId: true, text: true },
  });
  console.log('6. DB Chunk rows created:\n', JSON.stringify(chunks, null, 2));

  // Clean up
  await admin.chunk.deleteMany({ where: { documentId: { in: [sharedDocId, tenantDocId] } } });
  await admin.document.deleteMany({ where: { id: { in: [sharedDocId, tenantDocId] } } });
  await admin.$disconnect();

  console.log('✅ All RAG operations succeeded under NOBYPASSRLS role!');
}

test().catch((err) => {
  console.error('❌ RAG probe failed:', err);
  process.exit(1);
});
