import { z } from 'zod';
import { errorMessage as coreErrorMessage } from '@/lib/errors';

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
    /** NG-52: the call's minimum consortium, when its text states one (parseMinimumConsortium). */
    minPartners: z.number().int().positive().optional(),
    minCountries: z.number().int().positive().optional(),
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

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};
const NUM = '(\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)';
const PARTNER_NOUN = '(?:legal entities|entities|organisations|organizations|partners|participants|applicants|beneficiaries|institutions)';
const MIN_PARTNERS = new RegExp(`(?:at least|a minimum of|minimum of|minimum)\\s+${NUM}\\s+(?:[a-z-]+\\s+){0,3}?${PARTNER_NOUN}`, 'i');
/**
 * "N different countries". Group 1 is an upper-bound qualifier in front of N ("up to",
 * "no more than", "at most", "maximum of", "max."…): such a match is a cap, not a
 * minimum, and is skipped (CRW NG-186 bulgu 2). Global, so a later true minimum in the
 * same text is still found.
 */
const MIN_COUNTRIES = new RegExp(
  `(?:\\b(up to|no more than|not more than|at most|(?:a\\s+)?maximum(?:\\s+of)?|max\\.?)\\s+(?:\\([^)]{0,20}\\)\\s+)?)?\\b${NUM}\\s+different\\s+(?:[a-z-]+\\s+){0,3}?(?:countries|member states|states)`,
  'gi'
);

function readMinCountries(text: string): number | undefined {
  for (const m of text.matchAll(MIN_COUNTRIES)) {
    if (m[1]) continue;
    const n = readNumber(m[2]);
    if (n) return n;
  }
  return undefined;
}
const EACH_IN_DIFFERENT = /each\s+(?:[a-z-]+\s+){0,3}?(?:established|located|based)\s+in\s+a\s+different\s+(?:[a-z-]+\s+){0,3}?(?:country|member state|state)/i;

function readNumber(token: string | undefined): number | undefined {
  if (!token) return undefined;
  const n = /^\d+$/.test(token) ? Number(token) : NUMBER_WORDS[token.toLowerCase()];
  return n && n > 0 ? n : undefined;
}

/**
 * NG-52 — the call's minimum consortium as the call text states it
 * ("at least three independent legal entities, each established in a different
 * country", "minimum 4 organisations from 3 different eligible countries").
 * Specification §4 lists "asgari ortak" as a field of the call; this is where it
 * comes from. Returns only the keys it found: a text that states no threshold
 * gives `{}`, never a default.
 */
export function parseMinimumConsortium(text: string): { minPartners?: number; minCountries?: number } {
  if (!text) return {};
  const out: { minPartners?: number; minCountries?: number } = {};
  const partners = readNumber(MIN_PARTNERS.exec(text)?.[1]);
  if (partners) out.minPartners = partners;
  const countries = readMinCountries(text);
  if (countries) out.minCountries = countries;
  else if (partners && EACH_IN_DIFFERENT.test(text)) out.minCountries = partners;
  return out;
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

/**
 * Adapter flavour of {@link coreErrorMessage}: falls back to `String(e)` so a
 * non-Error rejection still lands something readable in `AdapterResult.reason`.
 */
export function errorMessage(e: unknown): string {
  return coreErrorMessage(e, String(e));
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
