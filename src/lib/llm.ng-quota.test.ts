import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * NG-250 — the NexaGrant monthly AI allowance is checked in `generateCompletion` before the
 * provider is called and before any credit moves, on both paths: the adapter's own
 * reservation and a caller that reserved already (M17, `creditsReserved`). The real
 * `assertNgAiQuota` runs against an in-memory transaction; `fetch` records every request.
 *
 * NG-271: a passing check takes an in-flight hold; every path out of the call removes it (the
 * live concurrency proof is tests/ng271-ai-quota-inflight.live.test.ts).
 */

const h = vi.hoisted(() => ({
  fetches: 0,
  ledgerWrites: 0,
  sub: null as Record<string, unknown> | null,
  aiThisMonth: 0,
  balance: 100,
  holds: new Map<string, Date>(),
  holdsTaken: 0,
}));

vi.mock('@/lib/env', () => ({ env: { ANTHROPIC_API_KEY: 'test-key', OPENAI_API_KEY: undefined } }));

vi.mock('@/lib/db', () => {
  const PLANS: Record<string, object> = {
    'ng-free': { id: 'ng-free', tier: 'free', sortOrder: 1, sellable: false, isFallback: true },
    'ng-pro': { id: 'ng-pro', tier: 'professional', sortOrder: 3, sellable: true, isFallback: false },
  };
  const FEATURES: Record<string, [string, number | null][]> = {
    'ng-free': [['org_profile', null], ['seats', 1]],
    'ng-pro': [['org_profile', null], ['seats', 5], ['ai_writing_monthly', 50]],
  };
  const tx = {
    $executeRaw: async () => 0,
    ngSubscription: { findUnique: async () => h.sub },
    ngPlan: {
      findUnique: async ({ where }: { where: { id: string } }) => PLANS[where.id] ?? null,
      findFirst: async () => PLANS['ng-free'],
    },
    ngPlanFeature: {
      findMany: async ({ where }: { where: { planId: string } }) =>
        (FEATURES[where.planId] ?? []).map(([featureKey, limitValue]) => ({ planId: where.planId, featureKey, limitValue })),
    },
    creditLedger: {
      aggregate: async () => ({ _sum: { delta: h.balance } }),
      create: async () => {
        h.ledgerWrites += 1;
        return {};
      },
      findFirst: async () => null,
    },
    aiUsageLog: { create: async () => ({}), count: async () => h.aiThisMonth },
    ngAiQuotaHold: {
      deleteMany: async ({ where }: { where: { id?: string; expiresAt?: { lte: Date } } }) => {
        let count = 0;
        for (const [id, expiresAt] of h.holds) {
          if ((where.id && id === where.id) || (where.expiresAt && expiresAt <= where.expiresAt.lte)) {
            h.holds.delete(id);
            count += 1;
          }
        }
        return { count };
      },
      count: async ({ where }: { where: { expiresAt: { gt: Date } } }) =>
        [...h.holds.values()].filter((at) => at > where.expiresAt.gt).length,
      create: async ({ data }: { data: { expiresAt: Date } }) => {
        h.holdsTaken += 1;
        const id = `hold-${h.holdsTaken}`;
        h.holds.set(id, data.expiresAt);
        return { id };
      },
    },
  };
  return { withTenant: async (_tenantId: string, cb: (t: typeof tx) => Promise<unknown>) => cb(tx) };
});

const { generateCompletion } = await import('@/lib/llm');
const { NgPlanLimitError } = await import('@/lib/billing/nexagrant/usage');

const base = { tenantId: 't1', module: 'M17', purpose: 'evaluate-attempt', messages: [{ role: 'user' as const, content: 'hi' }] };
const TRIAL = {
  tenantId: 't1',
  planId: 'ng-pro',
  status: 'TRIALING',
  provider: 'ng-trial',
  trialSegment: 'default',
  trialStartedAt: new Date(Date.now() - 3 * 86_400_000),
  trialEndsAt: new Date(Date.now() + 3 * 86_400_000),
  trialEndPlanId: 'ng-free',
  trialEndedAt: null,
};

