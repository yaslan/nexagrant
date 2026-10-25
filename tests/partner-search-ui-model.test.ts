import { describe, expect, it, vi } from 'vitest';

import type { PartnerSearchAnnouncementDto } from '@/core/contracts/partner-search';
import { createBadgeLoader, scopedLoader } from '@/modules/m1/ui/partner-search/badge-loader';
import {
  DEFAULT_FILTERS,
  announcementSearch,
  canLoadMore,
  keywordSnapshot,
  orgTypeKey,
  quotaSpent,
  readAnnouncement,
  readListResponse,
  readQuota,
  readSignal,
  topCountries,
  topicPortalUrl,
  withinWeek,
} from '@/modules/m1/ui/partner-search/model';

const NOW = new Date('2026-10-25T12:00:00Z');

function row(over: Partial<PartnerSearchAnnouncementDto> = {}): PartnerSearchAnnouncementDto {
  return {
    id: 'a1',
    topicIdentifier: 'HORIZON-CL4-2026-01',
    callIdentifier: null,
    type: 'EXPERTISE_REQUEST',
    description: null,
    publishedAt: '2026-10-24T08:00:00Z',
    lastSeenAt: '2026-10-25T02:00:00Z',
    organization: { pic: null, name: 'Org', type: 'REC', isSme: false, country: 'DE', city: null },
    keywords: [],
    programmeCodes: [],
    ...over,
  };
}

describe('Partner Search UI model (FO-62)', () => {
  it('defaults to "Expertise request" with TR-only and this-week off', () => {
    expect(DEFAULT_FILTERS).toMatchObject({ type: 'EXPERTISE_REQUEST', trOnly: false, thisWeekOnly: false });
    expect(announcementSearch(DEFAULT_FILTERS, 1, 'HORIZON-X')).toBe('topic=HORIZON-X&type=EXPERTISE_REQUEST&page=1');
  });

  it('TR-only wins over a typed country; a malformed country is left out; q is trimmed', () => {
    const s = new URLSearchParams(
      announcementSearch({ ...DEFAULT_FILTERS, type: '', country: 'de', trOnly: true, q: '  hydrogen ' }, 2)
    );
    expect(s.get('country')).toBe('TR');
    expect(s.get('q')).toBe('hydrogen');
    expect(s.get('page')).toBe('2');
    expect(s.has('type')).toBe(false);
    expect(new URLSearchParams(announcementSearch({ ...DEFAULT_FILTERS, country: 'Germany' }, 1)).has('country')).toBe(
      false
    );
  });

  it('this week = last seven days; undated rows are out', () => {
    expect(withinWeek('2026-10-19T12:00:00Z', NOW)).toBe(true);
    expect(withinWeek('2026-10-18T11:59:59Z', NOW)).toBe(false);
    expect(withinWeek(null, NOW)).toBe(false);
    expect(withinWeek('not a date', NOW)).toBe(false);
  });

  it('stops paging once the newest-first list has left the week', () => {
    const fresh = [row({ publishedAt: '2026-10-24T00:00:00Z' })];
    const stale = [row({ publishedAt: '2026-09-01T00:00:00Z' })];
    expect(canLoadMore(fresh, 40, true, NOW)).toBe(true);
    expect(canLoadMore(stale, 40, true, NOW)).toBe(false);
    expect(canLoadMore(stale, 40, false, NOW)).toBe(true);
    expect(canLoadMore(fresh, 1, false, NOW)).toBe(false);
  });

  it('links to the topic page on the portal, never to a message form of ours', () => {
    expect(topicPortalUrl('HORIZON-CL4-2026-RESILIENCE-01-12')).toBe(
      'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/horizon-cl4-2026-resilience-01-12'
    );
  });

  it('reads the four answers of a list endpoint', () => {
    const page = { success: true, meta: { page: 1, pageSize: 20, total: 0 }, data: [] };
    expect(readListResponse(200, page).kind).toBe('ok');
    const quota = { limit: 10, used: 10, remaining: 0, month: '2026-10', resetsAt: '2026-11-01T00:00:00.000Z' };
    expect(readListResponse(429, { error: 'PARTNER_SEARCH_QUOTA_EXCEEDED', quota })).toEqual({ kind: 'quota', quota });
    expect(
      readListResponse(403, { error: 'MODULE_ACCESS_DENIED', module: 'M1', reason: 'PLAN_UPGRADE_REQUIRED', requiredPlans: ['Pro', 1] })
    ).toEqual({ kind: 'denied', reason: 'PLAN_UPGRADE_REQUIRED', requiredPlans: ['Pro'] });
    expect(readListResponse(500, null).kind).toBe('error');
    expect(readListResponse(200, { success: false }).kind).toBe('error');
    expect(quotaSpent(quota)).toBe(true);
    expect(quotaSpent({ ...quota, used: 3, remaining: 7 })).toBe(false);
    expect(quotaSpent(undefined)).toBe(false);
  });

  it('keyword snapshot: most frequent first, case-insensitive merge', () => {
    const rows = [row({ keywords: ['Hydrogen', 'AI'] }), row({ keywords: ['hydrogen', ' ', 'Batteries'] })];
    expect(keywordSnapshot(rows)).toEqual(['Hydrogen', 'AI', 'Batteries']);
  });

  it('top countries by count, ties alphabetical', () => {
    expect(topCountries({ TR: 3, DE: 5, BE: 3, FR: 1 })).toEqual([
      { country: 'DE', count: 5 },
      { country: 'BE', count: 3 },
      { country: 'TR', count: 3 },
    ]);
  });
});

