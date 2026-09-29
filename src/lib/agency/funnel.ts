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
 *
 * Province filter (TASK-MULV3JXS1AW5X): the counts come per organisation type
 * AND Tenant.province from `public.agency_funnel_counts_by_province(since)`
 * (add-agency-funnel-province.sql). Every province view is one request away,
 * so the rule is applied to the whole type × province table at once
 * ({@link maskProvinceTable}), not to the one province asked for.
 */
import type { OrgType } from '@prisma/client';
import { prisma, withTenant } from '@/lib/db';
import { countApplicationOutcomes } from '@/lib/k5-pipeline/applicationOutcome';
import { TR_PROVINCES, type TrProvince } from '@/lib/readiness/provinces';

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
  /** The province the view is limited to; null = every organisation, with or without one. */
  province: TrProvince | null;
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
  return { windowDays, province: null, all, byOrgType };
}

function zeroCounts(): RawCounts {
  return Object.fromEntries(MEASURED_STEPS.map((s) => [s, 0])) as RawCounts;
}

function zeroTable(): Record<OrgType, RawCounts> {
  return Object.fromEntries(ORG_TYPES.map((t) => [t, zeroCounts()])) as Record<OrgType, RawCounts>;
}

/** Organisations that gave no province. Never a view of its own, never shown. */
export const NO_PROVINCE = '';

/** Raw counts per province (TR_PROVINCES name, or {@link NO_PROVINCE}) and type. */
export type RawByProvince = ReadonlyMap<string, Record<OrgType, RawCounts>>;

export function sumProvinces(byProvince: RawByProvince): Record<OrgType, RawCounts> {
  const sum = zeroTable();
  for (const table of byProvince.values()) {
    for (const t of ORG_TYPES) for (const s of MEASURED_STEPS) sum[t][s] += table[t][s];
  }
  return sum;
}

/**
 * The small-cell rule over the type × province table, for every province at once.
 *
 * The published numbers are: the all-province view (row totals per type and
 * the grand total, masked by {@link buildFunnel} and never changed here), and
 * for each province its total and its per-type cells. A reader holding every
 * view can subtract along a row (type total − that type's visible provinces),
 * down a column (province total − its visible types), or across provinces
 * (grand total − visible province totals). Each of those differences must be
 * 0 or at least 5, so, per step, until nothing changes:
 *   - a cell or province total under 5 is masked (primary);
 *   - organisations without a province are always hidden mass — their cells
 *     and total are never published;
 *   - in a row, a column, or the row of province totals whose hidden sum is
 *     1..4 (or under 5 where the line's own total is itself masked, so that
 *     total cannot be rebuilt from visible parts), the smallest visible entry
 *     is masked too;
 *   - as in buildFunnel, a group whose `registered` is masked shows no step.
 *
 * Returns, per step, the masked `${type}|${province}` cells and masked provinces.
 */
export function maskProvinceTable(
  byProvince: RawByProvince,
  overall: AgencyFunnel
): Record<string, { cells: Set<string>; provinces: Set<string> }> {
  // A province with no organisation is 0 everywhere and hidden everywhere: it
  // adds nothing to any sum, so only provinces that occur are walked.
  const cols: string[] = [...TR_PROVINCES.filter((p) => byProvince.has(p)), NO_PROVINCE];
  const key = (t: OrgType, p: string) => `${t}|${p}`;
  const value = (t: OrgType, p: string, s: (typeof MEASURED_STEPS)[number]) => byProvince.get(p)?.[t][s] ?? 0;
  const colTotal = (p: string, s: (typeof MEASURED_STEPS)[number]) =>
    ORG_TYPES.reduce((n, t) => n + value(t, p, s), 0);

  const masks = Object.fromEntries(
    MEASURED_STEPS.map((s) => {
      const cells = new Set<string>();
      const provinces = new Set<string>();
      for (const p of cols) {
        if (p === NO_PROVINCE || colTotal(p, s) < SMALL_CELL_THRESHOLD) provinces.add(p);
        for (const t of ORG_TYPES) {
          if (p === NO_PROVINCE || value(t, p, s) < SMALL_CELL_THRESHOLD) cells.add(key(t, p));
        }
      }
      return [s, { cells, provinces }];
    })
  ) as Record<(typeof MEASURED_STEPS)[number], { cells: Set<string>; provinces: Set<string> }>;

  /** Masks the smallest visible entry of a line when its hidden sum would give a small group away. */
  function protectLine(
    entries: { id: string; v: number }[],
    hidden: Set<string>,
    totalVisible: boolean
  ): boolean {
    const hiddenSum = entries.filter((e) => hidden.has(e.id)).reduce((n, e) => n + e.v, 0);
    const exposed = totalVisible
      ? hiddenSum > 0 && hiddenSum < SMALL_CELL_THRESHOLD
      : hiddenSum < SMALL_CELL_THRESHOLD;
    if (!exposed) return false;
    const smallest = entries.filter((e) => !hidden.has(e.id)).sort((a, b) => a.v - b.v)[0];
    if (!smallest) return false;
    hidden.add(smallest.id);
    return true;
  }

  let changed = true;
  while (changed) {
    changed = false;
    // A group under the threshold shows no step at all.
    const reg = masks.registered;
    for (const s of MEASURED_STEPS) {
      const before = masks[s].cells.size + masks[s].provinces.size;
      for (const c of reg.cells) masks[s].cells.add(c);
      for (const p of reg.provinces) masks[s].provinces.add(p);
      if (masks[s].cells.size + masks[s].provinces.size !== before) changed = true;
    }
    for (const s of MEASURED_STEPS) {
      const { cells, provinces } = masks[s];
      for (const t of ORG_TYPES) {
        const row = cols.map((p) => ({ id: key(t, p), v: value(t, p, s) }));
        if (protectLine(row, cells, overall.byOrgType[t][s].state === 'count')) changed = true;
      }
      for (const p of cols) {
        if (p === NO_PROVINCE) continue;
        const col = ORG_TYPES.map((t) => ({ id: key(t, p), v: value(t, p, s) }));
        if (protectLine(col, cells, !provinces.has(p))) changed = true;
      }
      const totals = cols.map((p) => ({ id: p, v: colTotal(p, s) }));
      if (protectLine(totals, provinces, overall.all[s].state === 'count')) changed = true;
    }
  }
  return masks;
}