beforeEach(() => {
  Object.assign(h, { fetches: 0, ledgerWrites: 0, sub: null, aiThisMonth: 0, balance: 100, holds: new Map(), holdsTaken: 0 });
  vi.stubGlobal('fetch', async () => {
    h.fetches += 1;
    return new Response(
      JSON.stringify({ content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('generateCompletion — NexaGrant monthly AI allowance (NG-250)', () => {
  test('at the limit: refused with NG_PLAN_LIMIT_REACHED, no provider request, no credit moved', async () => {
    h.sub = TRIAL;
    h.aiThisMonth = 50;
    const err = await generateCompletion(base).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NgPlanLimitError);
    expect((err as InstanceType<typeof NgPlanLimitError>).digest).toBe('NG_PLAN_LIMIT_REACHED');
    expect(h.fetches).toBe(0);
    expect(h.ledgerWrites).toBe(0);
  });

  test('a caller that reserved its credits itself (M17) is refused too', async () => {
    h.sub = TRIAL;
    h.aiThisMonth = 50;
    await expect(generateCompletion({ ...base, creditsReserved: true })).rejects.toBeInstanceOf(NgPlanLimitError);
    expect(h.fetches).toBe(0);
  });

  test('after the trial (Ücretsiz Kontrol grants no AI) the first call is refused', async () => {
    h.sub = { ...TRIAL, trialEndsAt: new Date(Date.now() - 1000) };
    await expect(generateCompletion(base)).rejects.toBeInstanceOf(NgPlanLimitError);
    expect(h.fetches).toBe(0);
  });

  test('below the limit the call goes out', async () => {
    h.sub = TRIAL;
    h.aiThisMonth = 49;
    await generateCompletion(base);
    expect(h.fetches).toBe(1);
  });

  test('K-584603 = A: a tenant without a NexaGrant row is not counted', async () => {
    h.aiThisMonth = 10_000;
    await generateCompletion(base);
    expect(h.fetches).toBe(1);
    expect(h.holdsTaken).toBe(0);
  });
});

describe('generateCompletion — NexaGrant in-flight hold (NG-271)', () => {
  test('a delivered call takes one hold and removes it with its usage row', async () => {
    h.sub = TRIAL;
    h.aiThisMonth = 10;
    await generateCompletion({ ...base, module: 'M2', purpose: 'concept-note' });
    expect(h.holdsTaken).toBe(1);
    expect(h.holds.size).toBe(0);
  });

  test('a live hold counts: one below the limit plus one in flight is refused', async () => {
    h.sub = TRIAL;
    h.aiThisMonth = 49;
    h.holds.set('other-call', new Date(Date.now() + 60_000));
    const err = await generateCompletion(base).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NgPlanLimitError);
    expect((err as InstanceType<typeof NgPlanLimitError>).used).toBe(50);
    expect(h.fetches).toBe(0);
  });

  test('an expired hold does not count and is deleted', async () => {
    h.sub = TRIAL;
    h.aiThisMonth = 49;
    h.holds.set('dead-call', new Date(Date.now() - 1));
    await generateCompletion(base);
    expect(h.fetches).toBe(1);
    expect(h.holds.size).toBe(0);
  });

  test('a provider error gives the hold back', async () => {
    h.sub = TRIAL;
    vi.stubGlobal('fetch', async () => new Response('{"error":{"message":"bad"}}', { status: 400 }));
    await expect(generateCompletion({ ...base, module: 'M2', purpose: 'concept-note' })).rejects.toThrow();
    expect(h.holdsTaken).toBe(1);
    expect(h.holds.size).toBe(0);
  });

  test('a call refused for credit gives the hold back and reaches no provider', async () => {
    h.sub = TRIAL;
    h.balance = 0;
    await expect(generateCompletion({ ...base, module: 'M2', purpose: 'concept-note' })).rejects.toThrow(/Insufficient AI credits/);
    expect(h.holdsTaken).toBe(1);
    expect(h.holds.size).toBe(0);
    expect(h.fetches).toBe(0);
  });
});
