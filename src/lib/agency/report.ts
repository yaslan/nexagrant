/**
 * Agency region report (TASK-MULRR08Y9YI77, FB KAMU B3; docs/kamu/OKA-KANAL-ONERISI.md §4).
 *
 * The report makes no number of its own. It is the dashboard's published,
 * already safe output — {@link buildAgencyFunnel}: one cumulative cohort,
 * masking under 5 with complementary suppression, every number rounded to 5 —
 * copied once a month and formatted as a printable page and a CSV.
 *
 *   - One read: {@link readAgencyFunnelRaw}, the dashboard's own query path.
 *   - Three views, each a response the dashboard gives for one breakdown:
 *     none, organisation type, one province. They are masked together
 *     (suppressedCells covers every breakdown at once), and the attacker in
 *     funnel.attack.test.ts already joins exactly these views. No
 *     province × type table.
 *   - Provinces: only those where the dashboard shows at least one number.
 *     A province whose every step is "<5" is left out; on the dashboard that
 *     row looks the same whether the province has organisations or none, so
 *     listing it would tell which provinces hold a few (see
 *     {@link buildAgencyReport}).
 *
 * Storage (leed-fb 29.09, option A): no report table exists and the schema is
 * locked, so the snapshot is an `AuditEvent` of the agency's own tenant —
 * `type = agency.report.generated`, `target = YYYY-MM`, `data` = the snapshot.
 * The printable page and the CSV are rendered from it at download time, so a
 * stored report can hold only what {@link AgencyReportSnapshotSchema} admits:
 * cell states and multiples of 5, no tenant id, no name, no raw count.
 * A real PDF file in R2 is later work (option C, a separate approval).
 */
import { z } from 'zod';
import type { OrgType } from '@prisma/client';
import { prisma, withTenant, type TenantTx } from '@/lib/db';
import { withBrand } from '@/lib/brand';
import { generateTableReportHtml, toCsv, type ExportLocale } from '@/lib/document-exporter';
import { TR_PROVINCES } from '@/lib/readiness/provinces';
import {
  buildAgencyFunnel,
  FUNNEL_STEPS,
  normalizeProvinces,
  ORG_TYPES,
  readAgencyFunnelRaw,
  SMALL_CELL_THRESHOLD,
  type FunnelView,
  type RawByProvince,
} from './funnel';
import trMessages from '../../../messages/tr.json';
import enMessages from '../../../messages/en.json';

export const AGENCY_REPORT_EVENT = 'agency.report.generated';
export const AGENCY_REPORT_VERSION = 1;

const CellSchema = z.discriminatedUnion('state', [
  z
    .object({
      state: z.literal('count'),
      // What roundToFive gives for a shown count: a multiple of 5, never under 5.
      value: z
        .number()
        .int()
        .min(SMALL_CELL_THRESHOLD)
        .refine((v) => v % SMALL_CELL_THRESHOLD === 0),
    })
    .strict(),
  z.object({ state: z.literal('small') }).strict(),
  z.object({ state: z.literal('unmeasured') }).strict(),
]);

const ViewSchema = z
  .object(Object.fromEntries(FUNNEL_STEPS.map((s) => [s, CellSchema])) as Record<(typeof FUNNEL_STEPS)[number], typeof CellSchema>)
  .strict();

/** The stored snapshot. Strict: a key it does not name is refused, not carried. */
export const AgencyReportSnapshotSchema = z
  .object({
    version: z.literal(AGENCY_REPORT_VERSION),
    period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    generatedAt: z.iso.datetime(),
    all: ViewSchema,
    byOrgType: z
      .object(Object.fromEntries(ORG_TYPES.map((t) => [t, ViewSchema])) as Record<OrgType, typeof ViewSchema>)
      .strict(),
    byProvince: z.array(z.object({ province: z.enum(TR_PROVINCES), view: ViewSchema }).strict()),
  })
  .strict();

export type AgencyReportSnapshot = z.infer<typeof AgencyReportSnapshotSchema>;

