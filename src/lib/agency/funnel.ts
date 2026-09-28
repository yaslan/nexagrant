/**
 * Agency funnel — the aggregation layer behind the agency dashboard
 * (TASK-MULRQSJFB8RWJ, FB KAMU B2; docs/kamu/OKA-KANAL-ONERISI.md §4).
 *
 * What an agency may see is fixed by docs/legal/agency-channel-notice-addendum.md:
 * counts of organisations, never an organisation. So:
 *
 *   - Steps 1, 3, 4, 5 come from `public.agency_funnel_counts(since)`
 *     (prisma/migrations/add-agency-funnel.sql), a SECURITY DEFINER function
 *     that takes the agency from the caller's `app.tenant_id` and returns five
 *     integers per organisation type. No tenant row leaves it.
 *   - Steps 6 and 7 (applications, outcomes) come from be-fb's
 *     `countApplicationOutcomes` (B7), which TRUSTS the tenant list it is given.
 *     The list is derived here, on the server, from `Tenant.agencyId` of the
 *     session's own agency tenant — never from a parameter a browser can set.
 *   - Step 2 (readiness card completed) has no data yet (B6) and is reported as
 *     `unmeasured`, never as a number.
 *
 * Every number then goes through the small-cell rule (§3.1): a cell under 5 is
 * sent as `small` ("<5"), and a second cell is suppressed where the first could
 * be recovered from the total. Masking happens here, so the browser never
 * receives a count under 5.
 */
import type { OrgType } from '@prisma/client';
import { prisma, withTenant } from '@/lib/db';
import { countApplicationOutcomes } from '@/lib/k5-pipeline/applicationOutcome';

/** docs/legal/agency-channel-notice-addendum.md §3.1 (HUKUK-5): one threshold for B2 and B3. */
export const SMALL_CELL_THRESHOLD = 5;

export const FUNNEL_WINDOWS = [30, 90] as const;
export type FunnelWindow = (typeof FUNNEL_WINDOWS)[number];

export const ORG_TYPES: readonly OrgType[] = [
  'MUNICIPALITY',
  'PUBLIC',
  'SME',
  'LARGE',
  'UNIVERSITY',
  'RESEARCH',
  'NGO',
  'CONSULTANCY',
  'CLUSTER',
];

export const FUNNEL_STEPS = [
  'registered',
  'readiness',
  'savedSearch',
  'pipeline',
  'conceptNote',
  'submitted',
  'accepted',
  'rejected',
] as const;
export type FunnelStep = (typeof FUNNEL_STEPS)[number];

/** Steps with no data source yet. Shown as "not measured yet", never as 0. */
const UNMEASURED: ReadonlySet<FunnelStep> = new Set<FunnelStep>(['readiness']);

export type FunnelCell =
  | { state: 'count'; value: number }
  | { state: 'small' }
  | { state: 'unmeasured' };

export type FunnelView = Record<FunnelStep, FunnelCell>;

export interface AgencyFunnel {
  windowDays: FunnelWindow;
  /** Funnel over every organisation type. */
  all: FunnelView;
  /** Funnel for one organisation type. Every type is present, masked alike. */
  byOrgType: Record<OrgType, FunnelView>;
}

type RawCounts = Record<Exclude<FunnelStep, 'readiness'>, number>;
const MEASURED_STEPS = FUNNEL_STEPS.filter((s) => !UNMEASURED.has(s)) as Exclude<FunnelStep, 'readiness'>[];

export class NotAnAgencyError extends Error {
  readonly code = 'NOT_AN_AGENCY';
  constructor() {
    super('Only a member of an agency tenant can read an agency funnel');
    this.name = 'NotAnAgencyError';
  }
}

export function isFunnelWindow(value: unknown): value is FunnelWindow {
  return FUNNEL_WINDOWS.includes(Number(value) as FunnelWindow);
}

export function sinceFor(windowDays: FunnelWindow, now: Date = new Date()): Date {
  return new Date(now.getTime() - windowDays * 86_400_000);
}

function cell(value: number, masked: boolean): FunnelCell {
  return masked ? { state: 'small' } : { state: 'count', value };
}

/**
 * The small-cell rule for one step across organisation types.
 *
 * Primary: every type cell under the threshold is masked (0 included, so "<5"
 * does not tell "none" from "a few").
 * Secondary: the total over all types is shown when it is not small, and a
 * reader can subtract the visible cells from it. If what is left — the true sum
 * of the masked cells — is 1..4, it would reveal a small group, so the smallest
 * visible cell is masked as well, and again until the hidden sum reaches the
 * threshold or no visible cell remains.
 */
