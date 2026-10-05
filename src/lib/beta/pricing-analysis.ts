/**
 * E11.4 — analysis of the beta pricing survey (TASK-MTQ3DZS6W6DFC).
 *
 * Pure functions only: the CLI reads a CSV, hands rows to these, and renders the
 * result. Nothing here touches the filesystem, the database or the clock, so every
 * number in `docs/E11-PRICING-FEEDBACK.md` is reproducible from the CSV alone and
 * unit-testable without a fixture directory.
 *
 * Two standard instruments are implemented, both on the raw responses rather than
 * on a pre-aggregated table:
 *   • Van Westendorp price-sensitivity meter → the acceptable price band.
 *   • Gabor-Granger ladder → the revenue-maximising point on a fixed ladder.
 * Neither is a decision; they bound one. The decision lives in `pricing-transition.ts`.
 *
 * All money is Int minor units (cents), EUR.
 */

import { parse } from 'csv-parse/sync';
import { GG_LADDER_CENTS, PRICING_SURVEY_QUESTIONS } from './pricing-survey';

export type Segment = 'sme' | 'university' | 'consultancy' | 'other';
export type PlanChoice = 'free' | 'starter' | 'team' | 'business' | 'enterprise' | 'none';

export interface PricingResponse {
  respondentId: string;
  slug: string;
  country: string;
  orgType: string;
  locale: 'tr' | 'en';
  submittedAt: string;
  segment: Segment;
  teamSize: number;
  proposalsPerYear: number;
  currentSpendEurCents: number | null;
  vwTooCheap: number;
  vwCheap: number;
  vwExpensive: number;
  vwTooExpensive: number;
  /** price in cents → would buy. */
  gaborGranger: Map<number, boolean>;
  planChoice: PlanChoice;
  seatsNeeded: number;
  workspacesNeeded: number;
  addons: string[];
  creditsEnough: 'yes' | 'no' | 'unsure';
  billingCycle: 'monthly' | 'annual' | 'annual_only';
  currencyPref: 'EUR' | 'TRY' | 'either';
  needsEInvoice: boolean;
  successFee: 'accept' | 'conditional' | 'reject';
  convertDiscountPct: number;
  payLikelihood: number;
  comment: string;
}

export interface RejectedRow {
  row: number;
  respondentId: string;
  reason: string;
}

/**
 * `# STATUS: FIXTURE` in the CSV header marks a dataset that is not real partner
 * feedback. The analyser carries the flag through to the report banner so a
 * pipeline-validation run can never be mistaken for the real week-7 result.
 */
export type DatasetStatus = 'FIXTURE' | 'REAL' | 'UNDECLARED';

export interface ParsedResponses {
  status: DatasetStatus;
  statusNote: string;
  responses: PricingResponse[];
  rejected: RejectedRow[];
}

const SEGMENTS: readonly Segment[] = ['sme', 'university', 'consultancy', 'other'];
const PLAN_CHOICES: readonly PlanChoice[] = ['free', 'starter', 'team', 'business', 'enterprise', 'none'];

function req(row: Record<string, string>, key: string): string {
  const value = (row[key] ?? '').trim();
  if (!value) throw new Error(`"${key}" is required`);
  return value;
}

function int(row: Record<string, string>, key: string, opts: { min?: number; max?: number } = {}): number {
  const raw = req(row, key);
  const value = Number(raw);
  if (!Number.isInteger(value)) throw new Error(`"${key}" must be a whole number, got "${raw}"`);
  if (opts.min !== undefined && value < opts.min) throw new Error(`"${key}" must be ≥ ${opts.min}`);
  if (opts.max !== undefined && value > opts.max) throw new Error(`"${key}" must be ≤ ${opts.max}`);
  return value;
}

/**
 * Read a money column and return minor units.
 *
 * The questionnaire asks for euro — nobody types cents into a Google Form — so the
 * CSV carries euro and the conversion happens here, once, at the boundary. Two
 * decimals are accepted and rounded; everything downstream is Int cents.
 */
function moneyCents(row: Record<string, string>, key: string, optional = false): number | null {
  const raw = (row[key] ?? '').trim().replace(/[€\s]/g, '').replace(',', '.');
  if (!raw) {
    if (optional) return null;
    throw new Error(`"${key}" is required`);
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(`"${key}" must be a non-negative amount in euro`);
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) throw new Error(`"${key}" must be euro with at most two decimals, got "${raw}"`);
  return Math.round(value * 100);
}

