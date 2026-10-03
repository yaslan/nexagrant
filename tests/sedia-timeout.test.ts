/**
 * TASK-MUS7OVUMOJZP3 — the SEDIA search fetch had no timeout, so one stalled page
 * held /api/cagrilar (and the calls page's "loading") for as long as the socket
 * stayed open. A page now gives up after SEDIA_TIMEOUT_MS, pagination stops, and
 * the pages already read come back.
 */
import { afterEach, describe, expect, test, vi } from 'vitest';
import { SEDIA_TIMEOUT_MS, SediaAdapter } from '@/lib/adapters/sedia';

const page = (n: number) => ({
  totalResults: 300,
  results: [
    { metadata: { identifier: [`HORIZON-T-${n}`], title: [`Topic ${n}`], status: ['31094502'] } },
  ],
});

/** Page 1 answers; every later page hangs until its signal fires, like a stalled socket. */
function stallAfterFirstPage() {
  return vi.fn((url: string, init?: RequestInit) => {
    const n = Number(new URL(url).searchParams.get('pageNumber'));
    if (n === 1) return Promise.resolve(Response.json(page(1)));
    return new Promise<Response>((_, reject) => {
      const signal = init?.signal;
      signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SEDIA search timeout', () => {
  test('the default per-page timeout is 10 s', () => {
    expect(SEDIA_TIMEOUT_MS).toBe(10_000);
  });

  test('a stalled page times out: pagination stops and the pages read so far come back', async () => {
    const fetchMock = stallAfterFirstPage();
    vi.stubGlobal('fetch', fetchMock);

    const started = Date.now();
    const result = await new SediaAdapter().searchSedia({ maxPages: 5, pageSize: 1, timeoutMs: 50 });

    expect(Date.now() - started).toBeLessThan(1_000);
    expect(result.topics.map((t) => t.identifier)).toEqual(['HORIZON-T-1']);
    expect(result.totalResults).toBe(300);
    expect(fetchMock).toHaveBeenCalledTimes(2); // page 2 timed out, page 3 never asked for
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/^Page 2 fetch error: .*(timeout|aborted)/i);
  }, 2_000);

  test("the caller's signal stops the search too, and no further page is asked for", async () => {
    const fetchMock = stallAfterFirstPage();
    vi.stubGlobal('fetch', fetchMock);
    const caller = new AbortController();
    setTimeout(() => caller.abort(new DOMException('budget', 'TimeoutError')), 50);

    // The per-page timeout is far away, so only the caller's signal can end this.
    const result = await new SediaAdapter().searchSedia({
      maxPages: 5,
      pageSize: 1,
      timeoutMs: 60_000,
      signal: caller.signal,
    });

    expect(result.topics.map((t) => t.identifier)).toEqual(['HORIZON-T-1']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.errors[0]).toMatch(/^Page 2 fetch error/);
  }, 2_000);

  // crw-fb Ö-1 (mutant O2): the route always passes a signal. With
  // `signal ?? pageTimeout` the per-page cap silently dropped out, and only the
  // route's whole budget was left to end a stalled page.
  test('a live caller signal does not replace the per-page timeout', async () => {
    const fetchMock = stallAfterFirstPage();
    vi.stubGlobal('fetch', fetchMock);
    const caller = new AbortController(); // never fires in this test

    const started = Date.now();
    const result = await new SediaAdapter().searchSedia({
      maxPages: 5,
      pageSize: 1,
      timeoutMs: 50,
      signal: caller.signal,
    });

    expect(Date.now() - started).toBeLessThan(1_000);
    expect(caller.signal.aborted).toBe(false);
    expect(result.topics.map((t) => t.identifier)).toEqual(['HORIZON-T-1']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.errors[0]).toMatch(/^Page 2 fetch error: .*timeout/i);
  }, 2_000);

  test('an already-cancelled caller makes no request at all', async () => {
    const fetchMock = stallAfterFirstPage();
    vi.stubGlobal('fetch', fetchMock);

    const result = await new SediaAdapter().searchSedia({ signal: AbortSignal.abort() });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.topics).toEqual([]);
    expect(result.errors[0]).toMatch(/^Page 1 not fetched/);
  });
});