export function maskStep(
  perType: Record<OrgType, number>
): { total: FunnelCell; byType: Record<OrgType, FunnelCell> } {
  const total = ORG_TYPES.reduce((n, t) => n + perType[t], 0);
  const masked = new Set<OrgType>(ORG_TYPES.filter((t) => perType[t] < SMALL_CELL_THRESHOLD));
  const hiddenSum = () => ORG_TYPES.filter((t) => masked.has(t)).reduce((n, t) => n + perType[t], 0);
  while (hiddenSum() > 0 && hiddenSum() < SMALL_CELL_THRESHOLD) {
    const visible = ORG_TYPES.filter((t) => !masked.has(t)).sort((a, b) => perType[a] - perType[b]);
    if (visible.length === 0) break;
    masked.add(visible[0]!);
  }
  const byType = Object.fromEntries(ORG_TYPES.map((t) => [t, cell(perType[t], masked.has(t))])) as Record<
    OrgType,
    FunnelCell
  >;
  return { total: cell(total, total < SMALL_CELL_THRESHOLD), byType };
}

/** Pure: raw per-type counts in, the masked view out. Exported for tests. */
export function buildFunnel(windowDays: FunnelWindow, raw: Record<OrgType, RawCounts>): AgencyFunnel {
  const emptyView = (): FunnelView =>
    Object.fromEntries(FUNNEL_STEPS.map((s) => [s, { state: 'unmeasured' } as FunnelCell])) as FunnelView;
  const all = emptyView();
  const byOrgType = Object.fromEntries(ORG_TYPES.map((t) => [t, emptyView()])) as Record<OrgType, FunnelView>;

  for (const step of MEASURED_STEPS) {
    const perType = Object.fromEntries(ORG_TYPES.map((t) => [t, raw[t][step]])) as Record<OrgType, number>;
    const { total, byType } = maskStep(perType);
    all[step] = total;
    for (const t of ORG_TYPES) byOrgType[t][step] = byType[t];
  }
  // A group under the threshold shows no step at all, not even one that
  // happens to be masked by secondary suppression elsewhere.
  for (const t of ORG_TYPES) {
    if (byOrgType[t].registered.state !== 'count') {
      for (const step of MEASURED_STEPS) byOrgType[t][step] = { state: 'small' };
    }
  }
  if (all.registered.state !== 'count') {
    for (const step of MEASURED_STEPS) all[step] = { state: 'small' };
  }
  return { windowDays, all, byOrgType };
}

function zeroCounts(): RawCounts {
  return Object.fromEntries(MEASURED_STEPS.map((s) => [s, 0])) as RawCounts;
}

interface FunnelRow {
  org_type: string;
  registered: number;
  saved_search: number;
  pipeline: number;
  concept_note: number;
}

/**
 * Reads and masks the funnel for `agencyTenantId`, which MUST be the session's
 * own tenant (the page passes `requireTenantPage(...).tenantId`). Throws
 * {@link NotAnAgencyError} when that tenant is not a live agency.
 *
 * `outcomes` is injectable for tests; production uses be-fb's B7 function.
 */
export async function getAgencyFunnel(
  agencyTenantId: string,
  windowDays: FunnelWindow,
  deps: {
    now?: Date;
    outcomes?: typeof countApplicationOutcomes;
  } = {}
): Promise<AgencyFunnel> {
  const since = sinceFor(windowDays, deps.now);
  // Tenant is a system-wide table (not under RLS); the id is the session's own.
  const agency = await prisma.tenant.findUnique({
    where: { id: agencyTenantId },
    select: { kind: true, deletedAt: true },
  });
  if (!agency || agency.kind !== 'AGENCY' || agency.deletedAt) throw new NotAnAgencyError();

  const raw = Object.fromEntries(ORG_TYPES.map((t) => [t, zeroCounts()])) as Record<OrgType, RawCounts>;

  // Steps 1, 3, 4, 5: counted inside the database, in the agency's own scope.
  const rows = await withTenant(agencyTenantId, (tx) =>
    tx.$queryRaw<FunnelRow[]>`SELECT * FROM public.agency_funnel_counts(${since}::timestamp)`
  );
  for (const r of rows) {
    const t = r.org_type as OrgType;
    if (!raw[t]) continue;
    raw[t].registered = r.registered;
    raw[t].savedSearch = r.saved_search;
    raw[t].pipeline = r.pipeline;
    raw[t].conceptNote = r.concept_note;
  }

  // Steps 6, 7: the cohort's ids, derived here from the agency link — the only
  // list countApplicationOutcomes is ever given. Ids stay on the server.
  const cohort = await prisma.tenant.findMany({
    where: { agencyId: agencyTenantId, deletedAt: null, createdAt: { gte: since } },
    select: { id: true, orgType: true },
  });
  const outcomes = deps.outcomes ?? countApplicationOutcomes;
  for (const t of ORG_TYPES) {
    const ids = cohort.filter((c) => c.orgType === t).map((c) => c.id);
    if (ids.length === 0) continue;
    // No `since`: the window picks the cohort (registered in it); everything
    // that cohort has applied for counts, so the steps describe one group.
    const o = await outcomes(ids);
    raw[t].submitted = o.submitted;
    raw[t].accepted = o.accepted;
    raw[t].rejected = o.rejected;
  }

  return buildFunnel(windowDays, raw);
}

/** Session gate for the page: is this tenant a live agency? */
export async function isAgencyTenant(tenantId: string): Promise<boolean> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { kind: true, deletedAt: true } });
  return Boolean(t && t.kind === 'AGENCY' && !t.deletedAt);
}