function requiredMoneyCents(row: Record<string, string>, key: string): number {
  const value = moneyCents(row, key, false);
  if (value === null) throw new Error(`"${key}" is required`);
  return value;
}

function oneOf<T extends string>(row: Record<string, string>, key: string, allowed: readonly T[]): T {
  const value = req(row, key).toLowerCase();
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`"${key}" must be one of ${allowed.join('|')}, got "${value}"`);
  }
  return value as T;
}

function yesNo(row: Record<string, string>, key: string): boolean {
  const value = req(row, key).toLowerCase();
  if (['yes', 'y', 'true', '1', 'evet'].includes(value)) return true;
  if (['no', 'n', 'false', '0', 'hayır', 'hayir'].includes(value)) return false;
  throw new Error(`"${key}" must be yes or no, got "${value}"`);
}

function readStatus(csv: string): { status: DatasetStatus; note: string } {
  const match = /^#\s*STATUS:\s*(\w+)\s*(.*)$/im.exec(csv);
  const declared = match?.[1]?.toUpperCase();
  if (declared === 'FIXTURE' || declared === 'REAL') {
    return { status: declared, note: (match?.[2] ?? '').trim() };
  }
  return { status: 'UNDECLARED', note: '' };
}

/**
 * Parse and validate the response CSV.
 *
 * A row that fails validation is *rejected with a reason*, never silently dropped:
 * a pricing decision taken on a quietly shrinking denominator is worse than no
 * decision. Rejections are reported alongside the results.
 */
export function parsePricingResponses(csv: string): ParsedResponses {
  const { status, note } = readStatus(csv);
  const rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true, comment: '#' }) as Record<
    string,
    string
  >[];

  const responses: PricingResponse[] = [];
  const rejected: RejectedRow[] = [];
  const seen = new Set<string>();

  rows.forEach((row, index) => {
    const line = index + 1;
    const respondentId = (row['respondentId'] ?? '').trim() || `row-${line}`;
    try {
      if (seen.has(respondentId)) throw new Error(`duplicate respondentId "${respondentId}"`);
      seen.add(respondentId);

      const vwTooCheap = requiredMoneyCents(row, 'vwTooCheap');
      const vwCheap = requiredMoneyCents(row, 'vwCheap');
      const vwExpensive = requiredMoneyCents(row, 'vwExpensive');
      const vwTooExpensive = requiredMoneyCents(row, 'vwTooExpensive');
      // Van Westendorp hygiene: a respondent whose four prices are not ordered did
      // not understand the questions, and their curves would cross the wrong way.
      if (!(vwTooCheap <= vwCheap && vwCheap <= vwExpensive && vwExpensive <= vwTooExpensive)) {
        throw new Error(
          `Van Westendorp prices are not ordered (tooCheap ≤ cheap ≤ expensive ≤ tooExpensive): ` +
    `€${vwTooCheap / 100}, €${vwCheap / 100}, €${vwExpensive / 100}, €${vwTooExpensive / 100}`
        );
      }

      const gaborGranger = new Map<number, boolean>();
      for (const cents of GG_LADDER_CENTS) gaborGranger.set(cents, yesNo(row, `gg${cents / 100}`));

      const addonsRaw = (row['addons'] ?? '').trim();
      const addons = addonsRaw
        ? addonsRaw
            .split(';')
            .map((s) => s.trim())
            .filter((s) => s && s !== 'none')
        : [];

      const localeValue = oneOf(row, 'locale', ['tr', 'en'] as const);

      responses.push({
        respondentId,
        slug: (row['slug'] ?? '').trim(),
        country: (row['country'] ?? '').trim().toUpperCase(),
        orgType: (row['orgType'] ?? '').trim().toUpperCase(),
        locale: localeValue,
        submittedAt: (row['submittedAt'] ?? '').trim(),
        segment: oneOf(row, 'segment', SEGMENTS),
        teamSize: int(row, 'teamSize', { min: 1 }),
        proposalsPerYear: int(row, 'proposalsPerYear', { min: 0 }),
        currentSpendEurCents: moneyCents(row, 'currentSpendEur', true),
        vwTooCheap,
        vwCheap,
        vwExpensive,
        vwTooExpensive,
        gaborGranger,
        planChoice: oneOf(row, 'planChoice', PLAN_CHOICES),
        seatsNeeded: int(row, 'seatsNeeded', { min: 1 }),
        workspacesNeeded: int(row, 'workspacesNeeded', { min: 1 }),
        addons,
        creditsEnough: oneOf(row, 'creditsEnough', ['yes', 'no', 'unsure'] as const),
        billingCycle: oneOf(row, 'billingCycle', ['monthly', 'annual', 'annual_only'] as const),
        currencyPref: (() => {
          const raw = req(row, 'currencyPref').toUpperCase();
          if (raw === 'EUR' || raw === 'TRY') return raw;
          if (raw === 'EITHER') return 'either' as const;
          throw new Error(`"currencyPref" must be EUR|TRY|either, got "${raw}"`);
        })(),
        needsEInvoice: yesNo(row, 'needsEInvoice'),
        successFee: oneOf(row, 'successFee', ['accept', 'conditional', 'reject'] as const),
        convertDiscountPct: int(row, 'convertDiscountPct', { min: 0, max: 100 }),
        payLikelihood: int(row, 'payLikelihood', { min: 0, max: 10 }),
        comment: (row['comment'] ?? '').trim(),
      });
    } catch (error) {
      rejected.push({ row: line, respondentId, reason: error instanceof Error ? error.message : String(error) });
    }
  });

  return { status, statusNote: note, responses, rejected };
}