describe('reading FO-61 answers defensively (FO-62 review Ö1)', () => {
  const QUOTA = { limit: 10, used: 3, remaining: 7, month: '2026-10', resetsAt: '2026-11-01T00:00:00.000Z' };
  const envelope = (data: unknown[], meta: Record<string, unknown> = {}) => ({
    success: true,
    meta: { page: 1, pageSize: 20, total: data.length, ...meta },
    data,
  });

  it('a well-formed row comes through unchanged', () => {
    const good = row();
    expect(readAnnouncement(good)).toEqual(good);
    const result = readListResponse(200, envelope([good], { quota: QUOTA }));
    expect(result).toEqual({ kind: 'ok', page: envelope([good], { quota: QUOTA }) });
  });

  it('drops rows a card cannot render, keeps the rest', () => {
    const renamedOrg = { ...row({ id: 'renamed' }), organization: undefined, org: row().organization };
    const nameless = row({ id: 'nameless', organization: { ...row().organization, name: 42 as unknown as string } });
    const unknownType = { ...row({ id: 'unknown-type' }), type: 'EXPERTISE_SWAP' };
    const noId = { ...row(), id: undefined };
    const result = readListResponse(200, envelope([renamedOrg, nameless, row({ id: 'ok' }), unknownType, noId, null, 'x']));
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.page.data.map((a) => a.id)).toEqual(['ok']);
    // The server's total stays the figure on screen.
    expect(result.page.meta.total).toBe(7);
  });

  it('empties optional fields of another shape instead of failing the row', () => {
    const odd = {
      ...row(),
      description: { html: '<b>x</b>' },
      publishedAt: 'yesterday',
      keywords: ['Hydrogen', 7, null],
      programmeCodes: 'HORIZON',
      organization: { name: 'Org', pic: 906200001, type: 'PRV', isSme: 'yes', country: 7, city: null },
    };
    expect(readAnnouncement(odd)).toMatchObject({
      description: null,
      publishedAt: null,
      keywords: ['Hydrogen'],
      programmeCodes: [],
      organization: { name: 'Org', pic: null, type: 'PRV', isSme: false, country: null, city: null },
    });
  });

  it('an organisation type the UI does not know reads as `unknown`', () => {
    expect(orgTypeKey('HES')).toBe('HES');
    expect(orgTypeKey('OTH')).toBe('OTH');
    expect(orgTypeKey('PRV')).toBe('unknown');
    expect(orgTypeKey('')).toBe('unknown');
  });

  it('a 200 without a numeric total is an error, not a list', () => {
    expect(readListResponse(200, { success: true, meta: {}, data: [] }).kind).toBe('error');
    expect(readListResponse(200, { success: true, meta: { total: '3' }, data: [] }).kind).toBe('error');
  });

  it('a malformed quota on a 200 is left out; an unreadable reset date becomes ""', () => {
    const noFigures = readListResponse(200, envelope([], { quota: { remaining: 0 } }));
    expect(noFigures.kind === 'ok' && noFigures.page.meta.quota).toBe(undefined);

    const badDate = readListResponse(200, envelope([], { quota: { limit: 10, used: 10, resetsAt: 'soon' } }));
    expect(badDate.kind === 'ok' && badDate.page.meta.quota).toEqual({
      limit: 10,
      used: 10,
      remaining: 0, // limit − used when `remaining` is missing: the "spent" notice still shows
      month: '',
      resetsAt: '',
    });
    expect(quotaSpent(readQuota({ limit: 10, used: 10, resetsAt: 'soon' }))).toBe(true);
    expect(readQuota({ ...QUOTA, limit: -1 })).toBe(undefined);
    expect(readQuota(null)).toBe(undefined);
  });

  it('a 429 without a readable quota is an error (no figure to print)', () => {
    expect(readListResponse(429, { quota: { limit: 10 } }).kind).toBe('error');
    expect(readListResponse(429, { quota: { limit: 10, used: 10 } })).toMatchObject({
      kind: 'quota',
      quota: { limit: 10, used: 10, remaining: 0 },
    });
  });

  it('partner signal: counts must be numbers; odd per-country entries are left out', () => {
    const data = { total: 14, requests: 9, offers: 5, trCount: 3, byCountry: { DE: 5, TR: 3 }, byOrgType: { HES: 1 } };
    expect(readSignal({ data })).toEqual(data);
    expect(readSignal({ data: { ...data, byCountry: { DE: 5, XX: 'many' } } })?.byCountry).toEqual({ DE: 5 });
    expect(readSignal({ data: { ...data, byCountry: undefined } })?.byCountry).toEqual({});
    expect(readSignal({ data: { ...data, total: undefined } })).toBe(null);
    expect(readSignal({ signal: data })).toBe(null);
    expect(readSignal(null)).toBe(null);
  });
});

