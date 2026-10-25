/**
 * Partner Search API core (FO-61 / PS-K3, TASK-MVCH2R3VSLAJN).
 *
 * Everything the routes under src/app/api/{partner-search,organizations,topics}
 * and their /api/v1 twins share: the query schema, the Prisma filter, the row →
 * DTO mapping, the topic signal, the export file and the monthly quota of a
 * metered plan. The pure parts take no database handle and are unit tested
 * (tests/partner-search-api.test.ts); the two reads and the quota take the
 * caller's transaction.
 *
 * Contract types: src/core/contracts/partner-search.ts.
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import type {
  PartnerSearchAnnouncementDto,
  PartnerSearchAnnouncementQuery,
  PartnerSearchDenyReason,
  PartnerSearchExportJson,
  PartnerSearchExportSource,
  PartnerSearchOrgType,
  PartnerSearchQuotaState,
  PartnerSignal,
} from '@/core/contracts/partner-search';
import type { PartnerSearchGrant } from '@/lib/billing/catalog';
import { csvCell } from '@/lib/csv-cell';
import type { TenantTx } from '@/lib/db';
import { asRole, can, type Action } from '@/lib/rbac';
import type { ModuleAccessResult } from '@/lib/modules/tenant-access';

import { maskContact } from './mask';

/** Rows per page of the list endpoints. */
export const PARTNER_SEARCH_PAGE_SIZE = 20;

/**
 * Rows per export file. A safety bound on one response, not a plan figure: the
 * whole announcement table is a few thousand rows (~118 per busy topic).
 */
export const PARTNER_SEARCH_EXPORT_MAX_ROWS = 10_000;

export const PARTNER_SEARCH_ACTION: Action = 'view_partner_search';

const ORG_TYPES = ['HES', 'REC', 'PRC', 'PUB', 'OTH'] as const satisfies readonly PartnerSearchOrgType[];

const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optionalText = (max: number) => z.preprocess(blankToUndefined, z.string().trim().min(1).max(max).optional());

export const partnerSearchQuerySchema = z.object({
  topic: optionalText(200),
  country: z.preprocess(
    blankToUndefined,
    z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/)
      .transform((c) => c.toUpperCase())
      .optional()
  ),
  type: z.preprocess(
    (v) => (typeof v === 'string' ? blankToUndefined(v.trim().toUpperCase()) : v),
    z.enum(['EXPERTISE_REQUEST', 'EXPERTISE_OFFER']).optional()
  ),
  orgType: z.preprocess(
    (v) => (typeof v === 'string' ? blankToUndefined(v.trim().toUpperCase()) : v),
    z.enum(ORG_TYPES).optional()
  ),
  q: optionalText(200),
  page: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(10_000).default(1)),
}) satisfies z.ZodType<PartnerSearchAnnouncementQuery, unknown>;

/** The fields of `partnerSearchQuerySchema`, read from a URL. Unknown parameters are ignored. */
export function parsePartnerSearchQuery(params: URLSearchParams) {
  const raw: Record<string, string> = {};
  for (const key of ['topic', 'country', 'type', 'orgType', 'q', 'page'] as const) {
    const value = params.get(key);
    if (value !== null) raw[key] = value;
  }
  return partnerSearchQuerySchema.safeParse(raw);
}

/** `PIC` path segment: CORDIS PICs are 9 digits; anything else cannot match a row. */
export const picSchema = z.string().regex(/^\d{6,12}$/);

/** `Topic.identifier` path segment. */
export const topicIdentifierSchema = z.string().trim().min(3).max(200).regex(/^[A-Za-z0-9._-]+$/);

type AnnouncementFilter = Omit<PartnerSearchAnnouncementQuery, 'page'> & { pic?: string };

/**
 * The Prisma `where` of a list. Withdrawn announcements are never listed
 * (`withdrawnAt: null` is unconditional), and a filter that was not given is
 * absent rather than `undefined`, so no key silently drops out.
 */
export function announcementWhere(filter: AnnouncementFilter): Record<string, unknown> {
  const where: Record<string, unknown> = { withdrawnAt: null };
  if (filter.topic !== undefined) where.topicIdentifier = filter.topic;
  if (filter.country !== undefined) where.country = filter.country;
  if (filter.type !== undefined) where.type = filter.type;
  if (filter.orgType !== undefined) where.organizationType = filter.orgType;
  if (filter.pic !== undefined) where.organizationPic = filter.pic;
  if (filter.q !== undefined) {
    where.OR = [
      { organizationName: { contains: filter.q, mode: 'insensitive' } },
      { description: { contains: filter.q, mode: 'insensitive' } },
    ];
  }
  return where;
}

