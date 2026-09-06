import { z } from 'zod';

/**
 * Shared contracts for the K1 call-aggregation adapters (SEDIA, Eurostars, TÜBİTAK).
 *
 * Every adapter normalizes its own upstream payload into `BaseTopic` and reports
 * back through `AdapterResult`, so the daily job can treat all sources alike.
 */

export const DeadlineSchema = z.object({
  stage: z.number(),
  at: z.string(),
  tz: z.string(),
});

export type Deadline = z.infer<typeof DeadlineSchema>;

/**
 * `eligibleCountries` is the inferred allow-list ([] = no restriction detected).
 * `countriesExcluded` is the deny-list. `restricted` is the coarse label used by
 * the G0 gate ("EU_EEA_CH_ONLY", "TR", null).
 */
export const EligibilitySchema = z
  .object({
    restricted: z.string().nullable().optional(),
    eligibleCountries: z.array(z.string()).default([]),
    countriesExcluded: z.array(z.string()).default([]),
    notes: z.string().optional(),
  })
  .default({ restricted: null, eligibleCountries: [], countriesExcluded: [] });

export type Eligibility = z.infer<typeof EligibilitySchema>;

export const BaseTopicSchema = z.object({
  identifier: z.string(),
  title: z.string(),
  status: z.enum(['FORTHCOMING', 'OPEN', 'CLOSED']),
  typeOfAction: z.string().optional(),
  frameworkProgramme: z.string().optional(),
  callIdentifier: z.string().optional(),
  callTitle: z.string().optional(),
  isLumpSum: z.boolean().default(false),
  isTwoStage: z.boolean().default(false),
  budgetPerProjectCents: z.number().optional(),
  numProjects: z.number().optional(),
  deadlines: z.array(DeadlineSchema).default([]),
  nextDeadlineAt: z.string().optional().nullable(),
  /** ISO date the call opens (SEDIA `startDate` / budgetOverview `plannedOpeningDate`). */
  plannedOpeningDate: z.string().optional().nullable(),
  /** today − callDate, in whole days. Positive = already open, negative = forthcoming. */
  ageInDays: z.number().int().nullable().default(null),
  eligibility: EligibilitySchema,
  destination: z.string().optional(),
  keywords: z.array(z.string()).default([]),
  description: z.string().optional(),
  sourceUrl: z.string().optional(),
});

export type BaseTopic = z.infer<typeof BaseTopicSchema>;

// ───────────────────────── eligibility inference ─────────────────────────

/** Countries an "EU/EEA/CH only" restriction resolves to. */
export const EU_EEA_CH: readonly string[] = ['EU', 'EEA', 'CH'];

const EU_ONLY_PATTERNS: RegExp[] = [
  /EU\s*\/\s*EEA\s*\/\s*CH\s+only/i,
  /European Union.*European Economic Area.*Switzerland/i,
  /limited to EU.*EEA.*CH/i,
  /restricted to European member states/i,
  /only.*European Union/i,
];

export function detectEuOnlyEligibility(text: string): boolean {
  if (!text) return false;
  return EU_ONLY_PATTERNS.some((p) => p.test(text));
}

/**
 * Turn free text into an eligibility record. Returns `null` when no restriction
 * is detected, so callers can keep whatever they already inferred.
 */
export function inferEligibilityFromText(text: string): Eligibility | null {
  if (!detectEuOnlyEligibility(text)) return null;
  return {
    restricted: 'EU_EEA_CH_ONLY',
    eligibleCountries: [...EU_EEA_CH],
    countriesExcluded: [],
    notes: 'EU/EEA/CH only — inferred from the call text',
  };
}

/** Eligibility record for a source that is bound to a single country. */
export function countryEligibility(country: string, notes: string): Eligibility {
  return {
    restricted: country,
    eligibleCountries: [country],
    countriesExcluded: [],
    notes,
  };
}

export const OPEN_ELIGIBILITY: Eligibility = {
  restricted: null,
  eligibleCountries: [],
  countriesExcluded: [],
};

// ───────────────────────── lump sum / two stage ─────────────────────────

export function detectLumpSum(...texts: (string | undefined | null)[]): boolean {
  return texts.some((t) => !!t && /lump\s*sum/i.test(t));
}

export function detectTwoStage(...texts: (string | undefined | null)[]): boolean {
  return texts.some((t) => !!t && /two[-\s]?stage/i.test(t));
}

// ───────────────────────── age ─────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * `today − callDate` in whole days. `null` when the call date is unknown or
 * unparseable, so a missing upstream field never becomes a bogus 0.
 */
export function computeAgeInDays(
  callDate: string | Date | null | undefined,
  now: Date = new Date()
): number | null {
  if (!callDate) return null;
  const d = callDate instanceof Date ? callDate : new Date(callDate);
  const t = d.getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / MS_PER_DAY);
}

// ───────────────────────── adapter result envelope ─────────────────────────

export type AdapterStatus = 'ok' | 'error';

/**
 * What every `fetch*Topics()` returns. Adapters never throw: a dead upstream is
 * `{ status: 'error', reason, topicsProcessed: 0 }` so the daily job keeps going
 * with the sources that did answer.
 */
export interface AdapterResult<T> {
  status: AdapterStatus;
  source: string;
  topics: T[];
  topicsProcessed: number;
  reason?: string;
  /**
   * Upstream shape problems (missing required field, unexpected envelope).
   * Non-empty means the caller should raise a SystemAlert — not fail the run.
   */
  schemaDrift: string[];
}

export function adapterOk<T>(
  source: string,
  topics: T[],
  schemaDrift: string[] = []
): AdapterResult<T> {
  return { status: 'ok', source, topics, topicsProcessed: topics.length, schemaDrift };
}

export function adapterError<T>(
  source: string,
  reason: string,
  schemaDrift: string[] = []
): AdapterResult<T> {
  return { status: 'error', source, topics: [], topicsProcessed: 0, reason, schemaDrift };
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Strip HTML tags and collapse whitespace — SEDIA ships rich text in metadata. */
export function stripHtml(input: string | undefined | null): string {
  if (!input) return '';
  return input
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}
