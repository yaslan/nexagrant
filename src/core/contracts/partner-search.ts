/**
 * Partner Search API contract (FO-61 / PS-K3, TASK-MVCH2R3VSLAJN).
 *
 * Types only: the shapes the M1 partner-search endpoints answer with, for the
 * UI (PS-K4) and M8 (PS-K5) to read without importing module code. The server
 * builds these in src/modules/m1/server/partner-search/api.ts; the zod schema
 * that parses the query string lives there and is checked against
 * `PartnerSearchAnnouncementQuery` at compile time.
 *
 * Endpoints (session, under /api; API key, the same paths under /api/v1):
 *   GET /api/partner-search/announcements           → PartnerSearchAnnouncementPage
 *   GET /api/organizations/:pic/announcements       → PartnerSearchAnnouncementPage
 *   GET /api/topics/:identifier/partner-signal      → PartnerSignalResponse
 *   GET /api/partner-search/announcements/export    → CSV, or PartnerSearchExportJson (session only)
 *
 * Errors: 401 (no session / key), 400 `invalid_query`, 403 `PartnerSearchDenied`,
 * 429 `PartnerSearchQuotaExceeded` (metered plans, list endpoints only).
 */

export type PartnerSearchAnnouncementType = 'EXPERTISE_REQUEST' | 'EXPERTISE_OFFER';

export type PartnerSearchOrgType = 'HES' | 'REC' | 'PRC' | 'PUB' | 'OTH';

/** Query string of the list endpoints. Every field is optional; `page` starts at 1. */
export interface PartnerSearchAnnouncementQuery {
  /** Exact `Topic.identifier`, e.g. HORIZON-CL4-2026-RESILIENCE-01-12. */
  topic?: string;
  /** ISO-3166-1 alpha-2, any case. */
  country?: string;
  type?: PartnerSearchAnnouncementType;
  orgType?: PartnerSearchOrgType;
  /** Free text over organisation name and summary (case-insensitive). */
  q?: string;
  page: number;
}

/** One organisation announcement. Withdrawn announcements are never listed. */
export interface PartnerSearchAnnouncementDto {
  id: string;
  topicIdentifier: string;
  callIdentifier: string | null;
  type: PartnerSearchAnnouncementType;
  /** At most 500 characters; e-mail addresses and phone numbers masked (`[email]`, `[phone]`). */
  description: string | null;
  publishedAt: string | null;
  lastSeenAt: string;
  organization: {
    /** CORDIS PIC when the organisation is matched, otherwise null. */
    pic: string | null;
    name: string;
    type: PartnerSearchOrgType;
    isSme: boolean;
    country: string | null;
    city: string | null;
  };
  keywords: string[];
  programmeCodes: string[];
}

/** Monthly query allowance of a metered plan, as of this response. */
export interface PartnerSearchQuotaState {
  limit: number;
  used: number;
  remaining: number;
  /** 'YYYY-MM', UTC. */
  month: string;
  /** First instant of the next UTC month. */
  resetsAt: string;
}

export interface PartnerSearchAnnouncementPage {
  success: true;
  meta: {
    page: number;
    pageSize: number;
    /** Matching announcements across all pages. */
    total: number;
    /** Present only for a metered plan; absent means unlimited. */
    quota?: PartnerSearchQuotaState;
  };
  data: PartnerSearchAnnouncementDto[];
}

/** Aggregate demand for one topic, from non-withdrawn organisation announcements. */
export interface PartnerSignal {
  total: number;
  requests: number;
  offers: number;
  /** ISO2 → count; announcements without a country are left out. */
  byCountry: Record<string, number>;
  byOrgType: Record<PartnerSearchOrgType, number>;
  /** Announcements from Türkiye (country TR). */
  trCount: number;
}

export interface PartnerSignalResponse {
  success: true;
  topicIdentifier: string;
  data: PartnerSignal;
}

/**
 * Why a request was refused with 403: the module gate's own codes
 * (`ModuleDenyReason` in src/lib/modules/state-machine.ts) plus two of this API.
 */
export type PartnerSearchDenyReason =
  | 'NOT_AUTHENTICATED'
  | 'NO_TENANT'
  | 'MODULE_OFF'
  | 'DEV_INTERNAL_ONLY'
  | 'PILOT_MANAGERS_ONLY'
  | 'PLAN_UPGRADE_REQUIRED'
  | 'COMING_SOON'
  | 'ROLE_FORBIDDEN'
  | 'EXPORT_NOT_IN_PLAN';

export interface PartnerSearchDenied {
  error: 'MODULE_ACCESS_DENIED';
  module: 'M1';
  reason: PartnerSearchDenyReason;
  /** Plan names that include the refused capability, for an upgrade prompt. */
  requiredPlans?: string[];
}

export interface PartnerSearchQuotaExceeded {
  error: 'PARTNER_SEARCH_QUOTA_EXCEEDED';
  quota: PartnerSearchQuotaState;
}

/** Attribution every export carries (EC legal notice: CC BY 4.0, attribution required). */
export interface PartnerSearchExportSource {
  name: 'EU Funding & Tenders Portal';
  url: string;
  /** Latest `lastSeenAt` among the exported rows; null when the export is empty. */
  fetchedAt: string | null;
  license: 'CC BY 4.0';
  licenseUrl: string;
  notice: string;
}

export interface PartnerSearchExportJson {
  source: PartnerSearchExportSource;
  exportedAt: string;
  count: number;
  data: PartnerSearchAnnouncementDto[];
}
