/**
 * FO-61 (PS-K3, TASK-MVCH2R3VSLAJN) review B1/B2/B5 — the Partner Search
 * routes, called through their `GET` exports, with the gate wired the way
 * `src/modules/m1/server/partner-search/http.ts` wires it. The decisions
 * themselves (`decidePartnerSearchAccess`, the catalogue terms) are unit tested
 * in tests/partner-search-api.test.ts; this file proves the routes *apply* them:
 *
 *  (a) Pro asking for the export → 403 EXPORT_NOT_IN_PLAN, nothing read;
 *  (b) a metered plan with the month spent → 429 + Retry-After, the page not read;
 *  (c) a read that fails after the quota unit was counted → 500 and the unit
 *      is given back (the count and the read share one transaction);
 *  (d) Pro with M1 switched off → 403 MODULE_OFF on every door;
 *  B2  the topic signal leaves withdrawn announcements out;
 *  B5  an export cut at its row cap says so (JSON `truncated`, CSV `#` line).
 *
 * Only the edges are replaced: the session (`requireTenantApi`), the plan
 * (`getEntitlements`) and the transaction (`withTenant`), which here is a
 * small in-memory transaction — writes are staged and committed only when the
 * callback resolves, the way Postgres treats the real one. The same quota
 * statement against a real database: tests/partner-search-quota.live.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PARTNER_SEARCH_EXPORT_MAX_ROWS, type AnnouncementRow } from '@/modules/m1/server/partner-search/api';

type Plan = 'free' | 'basic' | 'pro' | 'ultra';

type FakeRow = AnnouncementRow & { withdrawnAt: Date | null };

const h = vi.hoisted(() => ({
  tenantId: 'tenant-ps-http',
  role: 'TENANT_OWNER',
  plan: 'pro' as Plan,
  /** M1's ModuleState row; null = no row. */
  m1Status: 'ON' as string | null,
  rows: [] as FakeRow[],
  failRead: false,
  /** Committed quota rows, `${tenantId}|${month}` → count. */
  quota: new Map<string, number>(),
  calls: { reads: 0, quota: 0, findManyWhere: [] as Record<string, unknown>[] },
}));

// NG-250: the NexaGrant plan gate has its own tests (gate.test.ts, bindings.test.ts,
// ng250-plan-gate.live); here it lets every caller on, as before the gate.
vi.mock('@/lib/billing/nexagrant/route-gate', () => ({ ngGateResponse: async () => null, ngGateResponseInTx: async () => null }));
vi.mock('@/lib/tenant', () => ({
  requireTenantApi: async () => ({
    ok: true,
    scope: { tenantId: h.tenantId, userId: 'user-ps-http', role: h.role, workspaceIds: [], isPlatformAdmin: false },
  }),
}));

vi.mock('@/lib/billing', () => ({
  getEntitlements: async () => ({
    planId: h.plan,
    allowedModules: h.plan === 'pro' || h.plan === 'ultra' ? ['M1', 'M2', 'M3', 'M5'] : ['M3', 'M5'],
  }),
}));

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();

  function matches(row: FakeRow, where: Record<string, unknown>): boolean {
    if ('withdrawnAt' in where && where.withdrawnAt === null && row.withdrawnAt !== null) return false;
    if (typeof where.topicIdentifier === 'string' && row.topicIdentifier !== where.topicIdentifier) return false;
    return true;
  }

  return {
    ...actual,
    withTenant: async <T,>(tenantId: string, callback: (tx: never) => Promise<T>): Promise<T> => {
      const staged = new Map(h.quota);
      const tx = {
        moduleState: {
          findUnique: async () => (h.m1Status === null ? null : { status: h.m1Status }),
        },
        partnerSearchAnnouncement: {
          count: async ({ where }: { where: Record<string, unknown> }) => {
            h.calls.reads += 1;
            if (h.failRead) throw new Error('read failed');
            return h.rows.filter((r) => matches(r, where)).length;
          },
          findMany: async ({ where, take }: { where: Record<string, unknown>; take?: number }) => {
            h.calls.reads += 1;
            h.calls.findManyWhere.push(where);
            if (h.failRead) throw new Error('read failed');
            const found = h.rows.filter((r) => matches(r, where));
            return take === undefined ? found : found.slice(0, take);
          },
        },
        // consumePartnerSearchQuery's upsert: values are (id, tenantId, month, now, now, limit).
        $queryRaw: async (_sql: TemplateStringsArray, ...values: unknown[]) => {
          h.calls.quota += 1;
          const [, rowTenant, month, , , limit] = values as [string, string, string, Date, Date, number];
          const key = `${rowTenant}|${month}`;
          const current = staged.get(key);
          if (current === undefined) {
            staged.set(key, 1);
            return [{ count: 1 }];
          }
          if (current < limit) {
            staged.set(key, current + 1);
            return [{ count: current + 1 }];
          }
          return [];
        },
      };
      expect(tenantId).toBe(h.tenantId);
      const result = await callback(tx as never);
      h.quota = staged; // commit only when the callback resolved
      return result;
    },
  };
});

