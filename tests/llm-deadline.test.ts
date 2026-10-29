import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * FO-188 Soru 2 — a provider request with a deadline is cut off at that instant and
 * not retried past it; a request without one is sent exactly as before (no signal).
 * The database is replaced by an in-memory transaction, and `fetch` by a stub that
 * only ever answers when its signal aborts or a test resolves it.
 */

const state = vi.hoisted(() => ({ fetches: [] as { url: string; signal: AbortSignal | undefined }[] }));

vi.mock('@/lib/env', () => ({ env: { ANTHROPIC_API_KEY: 'test-key', OPENAI_API_KEY: undefined } }));

vi.mock('@/lib/db', () => {
  const tx = {
    creditLedger: {
      aggregate: async () => ({ _sum: { delta: 100 } }),
      create: async () => ({}),
    },
    aiUsageLog: { create: async () => ({}) },
  };
  return { withTenant: async (_tenantId: string, cb: (t: typeof tx) => Promise<unknown>) => cb(tx) };
});

const { generateCompletion } = await import('@/lib/llm');

const messages = [{ role: 'user' as const, content: 'hello' }];
const base = { tenantId: 't1', module: 'M17', purpose: 'evaluate-attempt', messages };

/** A request that never answers on its own: it rejects when its signal aborts. */
function hangUntilAborted(url: string, init: RequestInit): Promise<Response> {
  state.fetches.push({ url, signal: init.signal ?? undefined });
  return new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(init.signal!.reason));
  });
}

beforeEach(() => {
  state.fetches = [];
  vi.stubGlobal('fetch', hangUntilAborted);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('generateCompletion — provider deadline', () => {
  test('a request with a deadline is abandoned at the deadline and not retried past it', async () => {
    const started = Date.now();

    await expect(generateCompletion({ ...base, deadlineAt: Date.now() + 80 })).rejects.toThrow();

    expect(Date.now() - started).toBeLessThan(900); // a retry would have waited 1 s before the second attempt
    expect(state.fetches).toHaveLength(1);
    expect(state.fetches[0]!.signal).toBeInstanceOf(AbortSignal);
    expect(state.fetches[0]!.signal!.aborted).toBe(true);
  });

  test('a request whose signal has fired is not retried, even if the clock says there is time left', async () => {
    // The signal runs on its own clock; the wall clock is frozen before the deadline, so only
    // the fired signal tells withRetry the request is over (FO-188 review B-2).
    const started = performance.now();
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);

    await expect(generateCompletion({ ...base, deadlineAt: 1_000_000 + 80 })).rejects.toThrow();

    expect(performance.now() - started).toBeLessThan(900); // a retry would have waited 1 s
    expect(state.fetches).toHaveLength(1);
    expect(state.fetches[0]!.signal!.aborted).toBe(true);
  });

  test('a request without a deadline is sent with no signal, as before', async () => {
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      state.fetches.push({ url, signal: init.signal ?? undefined });
      return new Response(
        JSON.stringify({ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const result = await generateCompletion(base);

    expect(result.text).toBe('ok');
    expect(state.fetches).toHaveLength(1);
    expect(state.fetches[0]!.signal).toBeUndefined();
  });
});