/** Newest first; rows without a publication date after dated ones; id breaks ties so pages are stable. */
export const ANNOUNCEMENT_ORDER = [{ publishedAt: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }] as const;

export const ANNOUNCEMENT_SELECT = {
  id: true,
  topicIdentifier: true,
  callIdentifier: true,
  type: true,
  description: true,
  publishedAt: true,
  lastSeenAt: true,
  organizationPic: true,
  organizationName: true,
  organizationType: true,
  isSme: true,
  country: true,
  city: true,
  keywords: true,
  programmeCodes: true,
} as const;

export interface AnnouncementRow {
  id: string;
  topicIdentifier: string;
  callIdentifier: string | null;
  type: 'EXPERTISE_REQUEST' | 'EXPERTISE_OFFER';
  description: string | null;
  publishedAt: Date | null;
  lastSeenAt: Date;
  organizationPic: string | null;
  organizationName: string;
  organizationType: PartnerSearchOrgType;
  isSme: boolean;
  country: string | null;
  city: string | null;
  keywords: unknown;
  programmeCodes: unknown;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * Row → DTO. The summary goes through `maskContact` again although the ingestor
 * masked it before storage (FO-65 F3): a row written before that change, or by
 * a later writer that forgets, must not reach a response or a file unmasked.
 * Masking is idempotent (`[email]` contains no address), so the second pass costs
 * nothing on masked text.
 */
export function toAnnouncementDto(row: AnnouncementRow): PartnerSearchAnnouncementDto {
  return {
    id: row.id,
    topicIdentifier: row.topicIdentifier,
    callIdentifier: row.callIdentifier,
    type: row.type,
    description: maskContact(row.description),
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    lastSeenAt: row.lastSeenAt.toISOString(),
    organization: {
      pic: row.organizationPic,
      name: row.organizationName,
      type: row.organizationType,
      isSme: row.isSme,
      country: row.country,
      city: row.city,
    },
    keywords: stringList(row.keywords),
    programmeCodes: stringList(row.programmeCodes),
  };
}

/** One page of announcements and the total, inside the caller's transaction. */
export async function readAnnouncementPage(
  tx: TenantTx,
  filter: AnnouncementFilter,
  page: number
): Promise<{ total: number; rows: AnnouncementRow[] }> {
  const where = announcementWhere(filter);
  const [total, rows] = await Promise.all([
    tx.partnerSearchAnnouncement.count({ where }),
    tx.partnerSearchAnnouncement.findMany({
      where,
      orderBy: [...ANNOUNCEMENT_ORDER],
      skip: (page - 1) * PARTNER_SEARCH_PAGE_SIZE,
      take: PARTNER_SEARCH_PAGE_SIZE,
      select: ANNOUNCEMENT_SELECT,
    }),
  ]);
  return { total, rows: rows as AnnouncementRow[] };
}

// ───────────────────────────── Topic signal ─────────────────────────────

export interface SignalRow {
  type: 'EXPERTISE_REQUEST' | 'EXPERTISE_OFFER';
  country: string | null;
  organizationType: PartnerSearchOrgType;
}

/** Aggregate of one topic's live announcements. Pure: the caller filters out withdrawn rows. */
export function computePartnerSignal(rows: readonly SignalRow[]): PartnerSignal {
  const byOrgType = Object.fromEntries(ORG_TYPES.map((t) => [t, 0])) as Record<PartnerSearchOrgType, number>;
  const byCountry: Record<string, number> = {};
  let requests = 0;
  let offers = 0;
  let trCount = 0;

  for (const row of rows) {
    if (row.type === 'EXPERTISE_REQUEST') requests += 1;
    else offers += 1;
    byOrgType[row.organizationType] += 1;
    if (row.country) {
      const country = row.country.toUpperCase();
      byCountry[country] = (byCountry[country] ?? 0) + 1;
      if (country === 'TR') trCount += 1;
    }
  }

  return { total: rows.length, requests, offers, byCountry, byOrgType, trCount };
}

export async function readPartnerSignal(tx: TenantTx, topicIdentifier: string): Promise<PartnerSignal> {
  const rows = await tx.partnerSearchAnnouncement.findMany({
    where: { topicIdentifier, withdrawnAt: null },
    select: { type: true, country: true, organizationType: true },
  });
  return computePartnerSignal(rows as SignalRow[]);
}

// ───────────────────────────── Export ─────────────────────────────

export const PARTNER_SEARCH_SOURCE_URL =
  'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/how-to-participate/partner-search';
export const CC_BY_4_URL = 'https://creativecommons.org/licenses/by/4.0/';

/** Latest `lastSeenAt` of the rows: when the portal last showed what the file holds. */
export function exportFetchedAt(rows: readonly { lastSeenAt: string }[]): string | null {
  let latest: string | null = null;
  for (const row of rows) if (latest === null || row.lastSeenAt > latest) latest = row.lastSeenAt;
  return latest;
}

export function exportSource(rows: readonly PartnerSearchAnnouncementDto[]): PartnerSearchExportSource {
  const fetchedAt = exportFetchedAt(rows);
  return {
    name: 'EU Funding & Tenders Portal',
    url: PARTNER_SEARCH_SOURCE_URL,
    fetchedAt,
    license: 'CC BY 4.0',
    licenseUrl: CC_BY_4_URL,
    notice: `Source: EU Funding & Tenders Portal, fetched ${fetchedAt ?? 'n/a'}. © European Union, licensed under CC BY 4.0 (${CC_BY_4_URL}). Contact details in summaries are masked.`,
  };
}

export function toExportJson(
  rows: readonly PartnerSearchAnnouncementDto[],
  now: Date,
  truncated = false
): PartnerSearchExportJson {
  return { source: exportSource(rows), exportedAt: now.toISOString(), count: rows.length, truncated, data: [...rows] };
}

const CSV_COLUMNS = [
  'id',
  'topicIdentifier',
  'callIdentifier',
  'type',
  'organizationName',
  'organizationPic',
  'organizationType',
  'isSme',
  'country',
  'city',
  'publishedAt',
  'lastSeenAt',
  'keywords',
  'programmeCodes',
  'description',
] as const;

/**
 * CSV with the attribution on its first two lines (`#` comment rows, which
 * spreadsheets show as text), a third `#` line when the export stopped at
 * {@link PARTNER_SEARCH_EXPORT_MAX_ROWS}, then a header row. Every text cell
 * goes through the shared `csvCell`, so a summary cannot open a formula.
 */
export function toExportCsv(rows: readonly PartnerSearchAnnouncementDto[], truncated = false): string {
  const source = exportSource(rows);
  const lines = [
    csvCell(`# Source: EU Funding & Tenders Portal, fetched ${source.fetchedAt ?? 'n/a'} (${source.url})`),
    csvCell(`# License: CC BY 4.0 (${source.licenseUrl}). © European Union. Contact details in summaries are masked.`),
  ];
  if (truncated) {
    lines.push(csvCell(`# Truncated: only the first ${rows.length} matching rows. Narrow the filters to export the rest.`));
  }
  lines.push(CSV_COLUMNS.join(','));
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.topicIdentifier,
        r.callIdentifier,
        r.type,
        r.organization.name,
        r.organization.pic,
        r.organization.type,
        r.organization.isSme ? 'true' : 'false',
        r.organization.country,
        r.organization.city,
        r.publishedAt,
        r.lastSeenAt,
        r.keywords.join('; '),
        r.programmeCodes.join('; '),
        r.description,
      ]
        .map((v) => csvCell(v))
        .join(',')
    );
  }
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * The rows of an export, at most {@link PARTNER_SEARCH_EXPORT_MAX_ROWS}. One row
 * more is read to tell a file that holds every match from one that was cut, so
 * the file can say so (`truncated`).
 */
