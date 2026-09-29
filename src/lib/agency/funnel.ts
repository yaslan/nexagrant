/**
 * Agency funnel — the aggregation layer behind the agency dashboard
 * (TASK-MULRQSJFB8RWJ, FB KAMU B2; docs/kamu/OKA-KANAL-ONERISI.md §4).
 *
 * What an agency may see is fixed by docs/legal/agency-channel-notice-addendum.md:
 * counts of organisations, never an organisation. So:
 *
 *   - Steps 1, 3, 4, 5 come from `public.agency_funnel_counts_by_province(NULL)`
 *     (prisma/migrations/add-agency-funnel-province.sql), a SECURITY DEFINER
 *     function that takes the agency from the caller's `app.tenant_id` and
 *     returns integers per organisation type and province. No tenant row leaves it.
 *   - Steps 6 and 7 (applications, outcomes) come from be-fb's
 *     `countApplicationOutcomes` (B7), which TRUSTS the tenant list it is given.
 *     The list is derived here, on the server, from `Tenant.agencyId` of the
 *     session's own agency tenant — never from a parameter a browser can set.
 *   - Step 2 (readiness card completed) has no data yet (B6) and is reported as
 *     `unmeasured`, never as a number.
 *
 * One cohort only (TASK-MULXF0AVMD8MN, leed-fb 29.09): every organisation ever
 * registered with the agency's codes, cumulative. There is no 30/90-day
 * selector: the 30-day cohort is a subset of the 90-day one, so the difference
 * of the two views described the organisations of days 31-90 — one of them,
 * in crw-fb's example (TASK-MULWCLZHRTRK5-crw-fb.md Ö-1).
 *
 * Every number then goes through the small-cell rule (§3.1) with complementary
 * suppression over the whole type × province × step table at once
 * ({@link suppressedCells}): every province view is one request away, so no
 * number a reader can subtract from another may leave a group of 1..4.
 * Masking happens here, so the browser never receives a count under 5.
 */
import type { OrgType } from '@prisma/client';
import { prisma, withTenant } from '@/lib/db';
import { countApplicationOutcomes } from '@/lib/k5-pipeline/applicationOutcome';
import { TR_PROVINCES, type TrProvince } from '@/lib/readiness/provinces';

/** docs/legal/agency-channel-notice-addendum.md §3.1 (HUKUK-5): one threshold for B2 and B3. */
export const SMALL_CELL_THRESHOLD = 5;

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
  /** The province the view is limited to; null = every organisation, with or without one. */
  province: TrProvince | null;
  /** Funnel over every organisation type. */
  all: FunnelView;
  /** Funnel for one organisation type. Every type is present, masked alike. */
  byOrgType: Record<OrgType, FunnelView>;
}

type MeasuredStep = Exclude<FunnelStep, 'readiness'>;
type RawCounts = Record<MeasuredStep, number>;
const MEASURED_STEPS = FUNNEL_STEPS.filter((s) => !UNMEASURED.has(s)) as MeasuredStep[];

/**
 * Steps that count a subset of another step of the same group, so that
 * `parent − Σ children` is itself a group a reader can compute: organisations
 * with no saved search, applications still waiting for an outcome, …
 *
 * `pipeline ⊇ conceptNote` holds except for a concept note on a deleted
 * opportunity; where the difference is negative the line is not a group and
 * is skipped.
 */
const NESTED_STEPS: readonly { parent: MeasuredStep; children: MeasuredStep[] }[] = [
  { parent: 'registered', children: ['savedSearch'] },
  { parent: 'registered', children: ['pipeline'] },
  { parent: 'registered', children: ['conceptNote'] },
  { parent: 'pipeline', children: ['conceptNote'] },
  { parent: 'submitted', children: ['accepted', 'rejected'] },
];

export class NotAnAgencyError extends Error {
  readonly code = 'NOT_AN_AGENCY';
  constructor() {
    super('Only a member of an agency tenant can read an agency funnel');
    this.name = 'NotAnAgencyError';
  }
}

function cell(value: number, masked: boolean): FunnelCell {
  return masked ? { state: 'small' } : { state: 'count', value };
}

function zeroCounts(): RawCounts {
  return Object.fromEntries(MEASURED_STEPS.map((s) => [s, 0])) as RawCounts;
}

function zeroTable(): Record<OrgType, RawCounts> {
  return Object.fromEntries(ORG_TYPES.map((t) => [t, zeroCounts()])) as Record<OrgType, RawCounts>;
}

