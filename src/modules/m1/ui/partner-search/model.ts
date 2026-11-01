/**
 * Pure helpers of the Partner Search UI (FO-62 / PS-K4, TASK-MVCH2YSRRM28N).
 *
 * The components under this folder only read the FO-61 endpoints; everything
 * that decides *what* to ask or *how* to read an answer lives here, so it is
 * unit tested without a browser (tests/partner-search-ui-model.test.ts).
 * Contract: src/core/contracts/partner-search.ts.
 */
import type {
  PartnerSearchAnnouncementDto,
  PartnerSearchAnnouncementPage,
  PartnerSearchAnnouncementType,
  PartnerSearchDenyReason,
  PartnerSearchOrgType,
  PartnerSearchQuotaState,
  PartnerSignal,
} from '@/core/contracts/partner-search';

export const ORG_TYPES = ['HES', 'REC', 'PRC', 'PUB', 'OTH'] as const satisfies readonly PartnerSearchOrgType[];
export const ANNOUNCEMENT_TYPES = [
  'EXPERTISE_REQUEST',
  'EXPERTISE_OFFER',
] as const satisfies readonly PartnerSearchAnnouncementType[];

/** What the filter form holds. `type`/`orgType` '' = any. */
export interface AnnouncementFilters {
  type: PartnerSearchAnnouncementType | '';
  orgType: PartnerSearchOrgType | '';
  /** ISO2 or ''. Ignored while `trOnly` is set. */
  country: string;
  q: string;
  trOnly: boolean;
  thisWeekOnly: boolean;
}

/** Card item 4: "Expertise request" selected; TR-only and this-week are offered, off. */
export const DEFAULT_FILTERS: AnnouncementFilters = {
  type: 'EXPERTISE_REQUEST',
  orgType: '',
  country: '',
  q: '',
  trOnly: false,
  thisWeekOnly: false,
};

/** The list endpoint's query string. `thisWeekOnly` has no API parameter (see `withinWeek`). */
export function announcementSearch(filters: AnnouncementFilters, page: number, topic?: string): string {
  const params = new URLSearchParams();
  if (topic) params.set('topic', topic);
  if (filters.type) params.set('type', filters.type);
  if (filters.orgType) params.set('orgType', filters.orgType);
  const country = filters.trOnly ? 'TR' : filters.country.trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(country)) params.set('country', country);
  const q = filters.q.trim();
  if (q) params.set('q', q.slice(0, 200));
  params.set('page', String(page));
  return params.toString();
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Published in the last seven days (rolling, UTC instants). An undated row is not. */
export function withinWeek(publishedAt: string | null, now: Date): boolean {
  if (!publishedAt) return false;
  const at = Date.parse(publishedAt);
  return Number.isFinite(at) && at >= now.getTime() - WEEK_MS && at <= now.getTime() + WEEK_MS;
}

/**
 * Whether another page is worth asking for. The API sorts newest first with
 * undated rows last, so under "this week only" a page whose last row is already
 * older than a week means every later row is older too — and on a metered plan
 * each page costs a query.
 */
export function canLoadMore(
  rows: readonly PartnerSearchAnnouncementDto[],
  total: number,
  thisWeekOnly: boolean,
  now: Date
): boolean {
  if (rows.length >= total) return false;
  if (!thisWeekOnly) return true;
  const last = rows[rows.length - 1];
  return last !== undefined && withinWeek(last.publishedAt, now);
}

/**
 * The topic page on the portal, whose "Partner search announcements" section
 * lists this announcement with its contact form. We never message anyone.
 */
export function topicPortalUrl(topicIdentifier: string): string {
  return `https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/${encodeURIComponent(
    topicIdentifier.toLowerCase()
  )}`;
}

/** CC BY 4.0 legal text the attribution line links to. */
export const CC_BY_4_URL = 'https://creativecommons.org/licenses/by/4.0/';
export const PORTAL_PARTNER_SEARCH_URL =
  'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/how-to-participate/partner-search';

export type ListResult =
  | { kind: 'ok'; page: PartnerSearchAnnouncementPage }
  | { kind: 'quota'; quota: PartnerSearchQuotaState }
  | { kind: 'denied'; reason: PartnerSearchDenyReason; requiredPlans: string[] }
  | { kind: 'error' };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

function textOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

/** An ISO instant the browser can format, or null: `Intl` throws on an Invalid Date. */
function instantOrNull(v: unknown): string | null {
  return typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null;
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
}

/**
 * A quota as the UI can show it, or undefined. `limit` and `used` are the
 * figures on screen and must be there; `remaining` falls back to their
 * difference, and an unreadable `resetsAt` becomes '' (the reset line is left
 * out) rather than "Invalid Date".
 */
export function readQuota(v: unknown): PartnerSearchQuotaState | undefined {
  if (!isRecord(v) || !isCount(v.limit) || !isCount(v.used)) return undefined;
  return {
    limit: v.limit,
    used: v.used,
    remaining: typeof v.remaining === 'number' && Number.isFinite(v.remaining) ? v.remaining : Math.max(0, v.limit - v.used),
    month: typeof v.month === 'string' ? v.month : '',
    resetsAt: instantOrNull(v.resetsAt) ?? '',
  };
}

