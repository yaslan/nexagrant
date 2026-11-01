/**
 * FO-204 — GET /api/cagrilar remembers the English SEDIA page for the same
 * question. A repeat search must not call SEDIA again, identical searches that
 * arrive together share one SEDIA call, and a translation failure never freezes
 * the list in English for later visitors.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  searchSedia: vi.fn(),
  translate: vi.fn(),
}));

vi.mock('@/lib/tenant', () => ({
  requireTenantApi: vi.fn(async () => ({
    ok: true,
    scope: { tenantId: 't-1', userId: 'cache-user', role: 'MEMBER' },
  })),
}));
vi.mock('@/lib/adapters/sedia', () => ({
  SediaAdapter: class {
    searchSedia = mocks.searchSedia;
  },
}));
vi.mock('@/lib/translation', () => ({ translateTopicsBatch: mocks.translate }));

import { GET } from '@/app/api/cagrilar/route';
import { cagrilarCache } from '@/lib/cagrilar-cache';

const TOPIC = {
  identifier: 'HORIZON-CL5-2027-03-D5-06',
  title: 'Clean energy',
  status: 'OPEN',
  deadlines: [],
  sourceUrl: 'https://example.test',
};
const ok = (errors: string[] = []) => ({
  totalResults: 1,
  pageNumber: 1,
  pageSize: 20,
  topics: [TOPIC],
  schemaDrift: [],
  errors,
});

function get(query: string) {
  return GET(new NextRequest(`http://localhost/api/cagrilar${query}`));
}

beforeEach(() => {
  cagrilarCache.clear();
  mocks.searchSedia.mockReset();
  mocks.translate.mockReset();
  mocks.translate.mockImplementation(async (topics: unknown[]) => ({ items: topics, untranslated: 0 }));
});

describe('GET /api/cagrilar cache', () => {
  test('a repeat of the same search does not call SEDIA again', async () => {
    mocks.searchSedia.mockResolvedValue(ok());
    const q = '?q=cache-repeat&lang=tr';

    const first = await (await get(q)).json();
    const second = await (await get(q)).json();

    expect(mocks.searchSedia).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    expect(second.topics).toHaveLength(1);
  });

  test('another language is a different answer and is fetched again', async () => {
    mocks.searchSedia.mockResolvedValue(ok());
    await get('?q=cache-lang&lang=tr');
    await get('?q=cache-lang&lang=en');
    expect(mocks.searchSedia).toHaveBeenCalledTimes(2);
  });

  test('spelling and order of the same question give one entry (B-2)', async () => {
    mocks.searchSedia.mockResolvedValue(ok());
    await get('?q=Health&lang=tr&status=OPEN,FORTHCOMING');
    await get('?q=%20health%20&lang=tr&status=forthcoming,open');

    expect(mocks.searchSedia).toHaveBeenCalledTimes(1);
  });

  test('identical searches that arrive together share one SEDIA call (B-3)', async () => {
    let finish: () => void = () => {};
    mocks.searchSedia.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(ok());
        })
    );
    const q = '?q=cache-stampede&lang=en';

    const a = get(q);
    const b = get(q);
    await vi.waitFor(() => expect(mocks.searchSedia).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 10));
    finish();

    expect((await a).status).toBe(200);
    expect((await b).status).toBe(200);
    expect(mocks.searchSedia).toHaveBeenCalledTimes(1);
  });

  test('a visitor who leaves does not fail the others waiting on the same search (A-1)', async () => {
    // Like the real adapter: an aborted call comes back empty with an error, not thrown.
    let finish: () => void = () => {};
    mocks.searchSedia.mockImplementation(
      (opts: { signal?: AbortSignal }) =>
        new Promise((resolve) => {
          finish = () => resolve(ok());
          opts.signal?.addEventListener('abort', () =>
            resolve({ ...ok(), topics: [], errors: ['aborted'] })
          );
        })
    );
    const q = '?q=cache-leaves&lang=en';
    const leaving = new AbortController();

    const first = GET(new NextRequest(`http://localhost/api/cagrilar${q}`, { signal: leaving.signal }));
    const second = get(q);
    await vi.waitFor(() => expect(mocks.searchSedia).toHaveBeenCalledTimes(1));
    leaving.abort();
    await new Promise((r) => setTimeout(r, 10));
    finish();

    const answer = await second;
    expect(answer.status).toBe(200);
    expect((await answer.json()).topics).toHaveLength(1);
    await first;
    expect(mocks.searchSedia).toHaveBeenCalledTimes(1);
  });

  test('a search that failed in flight is not kept: the next visit asks SEDIA again (A-2)', async () => {
    mocks.searchSedia.mockRejectedValueOnce(new Error('sedia down')).mockResolvedValueOnce(ok());
    const q = '?q=cache-failed-flight&lang=en';

    expect((await get(q)).status).not.toBe(200);
    expect((await get(q)).status).toBe(200);
    expect(mocks.searchSedia).toHaveBeenCalledTimes(2);
  });

  test('a SEDIA page with an error is served but not remembered', async () => {
    mocks.searchSedia.mockResolvedValue(ok(['Page 1 fetch error: boom']));
    const q = '?q=cache-partial&lang=en';

    expect((await (await get(q)).json()).topics).toHaveLength(1);
    await get(q);

    expect(mocks.searchSedia).toHaveBeenCalledTimes(2);
  });
});

describe('GET /api/cagrilar when translation fails', () => {
  test('a list that could not be translated says so, and the next visit translates again', async () => {
    mocks.searchSedia.mockResolvedValue(ok());
    mocks.translate.mockImplementation(async (topics: unknown[]) => ({ items: topics, untranslated: 1 }));
    const q = '?q=cache-quota&lang=tr';

    const first = await (await get(q)).json();
    const second = await (await get(q)).json();

    expect(first.translated).toBe(false);
    expect(first.topics[0].title).toBe('Clean energy');
    expect(second.translated).toBe(false);
    // The English SEDIA page is what stays in memory; translation runs again each time.
    expect(mocks.searchSedia).toHaveBeenCalledTimes(1);
    expect(mocks.translate).toHaveBeenCalledTimes(2);
  });

  test('once translation works again the next visit comes back in Turkish', async () => {
    mocks.searchSedia.mockResolvedValue(ok());
    mocks.translate
      .mockImplementationOnce(async (topics: unknown[]) => ({ items: topics, untranslated: 1 }))
      .mockImplementationOnce(async (topics: Array<{ title: string }>) => ({
        items: topics.map((t) => ({ ...t, title: `TR ${t.title}` })),
        untranslated: 0,
      }));
    const q = '?q=cache-recover&lang=tr';

    expect((await (await get(q)).json()).translated).toBe(false);
    const body = await (await get(q)).json();

    expect(body.translated).toBe(true);
    expect(body.topics[0].title).toBe('TR Clean energy');
  });
});
