/**
 * Regression suite for TASK-MTSZ21XP2R42B:
 * Verifies that AI actions (M2, M6, M9, M10) debit CreditLedger exactly ONCE per AI call
 * and thatllm.ts is the single source of credit debiting.
 *
 * Runs against real Postgres DB, real Prisma client, real withTenant/RLS, real src/lib/llm.ts.
 * Only external provider HTTPS calls and session/gate modules are mocked.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

const TENANT = 'demo-tenant';
const PROBE = 'QA_REGRESSION_MTSZ21XP2R42B';

vi.mock('@/lib/tenant', () => ({
  requireTenantAction: async () => ({ tenantId: TENANT, userId: null, workspaceSlug: 'demo' }),
}));
vi.mock('@/lib/modules/access', () => ({
  assertModuleAccess: async () => undefined,
  ModuleAccessError: class extends Error {},
}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('@/lib/auth', () => ({
  auth: async () => ({ user: { id: 'probe-user', email: 'qa@probe.local' } }),
}));
vi.mock('@/lib/env', async (orig) => {
  const actual = (await orig()) as { env: Record<string, unknown> };
  return { ...actual, env: { ...actual.env, ANTHROPIC_API_KEY: 'probe-key' } };
});

import { prisma, withTenant } from '@/lib/db';
import { seededOrSkipping } from './helpers/seed';

const balance = () =>
  withTenant(TENANT, (tx) => tx.creditLedger.aggregate({ where: { tenantId: TENANT }, _sum: { delta: true } }))
    .then((r) => r._sum.delta ?? 0);

const debitsSince = (since: Date) =>
  withTenant(TENANT, (tx) =>
    tx.creditLedger.findMany({
      where: { tenantId: TENANT, delta: { lt: 0 }, createdAt: { gte: since } },
      select: { delta: true, reason: true },
      orderBy: { createdAt: 'asc' },
    })
  );

// The suite runs on the seeded demo tenant and its demo opportunity.
const seeded = seededOrSkipping(
  'double charge prevention',
  await prisma.tenant.count({ where: { id: TENANT } }).then((n) => n > 0),
  `the demo tenant '${TENANT}' is missing`
);

describe.skipIf(!seeded)('Double Charge Prevention & Single Debit Enforcement', () => {
  beforeAll(async () => {
    // Grant credits to demo tenant
    await withTenant(TENANT, (tx) =>
      tx.creditLedger.create({ data: { tenantId: TENANT, delta: 1000, reason: PROBE + '_grant' } })
    );

    // Stub external HTTPS calls to Anthropic
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.includes('anthropic.com')) {
        return new Response(
          JSON.stringify({
            content: [
              { type: 'thinking', thinking: 'evaluating...' },
              {
                type: 'text',
                text: JSON.stringify({
                  excellence: 4,
                  impact: 4,
                  implementation: 4,
                  strengths: ['s'],
                  weaknesses: ['w'],
                  recommendations: ['r'],
                  content: 'PROBE BRIEF BODY',
                }),
              },
            ],
            usage: { input_tokens: 4000, output_tokens: 1000 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    process.env.ANTHROPIC_API_KEY = 'probe-key';
  });

  afterAll(async () => {
    await withTenant(TENANT, async (tx) => {
      await tx.applicationPart.deleteMany({ where: { id: PROBE + '_part_b' } });
      await tx.evaluation.deleteMany({ where: { opportunityId: 'demo-opp-1' } });
      await tx.meetingBrief.deleteMany({ where: { tenantId: TENANT, interactionId: { startsWith: PROBE } } });
      await tx.followupDoc.deleteMany({ where: { tenantId: TENANT, opportunityId: 'demo-opp-1' } });
      await tx.aiUsageLog.deleteMany({ where: { tenantId: TENANT } });
      await tx.creditLedger.deleteMany({ where: { tenantId: TENANT } });
    });
    await prisma.$disconnect();
  });

  it('M2: both entry shapes price and hash identically (single debit)', async () => {
    const SYSTEM = 'You are an EU proposal writer.';
    const USER = 'Write the Excellence section.';
    const { generateText, generateCompletion } = await import('@/lib/llm');

    // shape A - module action
    await generateText({ tenantId: TENANT, module: 'M2', purpose: 'QA_CLAIM', system: SYSTEM, prompt: USER });
    // shape B - concept notes screen
    const b = await generateCompletion({
      tenantId: TENANT,
      module: 'M2',
      purpose: 'QA_CLAIM',
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: USER }],
    });

    const rows = await withTenant(TENANT, (tx) =>
      tx.aiUsageLog.findMany({
        where: { tenantId: TENANT, purpose: 'QA_CLAIM' },
        select: { model: true, promptHash: true, inputTokens: true, outputTokens: true, credits: true },
        orderBy: { createdAt: 'asc' },
      })
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]!.credits).toBe(rows[1]!.credits);
    expect(rows[0]!.promptHash).toBe(rows[1]!.promptHash);
    expect(rows[0]!.promptHash).toHaveLength(64);
    expect(rows[0]!.model).toBe(rows[1]!.model);
    expect(b.credits).toBe(rows[1]!.credits);
  });

  it('M6 generateAiEvaluation: charges tenant exactly ONCE (-3 credits)', async () => {
    const { generateAiEvaluation } = await import('@/modules/m6/server/actions');
    const t0 = new Date();
    await new Promise((r) => setTimeout(r, 20));
    const before = await balance();

    // M6 refuses, uncharged, when there is no proposal text to read (NG-98).
    await withTenant(TENANT, (tx) =>
      tx.applicationPart.create({
        data: {
          id: PROBE + '_part_b',
          tenantId: TENANT,
          opportunityId: 'demo-opp-1',
          part: 'PART_B',
          content: { sections: [{ title: '1.1 Objectives', content: 'Validate soil sensors on 40 farms.' }] },
        },
      })
    );

    await generateAiEvaluation('demo-opp-1');

    const rows = await debitsSince(t0);
    const usage = await withTenant(TENANT, (tx) =>
      tx.aiUsageLog.findMany({
        where: { tenantId: TENANT, purpose: 'evaluation' },
        select: { credits: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      })
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.delta).toBe(-3);
    expect(rows[0]!.reason).toBe('usage:M6');
    expect(before - (await balance())).toBe(3);
    expect(usage[0]!.credits).toBe(3);
  });

  it('M9 generateMeetingBrief: charges tenant exactly ONCE (-1 credit)', async () => {
    const { generateMeetingBrief } = await import('@/modules/m9/server/actions');
    const t0 = new Date();
    await new Promise((r) => setTimeout(r, 20));
    const before = await balance();

    await generateMeetingBrief({ interactionId: PROBE + '_i1', partnerName: 'ACME', callTopic: 'HORIZON-CL5' });

    const rows = await debitsSince(t0);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.delta).toBe(-1);
    expect(rows[0]!.reason).toBe('usage:M9');
    expect(before - (await balance())).toBe(1);
  });

  it('M10 generateStandardDoc: charges tenant exactly ONCE (-1 credit)', async () => {
    const { generateStandardDoc } = await import('@/modules/m10/server/actions');
    const t0 = new Date();
    await new Promise((r) => setTimeout(r, 20));
    const before = await balance();

    await generateStandardDoc('demo-opp-1', 'NDA');

    const rows = await debitsSince(t0);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.delta).toBe(-1);
    expect(rows[0]!.reason).toBe('usage:M10');
    expect(before - (await balance())).toBe(1);
  });

  it('Idempotency check: repeated calls execute and charge each time (no deduplication in llm.ts)', async () => {
    const { generateMeetingBrief } = await import('@/modules/m9/server/actions');
    const t0 = new Date();
    await new Promise((r) => setTimeout(r, 20));
    const before = await balance();

    // Call identical action twice
    await generateMeetingBrief({ interactionId: PROBE + '_retry1', partnerName: 'ACME', callTopic: 'RETRY' });
    await generateMeetingBrief({ interactionId: PROBE + '_retry1', partnerName: 'ACME', callTopic: 'RETRY' });

    const rows = await debitsSince(t0);
    // Two executions produce two debits (no idempotency key/cache)
    expect(rows).toHaveLength(2);
    expect(before - (await balance())).toBe(2);
  });
});