/* ------------------------------------------------------------------ statistics */

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const lo = sorted[mid - 1];
  const hi = sorted[mid];
  if (lo === undefined || hi === undefined) return null;
  return Math.round((lo + hi) / 2);
}

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/* -------------------------------------------------------------- Van Westendorp */

export interface VanWestendorpPoint {
  priceCents: number;
  tooCheap: number;
  cheap: number;
  expensive: number;
  tooExpensive: number;
}

export interface VanWestendorpResult {
  n: number;
  curve: VanWestendorpPoint[];
  /** Too cheap × expensive — below this, quality doubt outweighs the bargain. */
  pmcCents: number | null;
  /** Cheap × too expensive — above this, resistance outweighs the value. */
  pmeCents: number | null;
  /** Too cheap × too expensive — fewest total rejections. */
  oppCents: number | null;
  /** Cheap × expensive — as many call it cheap as call it expensive. */
  ippCents: number | null;
}

type CurveKey = 'tooCheap' | 'cheap' | 'expensive' | 'tooExpensive';

function curveValue(responses: readonly PricingResponse[], key: CurveKey, priceCents: number): number {
  if (responses.length === 0) return 0;
  let hits = 0;
  for (const r of responses) {
    // "too cheap"/"cheap" are cumulated downwards: still cheap at or below the
    // stated price. "expensive"/"too expensive" cumulate upwards.
    if (key === 'tooCheap' && r.vwTooCheap >= priceCents) hits += 1;
    else if (key === 'cheap' && r.vwCheap >= priceCents) hits += 1;
    else if (key === 'expensive' && r.vwExpensive <= priceCents) hits += 1;
    else if (key === 'tooExpensive' && r.vwTooExpensive <= priceCents) hits += 1;
  }
  return hits / responses.length;
}

/**
 * Where two Van Westendorp curves cross, in cents, or null if they never do.
 *
 * Both curves in every pair we use are "decreasing minus increasing", so the
 * difference runs from positive to negative exactly once — but it can pass through
 * a *plateau of zeros* rather than a single crossing point. That happens whenever a
 * whole price range is rejected by nobody: between the last price anyone called too
 * cheap and the first price anyone called too expensive, both curves sit at 0.
 * Interpolating the first zero would report the bottom of that plateau as the
 * optimal price, which is wrong by a wide margin — the honest reading of a plateau
 * is its midpoint, so that is what this returns.
 */
