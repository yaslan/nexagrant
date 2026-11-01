import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * FO-291 M5 — `generateCompletion` with `creditsReserved` (FO-274): the run's price was reserved
 * in the claim, so a balance that the reservation took to exactly 0 must not refuse the model
 * call again. Without the flag the same balance is refused. The database is an in-memory stub
 * with a zero balance and `fetch` answers a well-formed reply.
 */

const state = vi.hoisted(() => ({ fetches: 0 }));

vi.mock('@/lib/env', () => ({ env: { ANTHROPIC_API_KEY: 'test-key', OPENAI_API_KEY: undefined } }));

vi.mock('@/lib/db', () => {
  const tx = {
    creditLedger: {
      aggregate: async () => ({ _sum: { delta: 0 } }),
      create: async () => ({}),
    },
    aiUsageLog: { create: async () => ({}) },
  };
  return { withTenant: async (_tenantId: string, cb: (t: typeof tx) => Promise<unknown>) => cb(tx) };
});

const { generateCompletion } = await import('@/lib/llm');

const messages = [{ role: 'user' as const, content: 'hello' }];
const base = { tenantId: 't1', module: 'M17', purpose: 'evaluate-attempt', messages };

beforeEach(() => {
  state.fetches = 0;
  vi.stubGlobal('fetch', async () => {
    state.fetches += 1;
    return new Response(
      JSON.stringify({ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('generateCompletion — credits reserved by the caller (FO-291 M5)', () => {
  test('a run whose reservation took the balance to 0 is still sent to the provider', async () => {
    const reply = await generateCompletion({ ...base, creditsReserved: true });

    expect(reply.text).toBe('ok');
    expect(state.fetches).toBe(1);
  });

  test('without the flag the same zero balance is refused before the provider is called', async () => {
    await expect(generateCompletion({ ...base })).rejects.toThrow('Insufficient AI credits');

    expect(state.fetches).toBe(0);
  });
});