const { GET: listRoute } = await import('@/app/api/partner-search/announcements/route');
const { GET: exportRoute } = await import('@/app/api/partner-search/announcements/export/route');
const { GET: orgRoute } = await import('@/app/api/organizations/[pic]/announcements/route');
const { GET: signalRoute } = await import('@/app/api/topics/[identifier]/partner-signal/route');

const NOW = new Date('2026-10-25T12:00:00Z');
const MONTH_KEY = `${h.tenantId}|2026-10`;
/** Seconds from NOW to 2026-11-01T00:00:00Z. */
const RETRY_AFTER = String((Date.parse('2026-11-01T00:00:00Z') - NOW.getTime()) / 1000);
const TOPIC = 'HORIZON-CL4-2026-RESILIENCE-01-12';

function row(i: number, over: Partial<FakeRow> = {}): FakeRow {
  return {
    id: `a${i}`,
    topicIdentifier: TOPIC,
    callIdentifier: null,
    type: i % 2 === 0 ? 'EXPERTISE_REQUEST' : 'EXPERTISE_OFFER',
    description: null,
    publishedAt: null,
    lastSeenAt: new Date('2026-10-24T00:00:00Z'),
    organizationPic: '999111001',
    organizationName: `Org ${i}`,
    organizationType: 'PRC',
    isSme: false,
    country: 'TR',
    city: null,
    keywords: [],
    programmeCodes: [],
    withdrawnAt: null,
    ...over,
  };
}

const req = (path: string) => new Request(`http://localhost${path}`);
const list = () => listRoute(req('/api/partner-search/announcements'));
const exportAs = (format: 'csv' | 'json') => exportRoute(req(`/api/partner-search/announcements/export?format=${format}`));
const signal = () =>
  signalRoute(req(`/api/topics/${TOPIC}/partner-signal`), { params: Promise.resolve({ identifier: TOPIC }) });
const orgList = () =>
  orgRoute(req('/api/organizations/999111001/announcements'), { params: Promise.resolve({ pic: '999111001' }) });

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  h.role = 'TENANT_OWNER';
  h.plan = 'pro';
  h.m1Status = 'ON';
  h.rows = [row(1), row(2), row(3, { withdrawnAt: new Date('2026-10-20T00:00:00Z') })];
  h.failRead = false;
  h.quota = new Map();
  h.calls = { reads: 0, quota: 0, findManyWhere: [] };
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('(a) export is Ultra only', () => {
  it.each(['csv', 'json'] as const)('Pro asking for %s gets 403 EXPORT_NOT_IN_PLAN and no row is read', async (format) => {
    const res = await exportAs(format);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: 'MODULE_ACCESS_DENIED',
      module: 'M1',
      reason: 'EXPORT_NOT_IN_PLAN',
      requiredPlans: ['Ultra'],
    });
    expect(h.calls.reads).toBe(0);
  });

  it('Basic (metered, no M1) is refused the export too, without spending its quota', async () => {
    h.plan = 'basic';
    const res = await exportAs('csv');
    expect(res.status).toBe(403);
    expect((await res.json()).reason).toBe('EXPORT_NOT_IN_PLAN');
    expect(h.calls.quota).toBe(0);
  });

  it('Ultra gets the file (control: the refusal above is the plan, not the route)', async () => {
    h.plan = 'ultra';
    const res = await exportAs('csv');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect((await res.text()).split('\r\n')[0]).toContain('# Source: EU Funding & Tenders Portal');
  });
});

