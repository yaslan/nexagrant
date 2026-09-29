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
 *   - Steps 6 and 7 (organisations that applied, got an outcome) come from
 *     be-fb's `countApplicationOutcomes` (B7) in its organisation mode, which
 *     TRUSTS the tenant list it is given.
 *     The list is derived here, on the server, from `Tenant.agencyId` of the
 *     session's own agency tenant — never from a parameter a browser can set.
 *   - Step 2 (readiness card completed, FB KAMU B6 / TASK-MULRR8P7HIII4) counts
 *     the cohort's organisations whose `Tenant.settings.readiness` holds a
 *     result — stored only when the person ticked "add my result to my account"
 *     at registration (src/lib/readiness/account.ts). Counted here from the same
 *     cohort list; the settings never leave the server, only the count does,
 *     masked like every other step.
 *
 * One cohort only (TASK-MULXF0AVMD8MN, leed-fb 29.09): every organisation ever
 * registered with the agency's codes, cumulative. There is no 30/90-day
 * selector: the 30-day cohort is a subset of the 90-day one, so the difference
 * of the two views described the organisations of days 31-90 — one of them,
 * in crw-fb's example (TASK-MULWCLZHRTRK5-crw-fb.md Ö-1).
 *
 * One breakdown at a time (TASK-MULZATEX4G92H, leed-fb 29.09): a response
 * carries the totals plus either one province (every type) or every type
 * (every province), never a type × province cell. Every step counts
 * organisations — steps 6-7 too — so one threshold means one unit.
 *
 * Every number then goes through the small-cell rule (§3.1) with complementary
 * suppression over every breakdown at once ({@link suppressedCells}): each is
 * one request away, so no number a reader can combine with another may leave
 * a group of 1..4. src/lib/agency/funnel.attack.test.ts is the gate: an
 * integer attacker joining every view. Every number shown is then rounded to
 * a multiple of 5 ({@link roundToFive}, HUKUK-5). Masking and rounding happen
 * here, so the browser never receives a count under 5 nor an exact count.
 *
 * Not on any screen yet, and gated if it ever is (TASK-MUM1OTRM75QS2-crw-fb.md
 * Ö-2): the refused-code audit rows, `agency.invite.rejected` with `reason` and
 * `codeId`, sit in the agency's own tenant
 * (prisma/migrations/fix-agency-invite-rejection-audit.sql). `reason =
 * 'exhausted'` for a code was the very status the code panel dropped
 * (TASK-MUM2RMN3YIBGC): used = maxUses. Codes have no use limit since
 * agency-invite-no-max-uses.sql (TASK-MUM4WVYLSH9IT) and no new row carries it,
 * but rows written before stay. A screen that shows those rows — or counts of them — joins this funnel
 * and must go through the same attacker (funnel.attack.test.ts, D ≥ 0 and
 * D = 0) before it ships.
 */
import type { OrgType } from '@prisma/client';
import { prisma, withTenant } from '@/lib/db';
import { countApplicationOutcomes } from '@/lib/k5-pipeline/applicationOutcome';
import { TR_PROVINCES, type TrProvince } from '@/lib/readiness/provinces';
import { readTenantReadiness } from '@/lib/readiness/account';

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

/**
 * Steps with no data source yet. Shown as "not measured yet", never as 0.
 * Empty since B6 (TASK-MULRR8P7HIII4) measured `readiness`; the state stays for
 * the next step that ships before its data does.
 */
const UNMEASURED: ReadonlySet<FunnelStep> = new Set<FunnelStep>();

export type FunnelCell =
  | { state: 'count'; value: number }
  | { state: 'small' }
  | { state: 'unmeasured' };

export type FunnelView = Record<FunnelStep, FunnelCell>;

/**
 * The one breakdown a response carries (TASK-MULZATEX4G92H, leed-fb 29.09):
 * none, one province (every type together) or every organisation type (every
 * province together). There is no type × province table: its cells were what
 * crw-fb's attacker read back (TASK-MULYGTXCZNCOP-crw-fb.md Kart 1 B-1).
 */
