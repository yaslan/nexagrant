/**
 * FO-204 — GET /api/cagrilar reuses an answer for the same question. A repeat
 * search must not call SEDIA or translation again, and a different language is
 * a different question.
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
  mocks.translate.mockImplementation(async (topics: unknown[]) => topics);
});

describe('GET /api/cagrilar cache', () => {
  test('a repeat of the same search is served from memory', async () => {
    mocks.searchSedia.mockResolvedValue(ok());
    const q = '?q=cache-repeat&lang=tr';

    const first = await (await get(q)).json();
    const second = await (await get(q)).json();

    expect(mocks.searchSedia).toHaveBeenCalledTimes(1);
    expect(mocks.translate).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    expect(second.topics).toHaveLength(1);
  });

  test('another language is a different answer and is fetched again', async () => {
    mocks.searchSedia.mockResolvedValue(ok());
    await get('?q=cache-lang&lang=tr');
    await get('?q=cache-lang&lang=en');
    expect(mocks.searchSedia).toHaveBeenCalledTimes(2);
  });
});
