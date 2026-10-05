/**
 * Funding-readiness scoring — pure and deterministic, no AI call (no credits spent).
 *
 * `scoreReadiness(answers, orgType)` turns the 15 answers of questions.ts into a
 * 0–100 total, a 0–100 score per dimension, a level, the list of gaps with a concrete
 * next step, and the 3 programmes from se-fb's public-sector catalogue that best fit
 * the answers. The catalogue is only READ here (src/lib/public-sector/ is not ours).
 */

import {
  PUBLIC_SECTOR_ORG_TYPES,
  PUBLIC_SECTOR_PROGRAMMES,
  coversTurkishProvince,
  isOpenToTurkishApplicants,
  type PublicOrgType,
  type PublicSectorProgramme,
} from '@/lib/public-sector/catalog';
import type { TrProvince } from './provinces';
import {
  MAX_POINTS_PER_QUESTION,
  READINESS_DIMENSIONS,
  READINESS_QUESTIONS,
  type AnswerValue,
  type ReadinessAnswers,
  type ReadinessDimension,
} from './questions';

export type ProgrammeKey = PublicSectorProgramme['key'];
export type ReadinessOrgType = PublicOrgType;
export const READINESS_ORG_TYPES = PUBLIC_SECTOR_ORG_TYPES;

export type ReadinessLevel = 'baslangic' | 'gelisen' | 'hazir';

export interface GapItem {
  questionId: string;
  dimension: ReadinessDimension;
  /** `critical` = answered 0 (not in place), `improve` = answered 1 (partly). */
  severity: 'critical' | 'improve';
  /** Official guide for the step; the step text itself is `readiness.gaps.<questionId>`. */
  guideUrl: string | null;
}

export interface ReadinessResult {
  total0to100: number;
  byDimension: Record<ReadinessDimension, number>;
  level: ReadinessLevel;
  gaps: GapItem[];
  /** Up to 3 catalogue keys, best fit first. Fewer only if fewer programmes are applicable. */
  recommended: ProgrammeKey[];
}

/** A catalogue entry; tests pass a hand-made catalogue of the same shape. */
export type RecommendableProgramme = PublicSectorProgramme;

/** Who is taking the test: org type is required, the province only narrows territorial programmes. */
export interface ReadinessProfile {
  orgType: ReadinessOrgType;
  province?: TrProvince | null;
}

/** Level thresholds on the 0–100 total. */
export const LEVEL_THRESHOLDS = { gelisen: 40, hazir: 70 } as const;

/** The hardest programme a level is steered to without a penalty (catalogue difficulty 1–3). */
const COMFORT_DIFFICULTY: Record<ReadinessLevel, number> = {
  baslangic: 1,
  gelisen: 2,
  hazir: 3,
};

/** Share of the budget a "1 — up to about 20%" co-financing answer can carry. */
const PARTIAL_COFINANCING_PCT = 20;

export const RECOMMENDATION_COUNT = 3;

function points(answers: ReadinessAnswers, id: string): AnswerValue {
  return answers[id] ?? 0;
}

function percent(got: number, max: number): number {
  return max === 0 ? 0 : Math.round((got / max) * 100);
}

export function levelFor(total0to100: number): ReadinessLevel {
  if (total0to100 >= LEVEL_THRESHOLDS.hazir) return 'hazir';
  if (total0to100 >= LEVEL_THRESHOLDS.gelisen) return 'gelisen';
  return 'baslangic';
}

/**
 * How well one programme fits. Higher is better; only the ORDER matters.
 *
 * - Difficulty above what the level is comfortable with costs the most: a first-time
 *   municipality is steered to the easy entry programmes (CERV, Erasmus+) first.
 * - Inside the comfort zone the level sets the direction: a ready organisation is
 *   pointed at the larger (harder) programmes, a starting one at the easiest.
 * - Hard requirements the answers say are missing (transnational partners, co-financing,
 *   a PIC) cost in proportion to how far away they are.
 */