export type FunnelBreakdown =
  | { dimension: 'none' }
  | { dimension: 'province'; province: TrProvince }
  | { dimension: 'orgType' };

export interface AgencyFunnel {
  /** Every organisation, with or without a province. */
  all: FunnelView;
  breakdown:
    | { dimension: 'none' }
    | { dimension: 'province'; province: TrProvince; view: FunnelView }
    | { dimension: 'orgType'; byOrgType: Record<OrgType, FunnelView> };
}

type MeasuredStep = FunnelStep;
type RawCounts = Record<MeasuredStep, number>;
const MEASURED_STEPS = FUNNEL_STEPS.filter((s) => !UNMEASURED.has(s)) as MeasuredStep[];

/**
 * Steps that count a subset of the organisations of another step of the same
 * group, so that `parent − child` is itself a group a reader can compute:
 * organisations with no saved search, organisations that applied but have no
 * accepted application yet, …
 *
 * Every step counts organisations (TASK-MULZATEX4G92H Ö-1), so each one is a
 * subset of `registered`. `accepted` and `rejected` are not disjoint (one
 * organisation can have both), so each is its own line under `submitted`.
 * `pipeline ⊇ conceptNote` holds except for a concept note on a deleted
 * opportunity; where the difference is negative the line is not a group and
 * is skipped.
 */
const NESTED_STEPS: readonly { parent: MeasuredStep; child: MeasuredStep }[] = [
  { parent: 'registered', child: 'readiness' },
  { parent: 'registered', child: 'savedSearch' },
  { parent: 'registered', child: 'pipeline' },
  { parent: 'registered', child: 'conceptNote' },
  { parent: 'registered', child: 'submitted' },
  { parent: 'registered', child: 'accepted' },
  { parent: 'registered', child: 'rejected' },
  { parent: 'pipeline', child: 'conceptNote' },
  { parent: 'submitted', child: 'accepted' },
  { parent: 'submitted', child: 'rejected' },
];

export class NotAnAgencyError extends Error {
  readonly code = 'NOT_AN_AGENCY';
  constructor() {
    super('Only a member of an agency tenant can read an agency funnel');
    this.name = 'NotAnAgencyError';
  }
}

/**
 * HUKUK-5 fallback (TASK-MULZATEX4G92H, leed-fb 29.09 decision 4): every number
 * shown is rounded to the nearest multiple of 5, each on its own (totals are
 * rounded separately, so the parts need not add up to the total). The rule
 * based suppression alone still left a small group readable in about one of
 * a thousand random tables (the wider run in the report); rounding leaves a
 * reader intervals of width 4 instead of exact numbers. The threshold holds:
 * only a number of 5 or more is shown, so a shown 5 is 5..7, never 3.
 */
export function roundToFive(value: number): number {
  return Math.round(value / SMALL_CELL_THRESHOLD) * SMALL_CELL_THRESHOLD;
}