function intersect(
  responses: readonly PricingResponse[],
  a: CurveKey,
  b: CurveKey,
  grid: readonly number[]
): number | null {
  const diffs = grid.map((price) => curveValue(responses, a, price) - curveValue(responses, b, price));

  const firstSigned = diffs.find((d) => d !== 0);
  if (firstSigned === undefined) return null; // the curves never separate at all
  const startPositive = firstSigned > 0;

  let lastSameSign = -1;
  for (let i = 0; i < diffs.length; i += 1) {
    const d = diffs[i];
    if (d === undefined || d === 0) continue;
    const positive = d > 0;
    if (positive === startPositive) {
      lastSameSign = i;
      continue;
    }
    if (lastSameSign === -1) return null; // opposite sign before the curves ever separate

    const before = grid[lastSameSign];
    const after = grid[i];
    if (before === undefined || after === undefined) return null;

    if (i === lastSameSign + 1) {
      // A genuine crossing inside one segment — interpolate it.
      const d0 = diffs[lastSameSign];
      const d1 = d;
      if (d0 === undefined || d0 === d1) return before;
      return Math.round(before + (d0 / (d0 - d1)) * (after - before));
    }

    // A plateau of zeros between them: report its midpoint.
    const plateauStart = grid[lastSameSign + 1];
    const plateauEnd = grid[i - 1];
    if (plateauStart === undefined || plateauEnd === undefined) return before;
    return Math.round((plateauStart + plateauEnd) / 2);
  }
  return null; // the difference never flips sign
}

export function vanWestendorp(responses: readonly PricingResponse[]): VanWestendorpResult {
  const grid = [
    ...new Set(responses.flatMap((r) => [r.vwTooCheap, r.vwCheap, r.vwExpensive, r.vwTooExpensive])),
  ].sort((a, b) => a - b);

  const curve = grid.map((priceCents) => ({
    priceCents,
    tooCheap: curveValue(responses, 'tooCheap', priceCents),
    cheap: curveValue(responses, 'cheap', priceCents),
    expensive: curveValue(responses, 'expensive', priceCents),
    tooExpensive: curveValue(responses, 'tooExpensive', priceCents),
  }));

  return {
    n: responses.length,
    curve,
    pmcCents: intersect(responses, 'tooCheap', 'expensive', grid),
    pmeCents: intersect(responses, 'cheap', 'tooExpensive', grid),
    oppCents: intersect(responses, 'tooCheap', 'tooExpensive', grid),
    ippCents: intersect(responses, 'cheap', 'expensive', grid),
  };
}

/* --------------------------------------------------------------- Gabor-Granger */

export interface GaborGrangerRung {
  priceCents: number;
  buyers: number;
  acceptance: number;
  /** price × buyers, in cents — a revenue index across a fixed sample, not a forecast. */
  revenueIndexCents: number;
}

export interface GaborGrangerResult {
  n: number;
  ladder: GaborGrangerRung[];
  bestPriceCents: number | null;
  /** Respondents who said yes at a high rung but no at a lower one — inconsistent. */
  nonMonotonic: string[];
}

export function gaborGranger(responses: readonly PricingResponse[]): GaborGrangerResult {
  const ladder = GG_LADDER_CENTS.map((priceCents) => {
    const buyers = responses.filter((r) => r.gaborGranger.get(priceCents) === true).length;
    return {
      priceCents,
      buyers,
      acceptance: responses.length === 0 ? 0 : buyers / responses.length,
      revenueIndexCents: priceCents * buyers,
    };
  });

  const nonMonotonic = responses
    .filter((r) => {
      let sawNo = false;
      for (const cents of GG_LADDER_CENTS) {
        const yes = r.gaborGranger.get(cents) === true;
        if (!yes) sawNo = true;
        else if (sawNo) return true; // yes at a higher price after a no at a lower one
      }
      return false;
    })
    .map((r) => r.respondentId);

  const best = ladder.reduce<GaborGrangerRung | null>(
    (acc, rung) => (acc === null || rung.revenueIndexCents > acc.revenueIndexCents ? rung : acc),
    null
  );

  return { n: responses.length, ladder, bestPriceCents: best?.priceCents ?? null, nonMonotonic };
}

/* ------------------------------------------------------------------- rollups */

export interface SegmentSummary {
  segment: Segment;
  n: number;
  medianAcceptableCents: number | null;
  medianTooExpensiveCents: number | null;
  medianCurrentSpendCents: number | null;
  medianSeats: number | null;
  medianWorkspaces: number | null;
  planMix: Record<string, number>;
  medianDiscountAskPct: number | null;
  meanPayLikelihood: number | null;
}

