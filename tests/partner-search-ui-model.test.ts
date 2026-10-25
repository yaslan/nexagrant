import { describe, expect, it, vi } from 'vitest';

import type { PartnerSearchAnnouncementDto } from '@/core/contracts/partner-search';
import { createBadgeLoader } from '@/modules/m1/ui/partner-search/badge-loader';
import {
  DEFAULT_FILTERS,
  announcementSearch,
  canLoadMore,
  keywordSnapshot,
  quotaSpent,
  readListResponse,
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

describe('badge loader (FO-62)', () => {
  it('unmetered: every PIC is asked once and cached', async () => {
    const fetchBadge = vi.fn(async (pic: string) => ({ total: pic === '999999999' ? 0 : 2, metered: false }));
    const loader = createBadgeLoader(fetchBadge, 2);
    const results = await Promise.all(['111111111', '222222222', '999999999', '111111111'].map((p) => loader.load(p)));
    expect(results).toEqual([2, 2, 0, 2]);
    expect(fetchBadge).toHaveBeenCalledTimes(3);
  });

  it('metered: spends one probe, then asks for nothing more and shows no badge', async () => {
    const fetchBadge = vi.fn(async () => ({ total: 4, metered: true }));
    const loader = createBadgeLoader(fetchBadge);
    const results = await Promise.all(['111111111', '222222222', '333333333'].map((p) => loader.load(p)));
    expect(results).toEqual([null, null, null]);
    expect(fetchBadge).toHaveBeenCalledTimes(1);
  });

  it('a failed probe does not block the rest', async () => {
    const fetchBadge = vi
      .fn<(pic: string) => Promise<{ total: number; metered: boolean } | null>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ total: 1, metered: false });
    const loader = createBadgeLoader(fetchBadge);
    expect(await Promise.all([loader.load('111111111'), loader.load('222222222')])).toEqual([null, 1]);
  });
});
