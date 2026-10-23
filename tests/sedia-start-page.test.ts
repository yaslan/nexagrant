/**
 * FO-42 — the calls page sends ?page, and the route passes it on as
 * `startPage`. The adapter must read from that page, not from page 1, and
 * report the page it actually read.
 */
import { afterEach, describe, expect, test, vi } from 'vitest';
import { SEDIA_STABLE_SORT, SediaAdapter } from '@/lib/adapters/sedia';

const page = (n: number) => ({
  totalResults: 300,
  results: [
    { metadata: { identifier: [`HORIZON-T-${n}`], title: [`Topic ${n}`], status: ['31094502'] } },
  ],
});

function answerEveryPage() {
  return vi.fn((url: string) => {
    const n = Number(new URL(url).searchParams.get('pageNumber'));
    return Promise.resolve(Response.json(page(n)));
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SEDIA search startPage', () => {
  test('startPage 3 with maxPages 1 asks SEDIA for page 3 only', async () => {
    const fetchMock = answerEveryPage();
    vi.stubGlobal('fetch', fetchMock);

    const result = await new SediaAdapter().searchSedia({ startPage: 3, maxPages: 1, pageSize: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(url.searchParams.get('pageNumber')).toBe('3');
    expect(result.topics.map((t) => t.identifier)).toEqual(['HORIZON-T-3']);
    expect(result.pageNumber).toBe(3);
    expect(result.totalResults).toBe(300);
  });

  test('startPage 2 with maxPages 2 reads pages 2 and 3', async () => {
    const fetchMock = answerEveryPage();
    vi.stubGlobal('fetch', fetchMock);

    const result = await new SediaAdapter().searchSedia({ startPage: 2, maxPages: 2, pageSize: 1 });

    expect(result.topics.map((t) => t.identifier)).toEqual(['HORIZON-T-2', 'HORIZON-T-3']);
    expect(result.pageNumber).toBe(2);
  });

  test('without startPage the search still starts at page 1', async () => {
    const fetchMock = answerEveryPage();
    vi.stubGlobal('fetch', fetchMock);

    const result = await new SediaAdapter().searchSedia({ maxPages: 1, pageSize: 1 });

    expect(result.topics.map((t) => t.identifier)).toEqual(['HORIZON-T-1']);
    expect(result.pageNumber).toBe(1);
  });

  // FO-42 QA: without a sort SEDIA reordered the same query between requests.
  test('every search sends the stable sort', async () => {
    const fetchMock = vi.fn((_url: string, _init: RequestInit) => Promise.resolve(Response.json(page(1))));
    vi.stubGlobal('fetch', fetchMock);

    await new SediaAdapter().searchSedia({ startPage: 2, maxPages: 1, pageSize: 1 });

    const body = fetchMock.mock.calls[0]![1].body as FormData;
    const sort = body.get('sort');
    expect(sort).toBeInstanceOf(Blob);
    expect(JSON.parse(await (sort as Blob).text())).toEqual(SEDIA_STABLE_SORT);
    expect(SEDIA_STABLE_SORT).toEqual({ field: 'identifier', order: 'ASC' });
  });

  // Mock SEDIA that, like the live one, reorders the hits on every request
  // unless a sort is sent. Two separate requests for page 1 and page 2 must
  // then never share a topic.
  test('page 1 and page 2 of separate requests do not overlap', async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `HORIZON-T-${String(i).padStart(2, '0')}`);
    let call = 0;
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      const params = new URL(url).searchParams;
      const size = Number(params.get('pageSize'));
      const n = Number(params.get('pageNumber'));
      const sort = (init.body as FormData).get('sort');
      call++;
      const order = sort instanceof Blob ? [...ids].sort() : [...ids.slice(call % 12), ...ids.slice(0, call % 12)];
      return Response.json({
        totalResults: ids.length,
        results: order.slice((n - 1) * size, n * size).map((id) => ({
          metadata: { identifier: [id], title: [id], status: ['31094502'] },
        })),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new SediaAdapter();
    const p1 = await adapter.searchSedia({ startPage: 1, maxPages: 1, pageSize: 5 });
    const p2 = await adapter.searchSedia({ startPage: 2, maxPages: 1, pageSize: 5 });
    const p2Again = await adapter.searchSedia({ startPage: 2, maxPages: 1, pageSize: 5 });

    const first = p1.topics.map((t) => t.identifier);
    const second = p2.topics.map((t) => t.identifier);
    expect(first).toHaveLength(5);
    expect(second).toHaveLength(5);
    expect(first.filter((id) => second.includes(id))).toEqual([]);
    expect(p2Again.topics.map((t) => t.identifier)).toEqual(second);
  });
});