/** Organisations that gave no province. Never a view of its own, never shown. */
export const NO_PROVINCE = '';
/** "Every type" / "every province" in a {@link cellId}. */
export const ALL = '*';

/** Raw counts per province (TR_PROVINCES name, or {@link NO_PROVINCE}) and type. */
export type RawByProvince = ReadonlyMap<string, Record<OrgType, RawCounts>>;

export function sumProvinces(byProvince: RawByProvince): Record<OrgType, RawCounts> {
  const sum = zeroTable();
  for (const table of byProvince.values()) {
    for (const t of ORG_TYPES) for (const s of MEASURED_STEPS) sum[t][s] += table[t][s];
  }
  return sum;
}

/** A published number: one step, for one type (or {@link ALL}) in one province (or {@link ALL}). */
export function cellId(step: MeasuredStep, type: OrgType | typeof ALL, province: string): string {
  return `${step}|${type}|${province}`;
}

/**
 * `total = Σ parts`. `rebuildable` is false when a part is never published
 * (the remainder of a {@link NESTED_STEPS} line), so a hidden total can never
 * be summed back from visible parts.
 */
interface Line {
  total: string;
  parts: string[];
  rebuildable: boolean;
}

/**
 * The small-cell rule with complementary suppression, over every number the
 * dashboard can publish: for each measured step, the type × province table
 * with its row totals (a type over every province), column totals (every type
 * in a province) and grand total. Every province view is one request away, so
 * the whole table is masked at once, not the one view asked for.
 *
 * A reader holding every view can subtract along a line:
 *   - across types: a total minus its visible types;
 *   - across provinces: a total over every province minus the visible ones;
 *   - across steps: a step minus a step that counts a subset of it
 *     ({@link NESTED_STEPS}: registered − saved search, submitted − accepted
 *     − rejected, …).
 * Each such difference must be 0 or at least 5. So, until nothing changes:
 *   - primary: a number under 5 (0 included, so "<5" does not tell "none" from
 *     "a few") is masked;
 *   - organisations without a province are always hidden mass: their numbers
 *     are never published;
 *   - complementary: in a line whose visible total leaves a hidden sum of 1..4,
 *     the smallest visible part is masked too; where the total is itself
 *     hidden but could be summed back from its parts, the hidden parts must
 *     reach 5;
 *   - a group whose `registered` is masked shows no step at all.
 *
 * Returns the masked {@link cellId}s. A province nobody gave has no id here;
 * all of it is masked.
 */
export function suppressedCells(byProvince: RawByProvince): Set<string> {
  // A province with no organisation is 0 everywhere and hidden everywhere: it
  // adds nothing to any sum, so only provinces that occur are walked.
  const provinces = [...TR_PROVINCES.filter((p) => byProvince.has(p)), NO_PROVINCE];
  /** Views a reader can ask for: each named province, and every province at once. */
  const views = [...provinces.filter((p) => p !== NO_PROVINCE), ALL];
  const types: (OrgType | typeof ALL)[] = [...ORG_TYPES, ALL];

  const value = new Map<string, number>();
  const hidden = new Set<string>();
  for (const s of MEASURED_STEPS) {
    for (const t of ORG_TYPES) {
      let rowTotal = 0;
      for (const p of provinces) {
        const v = byProvince.get(p)?.[t][s] ?? 0;
        value.set(cellId(s, t, p), v);
        rowTotal += v;
      }
      value.set(cellId(s, t, ALL), rowTotal);
    }
    for (const p of [...provinces, ALL]) {
      value.set(cellId(s, ALL, p), ORG_TYPES.reduce((n, t) => n + value.get(cellId(s, t, p))!, 0));
      if (p === NO_PROVINCE) for (const t of types) hidden.add(cellId(s, t, p));
    }
  }

  const lines: Line[] = [];
  for (const s of MEASURED_STEPS) {
    for (const p of views) {
      lines.push({ total: cellId(s, ALL, p), parts: ORG_TYPES.map((t) => cellId(s, t, p)), rebuildable: true });
    }
    for (const t of types) {
      lines.push({ total: cellId(s, t, ALL), parts: provinces.map((p) => cellId(s, t, p)), rebuildable: true });
    }
  }
  NESTED_STEPS.forEach(({ parent, children }, i) => {
    for (const t of types) {
      for (const p of views) {
        const rest =
          value.get(cellId(parent, t, p))! - children.reduce((n, c) => n + value.get(cellId(c, t, p))!, 0);
        if (rest < 0) continue;
        const remainder = `~${i}|${t}|${p}`;
        value.set(remainder, rest);
        hidden.add(remainder);
        lines.push({
          total: cellId(parent, t, p),
          parts: [...children.map((c) => cellId(c, t, p)), remainder],
          rebuildable: false,
        });
      }
    }
  });

  for (const [id, v] of value) if (v < SMALL_CELL_THRESHOLD) hidden.add(id);

  /** Masks the smallest visible part of a line whose hidden sum would give a small group away. */
  function protectLine({ total, parts, rebuildable }: Line): boolean {
    const hiddenSum = parts.filter((id) => hidden.has(id)).reduce((n, id) => n + value.get(id)!, 0);
    const exposed = !hidden.has(total)
      ? hiddenSum > 0 && hiddenSum < SMALL_CELL_THRESHOLD
      : rebuildable && hiddenSum < SMALL_CELL_THRESHOLD;
    if (!exposed) return false;
    const smallest = parts.filter((id) => !hidden.has(id)).sort((a, b) => value.get(a)! - value.get(b)!)[0];
    if (!smallest) return false;
    hidden.add(smallest);
    return true;
  }

  let changed = true;
  while (changed) {
    changed = false;
    // A group under the threshold shows no step at all.
    for (const t of types) {
      for (const p of views) {
        if (!hidden.has(cellId('registered', t, p))) continue;
        for (const s of MEASURED_STEPS) {
          const id = cellId(s, t, p);
          if (!hidden.has(id)) {
            hidden.add(id);
            changed = true;
          }
        }
      }
    }
    for (const line of lines) if (protectLine(line)) changed = true;
  }
  return hidden;
}

