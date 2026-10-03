/**
 * TASK-MUS7OVUMOJZP3 — GET /api/cagrilar answers within CAGRILAR_BUDGET_MS.
 *
 * SEDIA had no timeout and translation queues behind a process-wide limit, so the
 * calls page could stay on "loading" for good. The route now (1) hands SEDIA a
 * signal carrying its budget and the client's disconnect, (2) gives translation
 * only what is left of the budget and returns English with `translated: false`
 * once it runs out, and (3) answers 503 when not one SEDIA page came back.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  searchSedia: vi.fn(),
  translate: vi.fn(),
}));

vi.mock('@/lib/tenant', () => ({
  requireTenantApi: vi.fn(async () => ({
    ok: true,
    scope: { tenantId: 't-1', userId: `budget-${Math.random()}`, role: 'MEMBER' },
  })),
}));
vi.mock('@/lib/adapters/sedia', () => ({
  SediaAdapter: class {
    searchSedia = mocks.searchSedia;
  },
}));
vi.mock('@/lib/translation', () => ({ translateTopicsBatch: mocks.translate }));

import { GET, CAGRILAR_BUDGET_MS } from '@/app/api/cagrilar/route';

const TOPIC = {
  identifier: 'HORIZON-CL5-2027-03-D5-06',
  title: 'Clean energy',
  status: 'OPEN',
  deadlines: [],
  sourceUrl: 'https://example.test',
};
const ok = (topics: unknown[], errors: string[] = []) => ({
  totalResults: topics.length,
  pageNumber: 1,
  pageSize: 20,
  topics,
  schemaDrift: [],
  errors,
});

/** Resolves when `signal` fires — a stand-in for an outbound call that never answers. */
const untilAborted = (signal: AbortSignal) =>
  new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));

/** Lets the route's awaits run. Only setTimeout/Date are faked, so setImmediate is real. */
const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
};

function get(query = '?lang=tr', init?: { signal?: AbortSignal }) {
  return GET(new NextRequest(`http://localhost/api/cagrilar${query}`, init));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  mocks.searchSedia.mockReset().mockResolvedValue(ok([TOPIC]));
  mocks.translate
    .mockReset()
    .mockImplementation(async (topics: Array<typeof TOPIC>) => topics.map((t) => ({ ...t, title: `TR ${t.title}` })));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('/api/cagrilar time budget', () => {
  test('the budget is 20 s', () => {
    expect(CAGRILAR_BUDGET_MS).toBe(20_000);
  });

  test('within the budget the topics come back translated, with translated: true', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, translated: true });
    expect(body.topics[0].title).toBe('TR Clean energy');
    // SEDIA and translation get the same live signal.
    const sediaSignal = mocks.searchSedia.mock.calls[0]![0].signal as AbortSignal;
    expect(sediaSignal).toBeInstanceOf(AbortSignal);
    expect(sediaSignal.aborted).toBe(false);
    expect(mocks.translate.mock.calls[0]![2]).toBeInstanceOf(AbortSignal);
  });

  test('when SEDIA uses up the budget, translation is skipped and English comes back with translated: false', async () => {
    mocks.searchSedia.mockImplementation(async () => {
      vi.advanceTimersByTime(CAGRILAR_BUDGET_MS);
      return ok([TOPIC]);
    });

    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, translated: false });
    expect(body.topics[0].title).toBe('Clean energy');
    expect(mocks.translate).not.toHaveBeenCalled();
  });

  test('when the budget runs out during translation, translation is cancelled and English comes back', async () => {
    mocks.translate.mockImplementation(async (topics: Array<typeof TOPIC>, _lang: string, signal: AbortSignal) => {
      await untilAborted(signal);
      // What a cancelled batch hands back: some titles done, the rest original.
      return topics.map((t) => ({ ...t, title: `TR ${t.title}` }));
    });

    const pending = get();
    await settle();
    expect(mocks.translate).toHaveBeenCalled();
    vi.advanceTimersByTime(CAGRILAR_BUDGET_MS);
    const res = await pending;

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, translated: false });
    // A half-translated list is thrown away, not mixed into the answer.
    expect(body.topics[0].title).toBe('Clean energy');
  });

  test('the budget signal reaches SEDIA: it fires at CAGRILAR_BUDGET_MS and not before', async () => {
    let sediaSignal: AbortSignal | undefined;
    mocks.searchSedia.mockImplementation(async ({ signal }: { signal: AbortSignal }) => {
      sediaSignal = signal;
      await untilAborted(signal);
      return ok([], ['Page 1 fetch error: The operation was aborted due to timeout']);
    });

    const pending = get();
    await settle();
    expect(sediaSignal).toBeDefined();
    vi.advanceTimersByTime(CAGRILAR_BUDGET_MS - 1);
    expect(sediaSignal!.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(sediaSignal!.aborted).toBe(true);
    expect((await pending).status).toBe(503);
  });

  test("the client's disconnect cancels the same work", async () => {
    let translateSignal: AbortSignal | undefined;
    mocks.translate.mockImplementation(async (topics: unknown[], _lang: string, signal: AbortSignal) => {
      translateSignal = signal;
      await untilAborted(signal);
      return topics;
    });
    const client = new AbortController();

    const pending = get('?lang=tr', { signal: client.signal });
    await settle();
    expect(translateSignal).toBeDefined();
    client.abort();
    expect(translateSignal!.aborted).toBe(true);
    expect((await (await pending).json()).translated).toBe(false);
  });

  test('not one SEDIA page back is a 503 with a message, not an empty 200', async () => {
    mocks.searchSedia.mockResolvedValue(ok([], ['Page 1 fetch error: The operation was aborted due to timeout']));

    const res = await get();
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('30');
    const body = await res.json();
    expect(body).toMatchObject({ success: false, error: 'sedia_unavailable' });
    expect(body.message).toMatch(/SEDIA/);
    // The upstream error text stays in the log (O-2).
    expect(JSON.stringify(body)).not.toMatch(/aborted due to timeout/);
    expect(mocks.translate).not.toHaveBeenCalled();
  });

  test('a search that really matches nothing is still a 200', async () => {
    mocks.searchSedia.mockResolvedValue(ok([]));
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, topics: [], translated: false });
  });

  test('lang=en is never translated and says so', async () => {
    const body = await (await get('?lang=en')).json();
    expect(body).toMatchObject({ success: true, translated: false });
    expect(mocks.translate).not.toHaveBeenCalled();
  });
});