const shows = (v: FunnelView) => Object.values(v).some((c) => c.state === 'count');

/**
 * Pure: the report of one agency's raw counts. Every view is a
 * {@link buildAgencyFunnel} response, unchanged.
 */
export function buildAgencyReport(raw: RawByProvince, period: string, generatedAt: Date): AgencyReportSnapshot {
  const byType = buildAgencyFunnel(raw, { dimension: 'orgType' });
  if (byType.breakdown.dimension !== 'orgType') throw new Error('no type breakdown');
  // A province not in the table is all "<5" (buildAgencyFunnel, `known = false`), so walking
  // only the provinces that occur, in TR_PROVINCES order, finds every province that shows a number.
  const present = normalizeProvinces(raw);
  const byProvince: AgencyReportSnapshot['byProvince'] = [];
  for (const province of TR_PROVINCES) {
    if (!present.has(province)) continue;
    const f = buildAgencyFunnel(raw, { dimension: 'province', province });
    if (f.breakdown.dimension !== 'province') throw new Error('no province breakdown');
    if (shows(f.breakdown.view)) byProvince.push({ province, view: f.breakdown.view });
  }
  return AgencyReportSnapshotSchema.parse({
    version: AGENCY_REPORT_VERSION,
    period,
    generatedAt: generatedAt.toISOString(),
    all: byType.all,
    byOrgType: byType.breakdown.byOrgType,
    byProvince,
  });
}

