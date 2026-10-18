/**
 * FO-42 — the calls page sends ?page, and the route passes it on as
 * `startPage`. The adapter must read from that page, not from page 1, and
 * report the page it actually read.
 */
import { afterEach, describe, expect, test, vi } from 'vitest';
import { SediaAdapter } from '@/lib/adapters/sedia';

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
});