/** Organisation type as a message key: a type FO-61 adds later reads as `unknown`. */
export function orgTypeKey(type: string): PartnerSearchOrgType | 'unknown' {
  return (ORG_TYPES as readonly string[]).includes(type) ? (type as PartnerSearchOrgType) : 'unknown';
}

/**
 * One row of a list answer, or null when it lacks what a card renders (id,
 * topic, a known announcement type, an organisation with a name). Optional
 * fields that come back in another shape are emptied instead, so one odd row
 * neither breaks the card nor the list.
 */
export function readAnnouncement(v: unknown): PartnerSearchAnnouncementDto | null {
  if (!isRecord(v) || typeof v.id !== 'string' || typeof v.topicIdentifier !== 'string') return null;
  if (!(ANNOUNCEMENT_TYPES as readonly unknown[]).includes(v.type)) return null;
  const org = v.organization;
  if (!isRecord(org) || typeof org.name !== 'string') return null;
  return {
    id: v.id,
    topicIdentifier: v.topicIdentifier,
    callIdentifier: textOrNull(v.callIdentifier),
    type: v.type as PartnerSearchAnnouncementType,
    description: textOrNull(v.description),
    publishedAt: instantOrNull(v.publishedAt),
    lastSeenAt: typeof v.lastSeenAt === 'string' ? v.lastSeenAt : '',
    organization: {
      pic: textOrNull(org.pic),
      name: org.name,
      // Kept as sent; the card shows an unknown one through `orgTypeKey`.
      type: (typeof org.type === 'string' ? org.type : '') as PartnerSearchOrgType,
      isSme: org.isSme === true,
      country: textOrNull(org.country),
      city: textOrNull(org.city),
    },
    keywords: strings(v.keywords),
    programmeCodes: strings(v.programmeCodes),
  };
}

/** Reads a list response (status + parsed JSON body, or null when it was not JSON). */
export function readListResponse(status: number, body: unknown): ListResult {
  if (status === 200 && isRecord(body) && body.success === true && Array.isArray(body.data) && isRecord(body.meta)) {
    const { meta } = body;
    if (!isCount(meta.total)) return { kind: 'error' };
    const data = body.data.map(readAnnouncement).filter((a): a is PartnerSearchAnnouncementDto => a !== null);
    const quota = readQuota(meta.quota);
    return {
      kind: 'ok',
      page: {
        success: true,
        meta: {
          page: isCount(meta.page) && meta.page >= 1 ? meta.page : 1,
          pageSize: isCount(meta.pageSize) ? meta.pageSize : data.length,
          total: meta.total,
          ...(quota ? { quota } : {}),
        },
        data,
      },
    };
  }
  if (status === 429 && isRecord(body)) {
    const quota = readQuota(body.quota);
    if (quota) return { kind: 'quota', quota };
  }
  if (status === 403 && isRecord(body) && typeof body.reason === 'string') {
    return { kind: 'denied', reason: body.reason as PartnerSearchDenyReason, requiredPlans: strings(body.requiredPlans) };
  }
  return { kind: 'error' };
}

/**
 * The partner-signal answer (`{ data: PartnerSignal }`), or null when the counts
 * the box prints are not numbers. Per-country counts that are not numbers are
 * left out of the country line.
 */
export function readSignal(body: unknown): PartnerSignal | null {
  if (!isRecord(body) || !isRecord(body.data)) return null;
  const d = body.data;
  if (!isCount(d.total) || !isCount(d.requests) || !isCount(d.offers) || !isCount(d.trCount)) return null;
  const counts = (v: unknown): Record<string, number> =>
    isRecord(v) ? Object.fromEntries(Object.entries(v).filter((e): e is [string, number] => isCount(e[1]))) : {};
  return {
    total: d.total,
    requests: d.requests,
    offers: d.offers,
    trCount: d.trCount,
    byCountry: counts(d.byCountry),
    byOrgType: counts(d.byOrgType) as PartnerSignal['byOrgType'],
  };
}

/** The month is spent: after a 429, or when the last allowed query just ran. */
export function quotaSpent(quota: PartnerSearchQuotaState | undefined): boolean {
  return quota !== undefined && quota.remaining <= 0;
}

/**
 * The organisation's keywords across its announcements, most frequent first
 * (ties alphabetical, case kept from the first spelling seen).
 */
export function keywordSnapshot(rows: readonly PartnerSearchAnnouncementDto[], max = 12): string[] {
  const counts = new Map<string, { label: string; n: number }>();
  for (const row of rows) {
    for (const raw of row.keywords) {
      const label = raw.trim();
      if (!label) continue;
      const key = label.toLocaleLowerCase('en');
      const entry = counts.get(key) ?? { label, n: 0 };
      entry.n += 1;
      counts.set(key, entry);
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
    .slice(0, max)
    .map((e) => e.label);
}

/** The two or three countries with most announcements, for the signal line. */
export function topCountries(byCountry: Record<string, number>, max = 3): Array<{ country: string; count: number }> {
  return Object.entries(byCountry)
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country))
    .slice(0, max);
}

/** CORDIS PICs the organisation endpoint accepts (`picSchema` on the server). */
export function isPic(value: string): boolean {
  return /^\d{6,12}$/.test(value);
}