/** The month a run on `now` reports: the day before, in UTC — a run on 1 October closes September. */
export function reportPeriod(now: Date): string {
  const d = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export interface AgencyReportRunResult {
  agencies: number;
  generated: number;
  skipped: number;
  failed: number;
  errors: { tenantId: string; message: string }[];
}

/**
 * The monthly run: one snapshot per live agency and period. A period that
 * already has a report is skipped, so a retried or re-triggered run adds none.
 */
export async function generateAgencyReports(
  now: Date,
  deps: {
    agencies?: () => Promise<{ id: string }[]>;
    readRaw?: typeof readAgencyFunnelRaw;
  } = {}
): Promise<AgencyReportRunResult> {
  const period = reportPeriod(now);
  // `Tenant` is the table the scope is derived from (not under RLS), the same fan-out as
  // credits-monthly-grant.ts: which agencies exist is this query's output.
  const agencies =
    (await deps.agencies?.()) ??
    (await prisma.tenant.findMany({ where: { kind: 'AGENCY', deletedAt: null }, select: { id: true } }));
  const readRaw = deps.readRaw ?? readAgencyFunnelRaw;
  const out: AgencyReportRunResult = { agencies: agencies.length, generated: 0, skipped: 0, failed: 0, errors: [] };

  for (const { id: tenantId } of agencies) {
    try {
      const snapshot = buildAgencyReport(await readRaw(tenantId), period, now);
      const wrote = await withTenant(tenantId, async (tx) => {
        const existing = await tx.auditEvent.findFirst({
          where: { tenantId, type: AGENCY_REPORT_EVENT, target: period },
          select: { id: true },
        });
        if (existing) return false;
        // tenantId is always the agency's own tenant, never NULL.
        await tx.auditEvent.create({ data: { tenantId, type: AGENCY_REPORT_EVENT, target: period, data: snapshot } });
        return true;
      });
      if (wrote) out.generated++;
      else out.skipped++;
    } catch (e) {
      out.failed++;
      out.errors.push({ tenantId, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}

export interface AgencyReportListItem {
  id: string;
  period: string;
  generatedAt: Date;
}

/** The agency's own reports, newest first. `tx` is `withTenant(agencyTenantId)`. */
export async function listAgencyReportsIn(tx: TenantTx, agencyTenantId: string): Promise<AgencyReportListItem[]> {
  const rows = await tx.auditEvent.findMany({
    where: { tenantId: agencyTenantId, type: AGENCY_REPORT_EVENT },
    orderBy: { createdAt: 'desc' },
    take: 36,
    select: { id: true, target: true, createdAt: true },
  });
  return rows.map((r) => ({ id: r.id, period: r.target ?? '', generatedAt: r.createdAt }));
}

/** One stored report of the agency, validated; null when there is none or it does not validate. */
export async function readAgencyReportIn(
  tx: TenantTx,
  agencyTenantId: string,
  reportId: string
): Promise<AgencyReportSnapshot | null> {
  const row = await tx.auditEvent.findFirst({
    where: { id: reportId, tenantId: agencyTenantId, type: AGENCY_REPORT_EVENT },
    select: { data: true },
  });
  if (!row) return null;
  const parsed = AgencyReportSnapshotSchema.safeParse(row.data);
  return parsed.success ? parsed.data : null;
}

// ───────────────────────── formatting ─────────────────────────

const CATALOGS = { tr: trMessages.agency, en: enMessages.agency };

function catalog(locale?: ExportLocale) {
  return CATALOGS[locale === 'en' ? 'en' : 'tr'];
}

type Catalog = ReturnType<typeof catalog>;

function cellText(c: FunnelView[keyof FunnelView], A: Catalog): string {
  if (c.state === 'count') return String(c.value);
  return c.state === 'small' ? A.reports.doc.small : A.reports.doc.unmeasured;
}

/** The three tables: (caption, [group label, view][]), in the order they are printed. */
function tables(s: AgencyReportSnapshot, A: Catalog) {
  const D = A.reports.doc;
  return [
    { key: 'all', caption: D.totalsTable, groups: [[D.totalsTable, s.all]] as [string, FunnelView][] },
    {
      key: 'orgType',
      caption: D.orgTypeTable,
      groups: ORG_TYPES.map((t): [string, FunnelView] => [A.orgType[t], s.byOrgType[t]]),
    },
    {
      key: 'province',
      caption: D.provinceTable,
      groups: s.byProvince.map((p): [string, FunnelView] => [p.province, p.view]),
    },
  ];
}

function dateText(iso: string, locale?: ExportLocale): string {
  return new Date(iso).toLocaleDateString(locale === 'en' ? 'en-GB' : 'tr-TR', { timeZone: 'Europe/Istanbul' });
}

/** Printable page (the browser's print dialog saves it as PDF). */
export function agencyReportHtml(s: AgencyReportSnapshot, agencyName: string, locale?: ExportLocale): string {
  const A = catalog(locale);
  const D = A.reports.doc;
  const steps = FUNNEL_STEPS.map((st) => A.funnel.steps[st].title);
  return generateTableReportHtml({
    locale,
    title: D.title,
    orgName: agencyName,
    meta: [
      { label: D.periodLabel, value: s.period },
      { label: D.generatedAtLabel, value: dateText(s.generatedAt, locale) },
    ],
    notes: [D.cohortNote, D.separateNote, A.funnel.privacyNote, D.printHint],
    tables: tables(s, A).map((t) => ({
      caption: t.caption,
      note:
        t.key !== 'province' ? undefined : t.groups.length === 0 ? D.provinceNone : D.provinceOmitted,
      columns: [D.groupColumn, ...steps],
      rows: t.groups.map(([label, view]) => [label, ...FUNNEL_STEPS.map((st) => cellText(view[st], A))]),
    })),
    footer: withBrand(D.footer),
  });
}

/** CSV, one row per (table, group, step): the same cells as the printable page. */
export function agencyReportCsv(s: AgencyReportSnapshot, locale?: ExportLocale): string {
  const A = catalog(locale);
  const D = A.reports.doc;
  const rows: (string | number)[][] = [[D.csvPeriod, D.csvTable, D.csvGroup, D.csvStep, D.csvValue]];
  for (const t of tables(s, A)) {
    for (const [label, view] of t.groups) {
      for (const st of FUNNEL_STEPS) {
        const c = view[st];
        rows.push([s.period, t.caption, label, A.funnel.steps[st].title, c.state === 'count' ? c.value : cellText(c, A)]);
      }
    }
  }
  return toCsv(rows);
}