describe('(b) a metered plan with the month spent', () => {
  it('counts the tenth query, then answers 429 with Retry-After and does not read the page', async () => {
    h.plan = 'free';
    h.quota.set(MONTH_KEY, 9);

    const tenth = await list();
    expect(tenth.status).toBe(200);
    expect((await tenth.json()).meta.quota).toMatchObject({ limit: 10, used: 10, remaining: 0 });
    expect(h.quota.get(MONTH_KEY)).toBe(10);

    const readsBefore = h.calls.reads;
    const eleventh = await list();
    expect(eleventh.status).toBe(429);
    expect(eleventh.headers.get('retry-after')).toBe(RETRY_AFTER);
    expect(await eleventh.json()).toEqual({
      error: 'PARTNER_SEARCH_QUOTA_EXCEEDED',
      quota: { limit: 10, used: 10, remaining: 0, month: '2026-10', resetsAt: '2026-11-01T00:00:00.000Z' },
    });
    expect(h.calls.reads).toBe(readsBefore);
    expect(h.quota.get(MONTH_KEY)).toBe(10);
  });

  it('the organisation list is metered by the same counter', async () => {
    h.plan = 'basic';
    h.quota.set(MONTH_KEY, 10);
    const res = await orgList();
    expect(res.status).toBe(429);
    expect(h.calls.reads).toBe(0);
  });
});

describe('(c) a failed read gives the quota unit back', () => {
  it('500, and the month count is what it was before the request', async () => {
    h.plan = 'free';
    h.quota.set(MONTH_KEY, 4);
    h.failRead = true;

    const res = await list();
    expect(res.status).toBe(500);
    expect(h.calls.quota).toBe(1); // the unit was counted inside the transaction…
    expect(h.quota.get(MONTH_KEY)).toBe(4); // …and rolled back with it

    h.failRead = false;
    expect((await list()).status).toBe(200);
    expect(h.quota.get(MONTH_KEY)).toBe(5);
  });

  it('a first query of the month that fails leaves no row behind', async () => {
    h.plan = 'basic';
    h.failRead = true;
    expect((await list()).status).toBe(500);
    expect(h.quota.has(MONTH_KEY)).toBe(false);
  });
});

describe('(d) Pro with M1 switched off', () => {
  it.each([
    ['list', list],
    ['organisation list', orgList],
    ['topic signal', signal],
    ['export', () => exportAs('csv')],
  ] as const)('%s → 403 MODULE_OFF, nothing read or counted', async (_name, call) => {
    h.m1Status = 'OFF';
    const res = await call();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'MODULE_ACCESS_DENIED', module: 'M1', reason: 'MODULE_OFF' });
    expect(h.calls.reads).toBe(0);
    expect(h.calls.quota).toBe(0);
  });

  it('no ModuleState row reads as OFF', async () => {
    h.m1Status = null;
    expect((await list()).status).toBe(403);
  });
});

describe('B2: withdrawn announcements', () => {
  it('the topic signal counts only live announcements', async () => {
    const res = await signal();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({ total: 2, requests: 1, offers: 1, trCount: 2 });
    expect(h.calls.findManyWhere).toEqual([{ topicIdentifier: TOPIC, withdrawnAt: null }]);
  });

  it('the list leaves them out as well', async () => {
    const body = await (await list()).json();
    expect(body.meta.total).toBe(2);
    expect(body.data.map((d: { id: string }) => d.id)).toEqual(['a1', 'a2']);
  });
});

describe('B5: an export cut at its row cap says so', () => {
  beforeEach(() => {
    h.plan = 'ultra';
  });

  it('JSON: truncated true and count at the cap when more rows match', async () => {
    h.rows = Array.from({ length: PARTNER_SEARCH_EXPORT_MAX_ROWS + 1 }, (_, i) => row(i));
    const body = await (await exportAs('json')).json();
    expect(body.truncated).toBe(true);
    expect(body.count).toBe(PARTNER_SEARCH_EXPORT_MAX_ROWS);
    expect(body.data).toHaveLength(PARTNER_SEARCH_EXPORT_MAX_ROWS);
  });

  it('CSV: a `# Truncated` line before the header when cut, none when not', async () => {
    h.rows = Array.from({ length: PARTNER_SEARCH_EXPORT_MAX_ROWS + 1 }, (_, i) => row(i));
    const cut = (await (await exportAs('csv')).text()).split('\r\n');
    expect(cut[2]).toBe(
      `# Truncated: only the first ${PARTNER_SEARCH_EXPORT_MAX_ROWS} matching rows. Narrow the filters to export the rest.`
    );
    expect(cut[3]?.startsWith('id,topicIdentifier,')).toBe(true);
    expect(cut).toHaveLength(4 + PARTNER_SEARCH_EXPORT_MAX_ROWS + 1);

    h.rows = [row(1), row(2)];
    const whole = (await (await exportAs('csv')).text()).split('\r\n');
    expect(whole.some((l) => l.startsWith('# Truncated'))).toBe(false);
    expect(whole[2]?.startsWith('id,topicIdentifier,')).toBe(true);
  });

  it('JSON: truncated false when every match fits', async () => {
    const body = await (await exportAs('json')).json();
    expect(body).toMatchObject({ count: 2, truncated: false });
  });
});