function fitScore(p: RecommendableProgramme, answers: ReadinessAnswers, level: ReadinessLevel): number {
  let s = 0;

  const comfort = COMFORT_DIFFICULTY[level];
  if (p.difficulty > comfort) s -= 10 * (p.difficulty - comfort);
  if (level === 'hazir') s += 3 * p.difficulty;
  else if (level === 'baslangic') s -= 3 * p.difficulty;
  else s -= 3 * Math.abs(p.difficulty - 2);

  if (p.needsPartners === 'transnational') {
    const abroad = Math.max(points(answers, 'twinCity'), points(answers, 'network'));
    if (abroad === 0) s -= 8;
    else if (abroad === 1) s -= 3;
  } else if (p.needsPartners === 'national' && points(answers, 'localStakeholders') === 0) {
    s -= 4;
  }

  if (p.cofinancingPct !== null && p.cofinancingPct > 0) {
    const cof = points(answers, 'cofinancing');
    if (cof === 0) s -= 8;
    else if (cof === 1 && p.cofinancingPct > PARTIAL_COFINANCING_PCT) s -= 4;
  }

  if (p.needsPic) {
    const pic = points(answers, 'pic');
    if (pic === 0) s -= 4;
    else if (pic === 1) s -= 2;
  }

  // Türkiye's participation depends on each year's call (e.g. DUT's national funders):
  // still worth showing, but after programmes that are certainly open.
  if (p.turkeyEligibility === 'check_call') s -= 5;

  return s;
}

/**
 * Can this profile apply at all? Programmes Türkiye does not participate in (CERV, LIFE
 * per the official country lists) are never recommended, and a territorial programme
 * (OKA, Interreg) only when the chosen province is inside its area — with no province
 * given, territorial programmes are left out rather than guessed.
 */
function isApplicable(p: RecommendableProgramme, profile: ReadinessProfile): boolean {
  if (!p.eligibleOrgTypes.includes(profile.orgType)) return false;
  if (!isOpenToTurkishApplicants(p)) return false;
  if (p.turkeyRegions === null) return true;
  return profile.province ? coversTurkishProvince(p, profile.province) : false;
}

export function recommendProgrammes(
  answers: ReadinessAnswers,
  profile: ReadinessProfile,
  level: ReadinessLevel,
  catalog: readonly RecommendableProgramme[],
): ProgrammeKey[] {
  return (
    catalog
      .map((p, index) => ({ p, index }))
      .filter(({ p }) => isApplicable(p, profile))
      .map(({ p, index }) => ({
        key: p.key,
        index,
        fit: fitScore(p, answers, level),
      }))
      // Stable on ties: the catalogue order is the curator's own preference.
      .sort((a, b) => b.fit - a.fit || a.index - b.index)
      .slice(0, RECOMMENDATION_COUNT)
      .map(({ key }) => key)
  );
}

/**
 * Scores a completed (or partly completed) check. An unanswered question counts as 0,
 * i.e. "not in place" — the conservative reading; the UI only calls this once every
 * question is answered.
 */
export function scoreReadiness(
  answers: ReadinessAnswers,
  orgType: ReadinessOrgType,
  options: {
    province?: TrProvince | null;
    catalog?: readonly RecommendableProgramme[];
  } = {},
): ReadinessResult {
  const catalog = options.catalog ?? PUBLIC_SECTOR_PROGRAMMES;
  const byDimension = {} as Record<ReadinessDimension, number>;
  let total = 0;
  for (const dimension of READINESS_DIMENSIONS) {
    const qs = READINESS_QUESTIONS.filter((q) => q.dimension === dimension);
    const got = qs.reduce((sum, q) => sum + points(answers, q.id), 0);
    total += got;
    byDimension[dimension] = percent(got, qs.length * MAX_POINTS_PER_QUESTION);
  }
  const total0to100 = percent(total, READINESS_QUESTIONS.length * MAX_POINTS_PER_QUESTION);
  const level = levelFor(total0to100);

  const gaps: GapItem[] = READINESS_QUESTIONS.flatMap((q): GapItem[] => {
    const value = points(answers, q.id);
    if (value === MAX_POINTS_PER_QUESTION) return [];
    return [
      {
        questionId: q.id,
        dimension: q.dimension,
        severity: value === 0 ? 'critical' : 'improve',
        guideUrl: q.guideUrl,
      },
    ];
  }).sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1));

  return {
    total0to100,
    byDimension,
    level,
    gaps,
    recommended: recommendProgrammes(answers, { orgType, province: options.province }, level, catalog),
  };
}
