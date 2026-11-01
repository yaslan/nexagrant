/**
 * QA probe (TASK-MTSXGXBCJ007W) — does ONE M6 evaluation move CreditLedger ONCE?
 *
 * Real Postgres, real prisma, real withTenant/RLS, real src/lib/llm.ts.
 * Stubbed: the session (auth), the module gate, next/cache, and the HTTPS call
 * to Anthropic. Nothing on the billing path is stubbed.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
const OUT = '/tmp/qa-double-charge.txt';
const log = (...a: unknown[]) => fs.appendFileSync(OUT, a.map(String).join(' ') + '\n');

const TENANT = 'demo-tenant';
const PROBE = 'QA_PROBE_MTSXGXBCJ007W';

vi.mock('@/lib/tenant', () => ({
  requireTenantAction: async () => ({ tenantId: TENANT, userId: null, workspaceSlug: 'demo' }),
}));
vi.mock('@/lib/modules/access', () => ({
  assertModuleAccess: async () => undefined,
  ModuleAccessError: class extends Error {},
}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('@/lib/env', async (orig) => {
  const actual = (await orig()) as { env: Record<string, unknown> };
  return { ...actual, env: { ...actual.env, ANTHROPIC_API_KEY: 'probe-key' } };
});

import { prisma, withTenant } from '@/lib/db';

const created: { usage: string[]; ledger: string[]; opp: string[]; evalIds: string[] } = {
  usage: [], ledger: [], opp: [], evalIds: [],
};

describe('one M6 AI evaluation = how many CreditLedger rows?', () => {
  let oppId = '';

  beforeAll(async () => {
    // A real, already-seeded opportunity of the demo tenant. Nothing invented.
    oppId = 'demo-opp-1';

    // Give the tenant credits so the balance gate passes.
    const grant = await withTenant(TENANT, (tx) =>
      tx.creditLedger.create({ data: { tenantId: TENANT, delta: 500, reason: PROBE + '_grant' } })
    );
    created.ledger.push((grant as { id: string }).id);

    // Stub only the provider HTTPS call: 4000 in / 1000 out, thinking block first.
    vi.stubGlobal('fetch', async () =>
      new Response(
        JSON.stringify({
          content: [
            { type: 'thinking', thinking: 'hmm' },
            { type: 'text', text: JSON.stringify({
                excellence: 4, impact: 4, implementation: 4,
                strengths: ['s'], weaknesses: ['w'], recommendations: ['r'],
            }) },
          ],
          usage: { input_tokens: 4000, output_tokens: 1000 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    process.env.ANTHROPIC_API_KEY = 'probe-key';
  });

  afterAll(async () => {
    await withTenant(TENANT, async (tx) => {
      await tx.evaluation.deleteMany({ where: { opportunityId: { in: created.opp } } });
      await tx.aiUsageLog.deleteMany({ where: { purpose: 'evaluation', tenantId: TENANT } });
      await tx.creditLedger.deleteMany({
        where: { tenantId: TENANT, reason: { in: [PROBE + '_grant', 'usage:M6', 'M6: Evaluator Lens AI pre-assessment'] } },
      });
    });
    const left = await prisma.creditLedger.count();
    const leftU = await prisma.aiUsageLog.count();
    log(`CLEANUP -> CreditLedger rows left: ${left}, AiUsageLog rows left: ${leftU}`);
    await prisma.$disconnect();
  });

  it('charges the tenant exactly once per AI evaluation', async () => {
    const { generateAiEvaluation } = await import('@/modules/m6/server/actions');

    const before = await withTenant(TENANT, (tx) =>
      tx.creditLedger.aggregate({ where: { tenantId: TENANT }, _sum: { delta: true } })
    );
    log('balance BEFORE:', before._sum.delta);

    await generateAiEvaluation(oppId);

    const rows = await withTenant(TENANT, (tx) =>
      tx.creditLedger.findMany({
        where: { tenantId: TENANT, delta: { lt: 0 } },
        orderBy: { createdAt: 'desc' },
        select: { delta: true, reason: true },
        take: 5,
      })
    );
    const usage = await withTenant(TENANT, (tx) =>
      tx.aiUsageLog.findMany({
        where: { tenantId: TENANT, purpose: 'evaluation' },
        select: { module: true, purpose: true, model: true, inputTokens: true, outputTokens: true, credits: true },
      })
    );
    const after = await withTenant(TENANT, (tx) =>
      tx.creditLedger.aggregate({ where: { tenantId: TENANT }, _sum: { delta: true } })
    );

    log('--- debit rows written by ONE evaluation ---');
    for (const r of rows) log(JSON.stringify(r));
    log('--- AiUsageLog rows ---');
    for (const u of usage) log(JSON.stringify(u));
    log('balance AFTER:', after._sum.delta, '| total debited:', (before._sum.delta ?? 0) - (after._sum.delta ?? 0));
    log('AiUsageLog says the call cost:', usage[0]?.credits, 'credits');
    log('CreditLedger debit rows for this one call:', rows.length);

    expect(rows.length).toBe(1);
    expect((before._sum.delta ?? 0) - (after._sum.delta ?? 0)).toBe(usage[0]?.credits);
  });
});
