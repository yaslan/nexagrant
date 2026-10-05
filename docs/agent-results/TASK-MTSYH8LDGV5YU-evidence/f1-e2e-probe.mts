/**
 * F-1 end-to-end: run the REAL embedText / generateCompletion against a
 * connection that is genuinely subject to RLS. DATABASE_URL is overridden to
 * the fabrika_app (NOBYPASSRLS) role by the caller, so `withTenant` inside
 * src/lib/llm.ts talks to Postgres as production would. The provider is stubbed
 * — no network call, no spend.
 */
import { prisma as privileged } from '/Users/macbook/AgentSpace/fabrika/src/lib/db.ts';

const R = String.raw;
const F = '/Users/macbook/AgentSpace/fabrika';

// Provider stub: one Anthropic shape, one OpenAI embeddings shape.
globalThis.fetch = (async (url: string) => ({
  ok: true,
  status: 200,
  text: async () => '',
  json: async () =>
    String(url).includes('embeddings')
      ? { data: [{ embedding: new Array(1536).fill(0.01) }], usage: { prompt_tokens: 137 } }
      : { content: [{ type: 'text', text: 'generated section' }], usage: { input_tokens: 4000, output_tokens: 1000 } },
})) as unknown as typeof fetch;

const { embedText, generateCompletion, getCreditBalance, PLATFORM_SCOPE_TENANT_ID } =
  await import(`${F}/src/lib/llm.ts`);

const [role] = await privileged.$queryRaw<{ usr: string; rolbypassrls: boolean }[]>`
  SELECT current_user AS usr, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
console.log('llm.ts connection role:', JSON.stringify(role));
if (role!.rolbypassrls) { console.log('!! BYPASSRLS — proof would be meaningless'); process.exit(2); }

const admin = (await import(`${F}/src/lib/db.ts`)).createDbClient(process.env.ADMIN_DATABASE_URL!);
const t = await admin.tenant.create({
  data: { name: 'F1 e2e', slug: `f1-e2e-${Date.now()}`, country: 'TR', orgType: 'SME' },
});
const tenantId: string = t.id;
await admin.creditLedger.create({ data: { tenantId, delta: 500, reason: 'probe:grant' } });

async function step(label: string, fn: () => Promise<string>) {
  try { console.log(`  ${label}\n     -> ${await fn()}`); }
  catch (e) {
    const m = String((e as Error).message).replace(/\s+/g, ' ').slice(0, 120);
    console.log(`  ${label}\n     -> THREW ${(e as Error).name}: ${m}`);
  }
}

try {
  console.log('\n=== 1. getCreditBalance (a 500-credit row exists) ===');
  await step('getCreditBalance(tenantId)', async () => `balance = ${await getCreditBalance(tenantId)}`);

  console.log('\n=== 2. generateCompletion — usage row + ledger row ===');
  await step('generateCompletion({ tenantId, module: M2 })', async () => {
    const r = await generateCompletion({
      tenantId, userId: 'user_1', module: 'M2', purpose: 'concept_note_draft',
      prompt: 'Draft the impact section.',
    });
    return `returned ${r.credits} credit(s) charged`;
  });

  console.log('\n=== 3. embedText — tenant scope ===');
  await step('embedText(text, { tenantId })', async () => {
    const v = await embedText('tenant document chunk', {
      tenantId, userId: 'user_1', module: 'K6', purpose: 'rag_ingest_embedding',
    });
    return `vector of ${v.length} dims`;
  });

  console.log('\n=== 4. embedText — platform scope (shared CORDIS corpus) ===');
  await step('embedText(text, { tenantId: null })', async () => {
    const v = await embedText('shared corpus row', {
      tenantId: null, module: 'K6', purpose: 'cordis_ingest_embedding',
    });
    return `vector of ${v.length} dims`;
  });

  console.log('\n=== 5. what actually landed in the database ===');
  const rows = await admin.aiUsageLog.findMany({
    where: { tenantId: { in: [tenantId, PLATFORM_SCOPE_TENANT_ID] } },
    select: { tenantId: true, module: true, purpose: true, inputTokens: true, credits: true },
    orderBy: { purpose: 'asc' },
  });
  for (const r of rows) console.log('   ', JSON.stringify({ ...r, tenantId: r.tenantId === tenantId ? '<tenant>' : r.tenantId }));
  const ledger = await admin.creditLedger.findMany({ where: { tenantId }, select: { delta: true, reason: true } });
  console.log('    ledger:', JSON.stringify(ledger));
  console.log(`\n    AiUsageLog rows written: ${rows.length}  (expected 3)`);
} finally {
  await admin.aiUsageLog.deleteMany({ where: { tenantId: { in: [tenantId, '__platform__'] } } }).catch(() => {});
  await admin.tenant.delete({ where: { id: tenantId } }).catch(() => {});
  await admin.$disconnect().catch(() => {});
  await privileged.$disconnect().catch(() => {});
}