export function summariseSegments(responses: readonly PricingResponse[]): SegmentSummary[] {
  return SEGMENTS.map((segment) => {
    const rows = responses.filter((r) => r.segment === segment);
    const planMix: Record<string, number> = {};
    for (const r of rows) planMix[r.planChoice] = (planMix[r.planChoice] ?? 0) + 1;
    const spend = rows.map((r) => r.currentSpendEurCents).filter((v): v is number => v !== null);
    return {
      segment,
      n: rows.length,
      // "Acceptable" here is the respondent's own indifference point: the midpoint
      // of the band they described as neither a bargain nor expensive.
      medianAcceptableCents: median(rows.map((r) => Math.round((r.vwCheap + r.vwExpensive) / 2))),
      medianTooExpensiveCents: median(rows.map((r) => r.vwTooExpensive)),
      medianCurrentSpendCents: median(spend),
      medianSeats: median(rows.map((r) => r.seatsNeeded)),
      medianWorkspaces: median(rows.map((r) => r.workspacesNeeded)),
      planMix,
      medianDiscountAskPct: median(rows.map((r) => r.convertDiscountPct)),
      meanPayLikelihood: mean(rows.map((r) => r.payLikelihood)),
    };
  }).filter((s) => s.n > 0);
}

export interface DemandCount {
  key: string;
  count: number;
  share: number;
}

function tally(responses: readonly PricingResponse[], pick: (r: PricingResponse) => string[]): DemandCount[] {
  const counts = new Map<string, number>();
  for (const r of responses) for (const key of pick(r)) counts.set(key, (counts.get(key) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count, share: responses.length === 0 ? 0 : count / responses.length }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export interface PricingReportData {
  n: number;
  rejected: RejectedRow[];
  status: DatasetStatus;
  statusNote: string;
  vw: VanWestendorpResult;
  gg: GaborGrangerResult;
  segments: SegmentSummary[];
  planMix: DemandCount[];
  addonDemand: DemandCount[];
  creditsEnough: DemandCount[];
  billingCycle: DemandCount[];
  currencyPref: DemandCount[];
  successFee: DemandCount[];
  eInvoiceShare: number;
  medianDiscountAskPct: number | null;
  discountAskP75Pct: number | null;
  meanPayLikelihood: number | null;
  /** Respondents scoring 8+ on "will you pay". */
  committedShare: number;
  comments: { respondentId: string; segment: Segment; comment: string }[];
}

function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? null;
}

export function buildReportData(parsed: ParsedResponses): PricingReportData {
  const responses = parsed.responses;
  const n = responses.length;
  return {
    n,
    rejected: parsed.rejected,
    status: parsed.status,
    statusNote: parsed.statusNote,
    vw: vanWestendorp(responses),
    gg: gaborGranger(responses),
    segments: summariseSegments(responses),
    planMix: tally(responses, (r) => [r.planChoice]),
    addonDemand: tally(responses, (r) => r.addons),
    creditsEnough: tally(responses, (r) => [r.creditsEnough]),
    billingCycle: tally(responses, (r) => [r.billingCycle]),
    currencyPref: tally(responses, (r) => [r.currencyPref]),
    successFee: tally(responses, (r) => [r.successFee]),
    eInvoiceShare: n === 0 ? 0 : responses.filter((r) => r.needsEInvoice).length / n,
    medianDiscountAskPct: median(responses.map((r) => r.convertDiscountPct)),
    discountAskP75Pct: percentile(
      responses.map((r) => r.convertDiscountPct),
      75
    ),
    meanPayLikelihood: mean(responses.map((r) => r.payLikelihood)),
    committedShare: n === 0 ? 0 : responses.filter((r) => r.payLikelihood >= 8).length / n,
    comments: responses
      .filter((r) => r.comment)
      .map((r) => ({ respondentId: r.respondentId, segment: r.segment, comment: r.comment })),
  };
}

/** €249 from 24900. Formatting only — never used for arithmetic. */
export function formatEur(cents: number | null): string {
  if (cents === null) return '—';
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(
    cents / 100
  );
}

/** Turkish convention puts the sign first: %89, not 89%. */
export function formatPct(fraction: number | null, digits = 0): string {
  if (fraction === null) return '—';
  return `%${(fraction * 100).toFixed(digits)}`;
}

/** Guards the CSV template against drifting from the questionnaire. */
export const ANALYSED_QUESTION_IDS: readonly string[] = PRICING_SURVEY_QUESTIONS.map((q) => q.id);