/** Pure: the masked view of one province, or of every organisation (`province` null). Exported for tests. */
export function buildProvinceFunnel(byProvince: RawByProvince, province: TrProvince | null): AgencyFunnel {
  const hidden = suppressedCells(byProvince);
  const p = province ?? ALL;
  // A province nobody gave is not in the table at all: all of it is "<5".
  const known = province === null || byProvince.has(province);
  const table = province === null ? sumProvinces(byProvince) : byProvince.get(province);
  const view = (t: OrgType | typeof ALL): FunnelView =>
    Object.fromEntries(
      FUNNEL_STEPS.map((s) => {
        if (UNMEASURED.has(s)) return [s, { state: 'unmeasured' }];
        const m = s as MeasuredStep;
        const v = !table ? 0 : t === ALL ? ORG_TYPES.reduce((n, ot) => n + table[ot][m], 0) : table[t][m];
        return [s, cell(v, !known || hidden.has(cellId(m, t, p)))];
      })
    ) as FunnelView;
  return {
    province,
    all: view(ALL),
    byOrgType: Object.fromEntries(ORG_TYPES.map((t) => [t, view(t)])) as Record<OrgType, FunnelView>,
  };
}

/** Pure: raw per-type counts in (no province split), the masked view out. Exported for tests. */
export function buildFunnel(raw: Record<OrgType, RawCounts>): AgencyFunnel {
  return buildProvinceFunnel(new Map([[NO_PROVINCE, raw]]), null);
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
 * One cohort: every organisation ever registered with the agency's codes
 * (no date window, see the file comment). `province` limits the view to one
 * province (null = all organisations).
 * `outcomes` is injectable for tests; production uses be-fb's B7 function.
 */
export async function getAgencyFunnel(
  agencyTenantId: string,
  deps: {
    province?: TrProvince | null;
    outcomes?: typeof countApplicationOutcomes;
  } = {}
): Promise<AgencyFunnel> {
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
  // NULL = no date window (the function's `since IS NULL` branch).
  const rows = await withTenant(agencyTenantId, (tx) =>
    tx.$queryRaw<FunnelRow[]>`SELECT * FROM public.agency_funnel_counts_by_province(NULL::timestamp)`
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
    where: { agencyId: agencyTenantId, deletedAt: null },
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
    // No `since`: everything the cohort has applied for counts, so the steps
    // describe one group.
    const o = await outcomes(ids);
    table.submitted += o.submitted;
    table.accepted += o.accepted;
    table.rejected += o.rejected;
  }

  return buildProvinceFunnel(byProvince, deps.province ?? null);
}

/** Session gate for the page: is this tenant a live agency? */
export async function isAgencyTenant(tenantId: string): Promise<boolean> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { kind: true, deletedAt: true } });
  return Boolean(t && t.kind === 'AGENCY' && !t.deletedAt);
}