export async function readAnnouncementsForExport(
  tx: TenantTx,
  filter: AnnouncementFilter
): Promise<{ rows: AnnouncementRow[]; truncated: boolean }> {
  const rows = (await tx.partnerSearchAnnouncement.findMany({
    where: announcementWhere(filter),
    orderBy: [...ANNOUNCEMENT_ORDER],
    take: PARTNER_SEARCH_EXPORT_MAX_ROWS + 1,
    select: ANNOUNCEMENT_SELECT,
  })) as AnnouncementRow[];
  const truncated = rows.length > PARTNER_SEARCH_EXPORT_MAX_ROWS;
  return { rows: truncated ? rows.slice(0, PARTNER_SEARCH_EXPORT_MAX_ROWS) : rows, truncated };
}

// ───────────────────────────── Access and quota ─────────────────────────────

/**
 * Who asks. A member is checked against the role table; an API key holds no
 * membership role, and what it may read is decided by the key itself (issued by
 * a tenant admin) and the M1 gate in `authenticateApiKey`.
 */
export type PartnerSearchActor = { kind: 'member'; role: string } | { kind: 'apiKey' };

export type PartnerSearchAccess =
  | { allowed: true; quota: number | null; export: boolean }
  | { allowed: false; reason: PartnerSearchDenyReason; requiredPlans?: string[] };