describe('badge loader (FO-62)', () => {
  it('asks for every PIC once and caches it', async () => {
    const fetchBadge = vi.fn(async (pic: string) => (pic === '999999999' ? 0 : 2));
    const loader = createBadgeLoader(fetchBadge, 2);
    const results = await Promise.all(['111111111', '222222222', '999999999', '111111111'].map((p) => loader.load(p)));
    expect(results).toEqual([2, 2, 0, 2]);
    expect(fetchBadge).toHaveBeenCalledTimes(3);
  });

  it('never runs more than `concurrency` requests at once', async () => {
    let inFlight = 0;
    let peak = 0;
    const fetchBadge = vi.fn(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return 1;
    });
    const loader = createBadgeLoader(fetchBadge, 3);
    const pics = Array.from({ length: 10 }, (_, i) => String(100000000 + i));
    expect(await Promise.all(pics.map((p) => loader.load(p)))).toEqual(pics.map(() => 1));
    expect(peak).toBe(3);
    expect(fetchBadge).toHaveBeenCalledTimes(10);
  });

  it('a failed request hides that badge only; it is not retried within the page', async () => {
    const fetchBadge = vi
      .fn<(pic: string) => Promise<number | null>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(1);
    const loader = createBadgeLoader(fetchBadge);
    expect(await Promise.all([loader.load('111111111'), loader.load('222222222')])).toEqual([null, 1]);
    expect(await loader.load('111111111')).toBe(null);
    expect(fetchBadge).toHaveBeenCalledTimes(2);
  });

  it('a new workspace gets a fresh loader: nothing cached in one carries into the next', async () => {
    const make = vi.fn(() => createBadgeLoader(async () => 1));
    const loaderFor = scopedLoader(make);
    const a = loaderFor('ws-a');
    expect(loaderFor('ws-a')).toBe(a);
    const b = loaderFor('ws-b');
    expect(b).not.toBe(a);
    expect(loaderFor('ws-a')).not.toBe(a);
    expect(make).toHaveBeenCalledTimes(3);
  });
});