/** Pure: the masked view of one province. Exported for tests. */
export function buildProvinceFunnel(
  windowDays: FunnelWindow,
  byProvince: RawByProvince,
  province: TrProvince
): AgencyFunnel {
  const overall = buildFunnel(windowDays, sumProvinces(byProvince));
  const masks = maskProvinceTable(byProvince, overall);
  // A province nobody gave is not in the masks at all (see `cols`): all of it is "<5".
  const table = byProvince.get(province);
  const view = buildFunnel(windowDays, zeroTable());
  for (const s of MEASURED_STEPS) {
    const total = table ? ORG_TYPES.reduce((n, t) => n + table[t][s], 0) : 0;
    view.all[s] = cell(total, !table || masks[s]!.provinces.has(province));
    for (const t of ORG_TYPES) {
      view.byOrgType[t][s] = cell(table?.[t][s] ?? 0, !table || masks[s]!.cells.has(`${t}|${province}`));
    }
  }
  return { ...view, province };
}

interface FunnelRow {
  org_type: string;
  province: string | null;
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
 * `province` limits the view to one province (null = all organisations).
 * `outcomes` is injectable for tests; production uses be-fb's B7 function.
 */
export async function getAgencyFunnel(
  agencyTenantId: string,
  windowDays: FunnelWindow,
  deps: {
    province?: TrProvince | null;
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

  const byProvince = new Map<string, Record<OrgType, RawCounts>>();
  const tableOf = (province: string | null) => {
    // The CHECK on Tenant.province allows TR_PROVINCES only; anything else would be a bug, counted as "none".
    const p = TR_PROVINCES.includes(province as TrProvince) ? (province as string) : NO_PROVINCE;
    let table = byProvince.get(p);
    if (!table) byProvince.set(p, (table = zeroTable()));
    return table;
  };

  // Steps 1, 3, 4, 5: counted inside the database, in the agency's own scope.
  const rows = await withTenant(agencyTenantId, (tx) =>
    tx.$queryRaw<FunnelRow[]>`SELECT * FROM public.agency_funnel_counts_by_province(${since}::timestamp)`
  );
  for (const r of rows) {
    const t = r.org_type as OrgType;
    if (!ORG_TYPES.includes(t)) continue;
    const c = tableOf(r.province)[t];
    c.registered += r.registered;
    c.savedSearch += r.saved_search;
    c.pipeline += r.pipeline;
    c.conceptNote += r.concept_note;
  }

  // Steps 6, 7: the cohort's ids, derived here from the agency link — the only
  // list countApplicationOutcomes is ever given. Ids stay on the server.
  const cohort = await prisma.tenant.findMany({
    where: { agencyId: agencyTenantId, deletedAt: null, createdAt: { gte: since } },
    select: { id: true, orgType: true, province: true },
  });
  const outcomes = deps.outcomes ?? countApplicationOutcomes;
  const groups = new Map<string, { table: RawCounts; ids: string[] }>();
  for (const c of cohort) {
    const k = `${c.orgType}|${c.province ?? NO_PROVINCE}`;
    let g = groups.get(k);
    if (!g) groups.set(k, (g = { table: tableOf(c.province)[c.orgType], ids: [] }));
    g.ids.push(c.id);
  }
  for (const { table, ids } of groups.values()) {
    // No `since`: the window picks the cohort (registered in it); everything
    // that cohort has applied for counts, so the steps describe one group.
    const o = await outcomes(ids);
    table.submitted += o.submitted;
    table.accepted += o.accepted;
    table.rejected += o.rejected;
  }

  return deps.province
    ? buildProvinceFunnel(windowDays, byProvince, deps.province)
    : buildFunnel(windowDays, sumProvinces(byProvince));
}

/** Session gate for the page: is this tenant a live agency? */
export async function isAgencyTenant(tenantId: string): Promise<boolean> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { kind: true, deletedAt: true } });
  return Boolean(t && t.kind === 'AGENCY' && !t.deletedAt);
}
