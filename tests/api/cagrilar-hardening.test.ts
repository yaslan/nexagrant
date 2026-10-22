/**
 * TASK-MUN80XIW5NPV1 (security scan TASK-MUN66T2HM4A4E O-1, O-2) — GET /api/cagrilar.
 *
 * The route used to answer anonymous callers, pass any `limit` to SEDIA (times
 * five pages, times two translation calls per title), upsert the first ten
 * topics into the shared Topic table on every request, and return the raw error
 * message in its 500 body. Each test below pins one of those fixes.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  session: { ok: true, userId: 'u-1' } as { ok: boolean; userId: string },
  searchSedia: vi.fn(),
  translate: vi.fn(async <T,>(topics: T[]) => topics),
  topicUpsert: vi.fn(),
}));

vi.mock('@/lib/tenant', async () => {
  const { NextResponse } = await import('next/server');
  return {
    requireTenantApi: vi.fn(async () =>
      mocks.session.ok
        ? { ok: true, scope: { tenantId: 't-1', userId: mocks.session.userId, role: 'MEMBER' } }
        : { ok: false, response: NextResponse.json({ code: 'TENANT_SCOPE_REQUIRED' }, { status: 401 }) }
    ),
  };
});
vi.mock('@/lib/adapters/sedia', () => ({
  SediaAdapter: class {
    searchSedia = mocks.searchSedia;
  },
}));
vi.mock('@/lib/translation', () => ({ translateTopicsBatch: mocks.translate }));
vi.mock('@/lib/db', () => ({ prisma: { topic: { upsert: mocks.topicUpsert } } }));

import { GET, CAGRILAR_PER_USER_PER_MINUTE } from '@/app/api/cagrilar/route';

const TOPIC = {
  identifier: 'HORIZON-CL5-2027-03-D5-06',
  title: 'Topic',
  status: 'OPEN',
  deadlines: [],
  sourceUrl: 'https://example.test',
};

function get(query = '') {
  return GET(new NextRequest(`http://localhost/api/cagrilar${query}`));
}

let testNo = 0;

beforeEach(() => {
  mocks.session.ok = true;
  // A user per test, so the per-user limit below never leaks between tests.
  mocks.session.userId = `u-${++testNo}`;
  mocks.searchSedia.mockReset().mockResolvedValue({ totalResults: 1, pageNumber: 1, pageSize: 20, topics: [TOPIC] });
  mocks.translate.mockClear();
  mocks.topicUpsert.mockReset().mockResolvedValue({});
});

describe('/api/cagrilar hardening', () => {
  test('an anonymous caller gets 401 and SEDIA is never called', async () => {
    mocks.session.ok = false;
    const res = await get('?limit=1000');
    expect(res.status).toBe(401);
    expect(mocks.searchSedia).not.toHaveBeenCalled();
  });

  test('a member gets 200 and limit=1000 is clamped to 50 per SEDIA page', async () => {
    const res = await get('?limit=1000&lang=tr');
    expect(res.status).toBe(200);
    expect(mocks.searchSedia).toHaveBeenCalledTimes(1);
    expect(mocks.searchSedia.mock.calls[0]![0]).toMatchObject({ pageSize: 50, startPage: 1, maxPages: 1 });
  });

  // FO-42: the UI sends ?page and the route used to read page 1 five times over.
  // Each request now asks SEDIA for exactly the page it was given.
  test('?page=2 asks SEDIA for page 2 only and returns that page', async () => {
    const res = await get('?page=2&limit=20&lang=en');
    expect(res.status).toBe(200);
    expect(mocks.searchSedia).toHaveBeenCalledTimes(1);
    expect(mocks.searchSedia.mock.calls[0]![0]).toMatchObject({ startPage: 2, pageSize: 20, maxPages: 1 });
  });

  test('without ?page the first page is read', async () => {
    await get('?lang=en');
    expect(mocks.searchSedia.mock.calls[0]![0]).toMatchObject({ startPage: 1, maxPages: 1 });
  });

  // Spellings of a number that z.coerce.number() used to take: one page, many URLs.
  test.each(['0', '-3', '1.5', 'abc', '', '1001', ' 2 ', '2.0', '1e1', '0x2', '02', '+2'])(
    'page=%j is a 400 before any outbound call',
    async (page) => {
      const res = await get(`?page=${encodeURIComponent(page)}&lang=en`);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ success: false, error: 'invalid_page' });
      expect(mocks.searchSedia).not.toHaveBeenCalled();
    }
  );

  // FO-42 QA: the top of the range was only tested from the outside (1001).
  test('page=1000 is the last accepted page number', async () => {
    const res = await get('?page=1000&limit=10&lang=en');
    expect(res.status).toBe(200);
    expect(mocks.searchSedia.mock.calls[0]![0]).toMatchObject({ startPage: 1000, pageSize: 10 });
  });

  // SEDIA answers 200 with totalResults 0 past its 10 000-hit window; the page
  // would show "0 results". Measured live: 200x50 answers, 201x50 is empty.
  test.each([
    ['1000', '50'],
    ['201', '50'],
    ['1000', '11'],
  ])('page=%s limit=%s is past the SEDIA window: 400, no outbound call', async (page, limit) => {
    const res = await get(`?page=${page}&limit=${limit}&lang=en`);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: 'page_out_of_window' });
    expect(mocks.searchSedia).not.toHaveBeenCalled();
  });

  test('page=200 limit=50 (the last offset inside the window) is read', async () => {
    const res = await get('?page=200&limit=50&lang=en');
    expect(res.status).toBe(200);
    expect(mocks.searchSedia.mock.calls[0]![0]).toMatchObject({ startPage: 200, pageSize: 50 });
  });

  // Past the last page SEDIA answers an empty list with the true total. That is
  // "no more calls", not an error: 200, empty topics, total kept.
  test('a page beyond the last one is 200 with an empty list and the real total', async () => {
    mocks.searchSedia.mockResolvedValue({
      totalResults: 1012,
      pageNumber: 52,
      pageSize: 20,
      topics: [],
      schemaDrift: [],
      errors: [],
    });
    const res = await get('?page=52&limit=20&lang=en');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, totalResults: 1012, topics: [], pageNumber: 52 });
  });

  // İNCELEME-70 D-1 (TASK-MUNVVMJDEO932): the lower bound had no test, so a
  // negative page size could reach SEDIA and every test stayed green.
  test.each(['0', '-1', '-50'])('limit=%s is raised to a page size of 1', async (limit) => {
    const res = await get(`?limit=${limit}&lang=en`);
    expect(res.status).toBe(200);
    expect(mocks.searchSedia).toHaveBeenCalledTimes(1);
    expect(mocks.searchSedia.mock.calls[0]![0]).toMatchObject({ pageSize: 1, maxPages: 1 });
  });

  test('a non-numeric limit is a 400 before any outbound call', async () => {
    const res = await get('?limit=zz');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: 'invalid_limit' });
    expect(mocks.searchSedia).not.toHaveBeenCalled();
  });

  test('a search writes nothing to the Topic table', async () => {
    const res = await get('?lang=en');
    expect(res.status).toBe(200);
    // The old write ran in a detached async block: give it every chance to fire.
    await new Promise((r) => setTimeout(r, 20));
    expect(mocks.topicUpsert).not.toHaveBeenCalled();
    const source = readFileSync(resolve(__dirname, '../../src/app/api/cagrilar/route.ts'), 'utf8');
    expect(source).not.toMatch(/from '@\/lib\/db'/);
  });

  test('a 500 carries a fixed code, never the underlying message', async () => {
    mocks.searchSedia.mockRejectedValue(
      new Error('\nInvalid `prisma.topic.upsert()` invocation: relation "Topic" secret detail')
    );
    const res = await get('?lang=en');
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ success: false, error: 'internal_error' });
    expect(text).not.toMatch(/prisma|Topic|secret/i);
  });

  // İNCELEME-75 D-3 (TASK-MUNY0O53ITDU4): one signed-in client in a loop could
  // spend the shared SEDIA and translation quota for every tenant.
  test('a user over the per-minute limit gets 429 with Retry-After and no outbound call', async () => {
    for (let i = 0; i < CAGRILAR_PER_USER_PER_MINUTE; i++) expect((await get('?lang=en')).status).toBe(200);
    expect(mocks.searchSedia).toHaveBeenCalledTimes(CAGRILAR_PER_USER_PER_MINUTE);

    const res = await get('?lang=en');
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ success: false, error: 'rate_limited' });
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
    expect(mocks.searchSedia).toHaveBeenCalledTimes(CAGRILAR_PER_USER_PER_MINUTE);

    mocks.session.userId = 'someone-else';
    expect((await get('?lang=en')).status).toBe(200);
  });
});