/**
 * Who may read Partner Search, from three facts the caller already holds:
 * the role (`can`), the M1 module decision (`decideModuleAccess`, which is
 * plan *and* `ModuleState`) and the plan's Partner Search grant (catalogue).
 *
 *  - M1 open → allowed; `quota` is the plan's monthly figure or null (unlimited).
 *  - M1 refused only because the plan lacks it, and the plan meters Partner
 *    Search (Discover, Basic) → allowed with that quota. `ModuleState` cannot
 *    say anything here: a tenant cannot switch on a module it does not own.
 *  - Any other M1 refusal (switched off, DEV, PILOT audience, coming soon) is
 *    the module gate's answer and stands.
 */
export function decidePartnerSearchAccess(
  actor: PartnerSearchActor,
  m1: ModuleAccessResult,
  grant: PartnerSearchGrant
): PartnerSearchAccess {
  if (actor.kind === 'member' && !can(asRole(actor.role), PARTNER_SEARCH_ACTION)) {
    return { allowed: false, reason: 'ROLE_FORBIDDEN' };
  }
  if (m1.allowed) {
    return { allowed: true, quota: grant.queriesMonthly, export: grant.export };
  }
  if (m1.reason === 'PLAN_UPGRADE_REQUIRED' && grant.queriesMonthly !== null && grant.queriesMonthly > 0) {
    return { allowed: true, quota: grant.queriesMonthly, export: false };
  }
  return {
    allowed: false,
    reason: m1.reason ?? 'MODULE_OFF',
    ...(m1.requiredPlans ? { requiredPlans: m1.requiredPlans } : {}),
  };
}

/** 'YYYY-MM' of `now` in UTC — the quota row's key. */
export function quotaMonth(now: Date): string {
  return now.toISOString().slice(0, 7);
}

/** First instant of the UTC month after `now`. */
export function quotaResetsAt(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

export function quotaState(limit: number, used: number, now: Date): PartnerSearchQuotaState {
  return {
    limit,
    used,
    remaining: Math.max(0, limit - used),
    month: quotaMonth(now),
    resetsAt: quotaResetsAt(now).toISOString(),
  };
}

/**
 * Count one query against the tenant's month, or refuse it.
 *
 * One statement does both: the upsert only increments while `count < limit`,
 * and returns no row when the month is already spent. Two concurrent requests
 * serialise on the (tenantId, month) row, so neither can read "9" and both
 * write "10" — the eleventh query of the month is refused however the requests
 * interleave. Runs inside `withTenant` (strict tenant_isolation RLS), in the
 * same transaction as the read it pays for, so a failed read gives the count back.
 */
export async function consumePartnerSearchQuery(
  tx: TenantTx,
  tenantId: string,
  limit: number,
  now: Date
): Promise<{ ok: true; used: number } | { ok: false; used: number }> {
  const month = quotaMonth(now);
  const rows = await tx.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "PartnerSearchQuotaUsage" ("id", "tenantId", "month", "count", "updatedAt")
    VALUES (${randomUUID()}, ${tenantId}, ${month}, 1, ${now})
    ON CONFLICT ("tenantId", "month") DO UPDATE
      SET "count" = "PartnerSearchQuotaUsage"."count" + 1, "updatedAt" = ${now}
      WHERE "PartnerSearchQuotaUsage"."count" < ${limit}
    RETURNING "count"`;
  const row = rows[0];
  return row ? { ok: true, used: Number(row.count) } : { ok: false, used: limit };
}
