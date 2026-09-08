/**
 * QA re-measurement of the card's own claim (TASK-MTSXGXBCJ007W):
 * the SAME 4000-in/1000-out call, entered through the two shapes M2 uses
 * (generateText for the module action, generateCompletion for the concept-notes
 * screen), must now cost the SAME and hash the SAME.
 * Real DB, real llm.ts. Only the HTTPS call is stubbed.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
const OUT = '/tmp/qa-card-claim.txt';
const log = (...a: unknown[]) => fs.appendFileSync(OUT, a.map(String).join(' ') + '\n');

const TENANT = 'demo-tenant';

vi.mock('@/lib/env', async (orig) => {
  const actual = (await orig()) as { env: Record<string, unknown> };
  return { ...actual, env: { ...actual.env, ANTHROPIC_API_KEY: 'probe-key' } };
});

import { prisma, withTenant } from '@/lib/db';

const SYSTEM = 'You are an EU proposal writer.';
const USER = 'Write the Excellence section.';

describe("the card's claim, re-measured at HEAD", () => {
  beforeAll(async () => {
    await withTenant(TENANT, (tx) =>
      tx.creditLedger.create({ data: { tenantId: TENANT, delta: 500, reason: 'QA_CLAIM_grant' } })
    );
    vi.stubGlobal('fetch', async () =>
      new Response(
        JSON.stringify({
          content: [{ type: 'thinking', thinking: 'x' }, { type: 'text', text: 'answer' }],
          usage: { input_tokens: 4000, output_tokens: 1000 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
  });

  afterAll(async () => {
    await withTenant(TENANT, async (tx) => {
      await tx.aiUsageLog.deleteMany({ where: { tenantId: TENANT } });
      await tx.creditLedger.deleteMany({ where: { tenantId: TENANT } });
    });
    log('CLEANUP -> AiUsageLog:', await prisma.aiUsageLog.count(), 'CreditLedger:', await prisma.creditLedger.count());
    await prisma.$disconnect();
  });

  it('both entry shapes price and hash the same call identically', async () => {
    const { generateText, generateCompletion } = await import('@/lib/llm');

    // shape A — what the six module call sites send
    await generateText({ tenantId: TENANT, module: 'M2', purpose: 'QA_CLAIM', system: SYSTEM, prompt: USER });
    // shape B — what the concept-notes screen sends
    const b = await generateCompletion({
      tenantId: TENANT, module: 'M2', purpose: 'QA_CLAIM',
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: USER }],
    });

    const rows = await withTenant(TENANT, (tx) =>
      tx.aiUsageLog.findMany({
        where: { tenantId: TENANT, purpose: 'QA_CLAIM' },
        select: { model: true, promptHash: true, inputTokens: true, outputTokens: true, credits: true },
        orderBy: { createdAt: 'asc' },
      })
    );
    const ledger = await withTenant(TENANT, (tx) =>
      tx.creditLedger.findMany({ where: { tenantId: TENANT, delta: { lt: 0 } }, select: { delta: true, reason: true } })
    );

    for (const r of rows) log('AiUsageLog:', JSON.stringify({ ...r, hashLen: r.promptHash.length }));
    log('ledger debits:', JSON.stringify(ledger));
    log('screen shows credits:', b.credits, '| row says:', rows[1]?.credits);
    log('same credits:', rows[0]?.credits === rows[1]?.credits, '| same hash:', rows[0]?.promptHash === rows[1]?.promptHash,
        '| hash 64:', rows[0]?.promptHash.length === 64, '| same model:', rows[0]?.model === rows[1]?.model);

    expect(rows).toHaveLength(2);
    expect(rows[0]!.credits).toBe(rows[1]!.credits);
    expect(rows[0]!.promptHash).toBe(rows[1]!.promptHash);
    expect(rows[0]!.promptHash).toHaveLength(64);
    expect(rows[0]!.model).toBe(rows[1]!.model);
    // the number the screen shows must be the number the ledger moved
    expect(b.credits).toBe(rows[1]!.credits);
  });
});
