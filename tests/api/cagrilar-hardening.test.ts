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
  session: { ok: true } as { ok: boolean },
  searchSedia: vi.fn(),
  translate: vi.fn(async <T,>(topics: T[]) => topics),
  topicUpsert: vi.fn(),
}));

vi.mock('@/lib/tenant', async () => {
  const { NextResponse } = await import('next/server');
  return {
    requireTenantApi: vi.fn(async () =>
      mocks.session.ok
        ? { ok: true, scope: { tenantId: 't-1', userId: 'u-1', role: 'MEMBER' } }
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

import { GET } from '@/app/api/cagrilar/route';

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

beforeEach(() => {
  mocks.session.ok = true;
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
    expect(mocks.searchSedia.mock.calls[0]![0]).toMatchObject({ pageSize: 50, maxPages: 5 });
  });

  // İNCELEME-70 D-1 (TASK-MUNVVMJDEO932): the lower bound had no test, so a
  // negative page size could reach SEDIA and every test stayed green.
  test.each(['0', '-1', '-50'])('limit=%s is raised to a page size of 1', async (limit) => {
    const res = await get(`?limit=${limit}&lang=en`);
    expect(res.status).toBe(200);
    expect(mocks.searchSedia).toHaveBeenCalledTimes(1);
    expect(mocks.searchSedia.mock.calls[0]![0]).toMatchObject({ pageSize: 1, maxPages: 5 });
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
});