function cell(value: number, masked: boolean): FunnelCell {
  return masked ? { state: 'small' } : { state: 'count', value: roundToFive(value) };
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

function isProvince(p: string): p is TrProvince {
  return (TR_PROVINCES as readonly string[]).includes(p);
}

/**
 * K-2 (crw-fb): a key outside TR_PROVINCES is counted as "no province", never
 * dropped. Dropped, its organisations would be missing from the province line
 * while still inside the grand total, which is the hidden mass the masking
 * has to see.
 */
export function normalizeProvinces(byProvince: RawByProvince): RawByProvince {
  const out = new Map<string, Record<OrgType, RawCounts>>();
  for (const [key, table] of byProvince) {
    const p = isProvince(key) ? key : NO_PROVINCE;
    let into = out.get(p);
    if (!into) out.set(p, (into = zeroTable()));
    for (const t of ORG_TYPES) for (const s of MEASURED_STEPS) into[t][s] += table[t][s];
  }
  return out;
}

export function sumProvinces(byProvince: RawByProvince): Record<OrgType, RawCounts> {
  const sum = zeroTable();
  for (const table of byProvince.values()) {
    for (const t of ORG_TYPES) for (const s of MEASURED_STEPS) sum[t][s] += table[t][s];
  }
  return sum;
}

/**
 * A published number: one step, for every type in one province, for one type
 * over every province, or for everyone. Never one type in one province.
 */
export function cellId(step: MeasuredStep, type: OrgType | typeof ALL, province: string): string {
  return `${step}|${type}|${province}`;
}

/**
 * `total = Σ parts`. `nested` lines are a step against a step it contains:
 * their second part (the remainder) is never published, it is a difference.
 */
interface Line {
  total: string;
  parts: string[];
  nested: boolean;
}

/**
 * The small-cell rule with complementary suppression, over every number the
 * dashboard can publish in any breakdown — per step: the grand total, each
 * province (every type), each type (every province). The breakdowns are one
 * request apart and share the grand total, so they are masked together.
 *
 * A reader holding every view can subtract along a line:
 *   - across provinces: the grand total minus the visible provinces (the
 *     organisations without a province are part of it, never published);
 *   - across types: the grand total minus the visible types;
 *   - across steps: a step minus a step that counts a subset of it
 *     ({@link NESTED_STEPS}).
 * So, until nothing changes:
 *   - primary: a number under 5 (0 included, so "<5" does not tell "none" from
 *     "a few") is masked;
 *   - organisations without a province are always hidden;
 *   - across provinces and types (TASK-MULZATEX4G92H): what a visible total
 *     leaves hidden is either nothing, or at least TWO hidden parts above 0
 *     that sum to 5 or more. A zero is no cover — a reader can prove it from
 *     another line (22 = 13 + 9 proves every other type empty) — and a single
 *     hidden part is its total minus the visible ones. Otherwise the smallest
 *     visible part is masked too. Where the total is itself hidden, the same
 *     holds for the parts, so it cannot be summed back;
 *   - across steps: `parent − child` is 0 or at least 5, else the child is
 *     masked;
 *   - a group whose `registered` is masked shows no step at all.
 *
 * Returns the masked {@link cellId}s. A province nobody gave has no id here;
 * all of it is masked.
 */
export function suppressedCells(raw: RawByProvince): Set<string> {
  const byProvince = normalizeProvinces(raw);
  // A province with no organisation is 0 everywhere and hidden everywhere: it
  // adds nothing to any sum, so only provinces that occur are walked.
  const named = TR_PROVINCES.filter((p) => byProvince.has(p));
  const provinces: string[] = [...named, NO_PROVINCE];
  const types: OrgType[] = [...ORG_TYPES];
  /** Every published group: everyone, each province, each type. */
  const groups: [OrgType | typeof ALL, string][] = [
    [ALL, ALL],
    ...named.map((p): [typeof ALL, string] => [ALL, p]),
    ...types.map((t): [OrgType, string] => [t, ALL]),
  ];

  const value = new Map<string, number>();
  const hidden = new Set<string>();
  const total = sumProvinces(byProvince);
  for (const s of MEASURED_STEPS) {
    value.set(cellId(s, ALL, ALL), ORG_TYPES.reduce((n, t) => n + total[t][s], 0));
    for (const t of types) value.set(cellId(s, t, ALL), total[t][s]);
    for (const p of provinces) {
      const table = byProvince.get(p);
      value.set(cellId(s, ALL, p), table ? ORG_TYPES.reduce((n, t) => n + table[t][s], 0) : 0);
    }
    hidden.add(cellId(s, ALL, NO_PROVINCE));
  }

  const lines: Line[] = [];
  for (const s of MEASURED_STEPS) {
    lines.push({ total: cellId(s, ALL, ALL), parts: provinces.map((p) => cellId(s, ALL, p)), nested: false });
    lines.push({ total: cellId(s, ALL, ALL), parts: types.map((t) => cellId(s, t, ALL)), nested: false });
  }
  NESTED_STEPS.forEach(({ parent, child }, i) => {
    for (const [t, p] of groups) {
      const rest = value.get(cellId(parent, t, p))! - value.get(cellId(child, t, p))!;
      if (rest < 0) continue;
      const remainder = `~${i}|${t}|${p}`;
      value.set(remainder, rest);
      hidden.add(remainder);
      lines.push({ total: cellId(parent, t, p), parts: [cellId(child, t, p), remainder], nested: true });
    }
  });

  for (const [id, v] of value) if (v < SMALL_CELL_THRESHOLD) hidden.add(id);

  /** Masks the smallest visible part of a line whose hidden parts would give a small group away. */
  function protectLine({ total: t, parts, nested }: Line): boolean {
    const visible = parts.filter((id) => !hidden.has(id));
    if (visible.length === 0) return false;
    const cover = parts.filter((id) => hidden.has(id) && value.get(id)! > 0);
    const hiddenSum = cover.reduce((n, id) => n + value.get(id)!, 0);
    let exposed: boolean;
    if (nested) {
      // parent − child: the remainder is read off when both are shown.
      exposed = !hidden.has(t) && hiddenSum > 0 && hiddenSum < SMALL_CELL_THRESHOLD;
    } else {
      exposed = hidden.has(t)
        ? cover.length < 2 || hiddenSum < SMALL_CELL_THRESHOLD
        : cover.length > 0 && (cover.length < 2 || hiddenSum < SMALL_CELL_THRESHOLD);
    }
    if (!exposed) return false;
    const smallest = visible.sort((a, b) => value.get(a)! - value.get(b)!)[0]!;
    hidden.add(smallest);
    return true;
  }

  let changed = true;
  while (changed) {
    changed = false;
    // A group under the threshold shows no step at all.
    for (const [t, p] of groups) {
      if (!hidden.has(cellId('registered', t, p))) continue;
      for (const s of MEASURED_STEPS) {
        const id = cellId(s, t, p);
        if (!hidden.has(id)) {
          hidden.add(id);
          changed = true;
        }
      }
    }
    for (const line of lines) if (protectLine(line)) changed = true;
  }
  return hidden;
}

/**
 * Pure: the masked funnel with one breakdown. Exported for tests. Only the
 * breakdown asked for leaves this function, but the masking is the one of
 * every breakdown at once ({@link suppressedCells}).
 */
export function buildAgencyFunnel(raw: RawByProvince, breakdown: FunnelBreakdown): AgencyFunnel {
  const byProvince = normalizeProvinces(raw);
  const hidden = suppressedCells(byProvince);
  const total = sumProvinces(byProvince);
  const view = (value: (s: MeasuredStep) => number, t: OrgType | typeof ALL, p: string, known = true): FunnelView =>
    Object.fromEntries(
      FUNNEL_STEPS.map((s) => {
        if (UNMEASURED.has(s)) return [s, { state: 'unmeasured' }];
        const m = s as MeasuredStep;
        return [s, cell(value(m), !known || hidden.has(cellId(m, t, p)))];
      })
    ) as FunnelView;
  const all = view((s) => ORG_TYPES.reduce((n, t) => n + total[t][s], 0), ALL, ALL);

  if (breakdown.dimension === 'province') {
    const { province } = breakdown;
    const table = byProvince.get(province);
    // A province nobody gave is not in the table at all: all of it is "<5".
    const v = view((s) => (table ? ORG_TYPES.reduce((n, t) => n + table[t][s], 0) : 0), ALL, province, !!table);
    return { all, breakdown: { dimension: 'province', province, view: v } };
  }
  if (breakdown.dimension === 'orgType') {
    const byOrgType = Object.fromEntries(ORG_TYPES.map((t) => [t, view((s) => total[t][s], t, ALL)])) as Record<
      OrgType,
      FunnelView
    >;
    return { all, breakdown: { dimension: 'orgType', byOrgType } };
  }
  return { all, breakdown: { dimension: 'none' } };
}

/** Pure: raw per-type counts in (no province split), the masked funnel by type out. Exported for tests. */
export function buildFunnel(raw: Record<OrgType, RawCounts>): AgencyFunnel {
  return buildAgencyFunnel(new Map([[NO_PROVINCE, raw]]), { dimension: 'orgType' });
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
 * (no date window, see the file comment). `breakdown` picks the one breakdown
 * the response carries (default: none).
 * `outcomes` is injectable for tests; production uses be-fb's B7 function.
 */
export async function getAgencyFunnel(
  agencyTenantId: string,
  deps: {
    breakdown?: FunnelBreakdown;
    outcomes?: typeof countApplicationOutcomes;
  } = {}
): Promise<AgencyFunnel> {
  const raw = await readAgencyFunnelRaw(agencyTenantId, deps);
  return buildAgencyFunnel(raw, deps.breakdown ?? { dimension: 'none' });
}

/**
 * The raw, UNMASKED counts behind {@link getAgencyFunnel}: the one query path of
 * the dashboard, shared with the region report (FB KAMU B3, src/lib/agency/report.ts)
 * so the report counts nothing the dashboard does not. What it returns must
 * never leave the server: its only consumer is {@link buildAgencyFunnel}.
 * Same contract as getAgencyFunnel: `agencyTenantId` is the caller's own agency.
 */
export async function readAgencyFunnelRaw(
  agencyTenantId: string,
  deps: { outcomes?: typeof countApplicationOutcomes } = {}
): Promise<RawByProvince> {
  // Tenant is a system-wide table (not under RLS); the id is the session's own.
  const agency = await prisma.tenant.findUnique({
    where: { id: agencyTenantId },
    select: { kind: true, deletedAt: true },
  });
  if (!agency || agency.kind !== 'AGENCY' || agency.deletedAt) throw new NotAnAgencyError();

  const byProvince = new Map<string, Record<OrgType, RawCounts>>();
  const tableOf = (province: string | null) => {
    // The CHECK on Tenant.province allows TR_PROVINCES only; anything else would be a bug, counted as "none".
    const p = province !== null && isProvince(province) ? province : NO_PROVINCE;
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
    select: { id: true, orgType: true, province: true, settings: true },
  });
  const outcomes = deps.outcomes ?? countApplicationOutcomes;
  const groups = new Map<string, { table: RawCounts; ids: string[] }>();
  for (const c of cohort) {
    const k = `${c.orgType}|${c.province ?? NO_PROVINCE}`;
    let g = groups.get(k);
    if (!g) groups.set(k, (g = { table: tableOf(c.province)[c.orgType], ids: [] }));
    g.ids.push(c.id);
    // Step 2 (B6): a stored scorecard result that still decodes. A subset of
    // `registered` — the same cohort — which NESTED_STEPS masks as one.
    if (readTenantReadiness(c.settings)) g.table.readiness += 1;
  }
  for (const { table, ids } of groups.values()) {
    // No `since`: everything the cohort has applied for counts, so the steps
    // describe one group. Organisations, not applications (TASK-MULZATEX4G92H
    // Ö-1): one organisation with six applications is one, so the small-cell
    // rule counts the same unit on every step.
    const o = await outcomes(ids, undefined, { unit: 'organisation' });
    table.submitted += o.submitted;
    table.accepted += o.accepted;
    table.rejected += o.rejected;
  }

  return byProvince;
}

/** Session gate for the page: is this tenant a live agency? */
export async function isAgencyTenant(tenantId: string): Promise<boolean> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { kind: true, deletedAt: true } });
  return Boolean(t && t.kind === 'AGENCY' && !t.deletedAt);
}
