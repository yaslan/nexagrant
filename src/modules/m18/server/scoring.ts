import { z } from 'zod';

/**
 * NG-137 (M18-F2). Lead score: Fit / Need / Intent / Timing, each 0–100, weighted into one
 * 0–100 integer. Pure; the caller gathers the inputs and stores `total` on `Deal.leadScore`
 * and the breakdown on `Deal.scoreBreakdown`.
 *
 * Provenance (decision K-581471): the WEIGHTS are HibeLead's, read from its `settings`
 * row `score_weights` on 2026-11-13. The SUB-SCORE rules are new — HibeLead's
 * `scoring.ts` is gone — and every number is in the tables below, not in the code paths.
 */

export interface ScoreWeights {
  fit: number;
  need: number;
  intent: number;
  timing: number;
}

/** HibeLead `settings.score_weights`, recovered verbatim. */
export const DEFAULT_SCORE_WEIGHTS: Readonly<ScoreWeights> = Object.freeze({
  fit: 0.35,
  need: 0.25,
  intent: 0.25,
  timing: 0.15,
});

const WEIGHT_SUM_TOLERANCE = 0.001;

const weightsSchema = z
  .object({
    fit: z.number().finite().min(0).max(1),
    need: z.number().finite().min(0).max(1),
    intent: z.number().finite().min(0).max(1),
    timing: z.number().finite().min(0).max(1),
  })
  .strict()
  .refine((w) => Math.abs(w.fit + w.need + w.intent + w.timing - 1) <= WEIGHT_SUM_TOLERANCE, {
    message: 'weights must add up to 1',
  });

/**
 * Weights from tenant settings, or the defaults when there are none or they are invalid.
 * `source` says which, so a broken setting is visible instead of silently scoring.
 */
export function resolveScoreWeights(raw: unknown): { weights: ScoreWeights; source: 'settings' | 'default' } {
  if (raw === undefined || raw === null) return { weights: { ...DEFAULT_SCORE_WEIGHTS }, source: 'default' };
  const parsed = weightsSchema.safeParse(raw);
  return parsed.success
    ? { weights: parsed.data, source: 'settings' }
    : { weights: { ...DEFAULT_SCORE_WEIGHTS }, source: 'default' };
}

/** Need: what the client has told us it wants. Points add up to 100. */
export const NEED_POINTS = {
  projectIdeaStated: 50,
  readinessTestCompleted: 30,
  budgetNeedStated: 20,
} as const;

/**
 * Intent: what the client has done. Each kind counts once, however often it happened;
 * the sum is capped at 100. Kinds are `DealActivity.kind` codes, matched case-insensitively.
 */
export const INTENT_POINTS: Readonly<Record<string, number>> = {
  FORM: 40,
  MEETING: 30,
  EMAIL_IN: 20,
  EMAIL_CLICK: 10,
};

/**
 * Timing: days until the best-matching call's deadline. Too close is worse than far away:
 * a two-week window rarely leaves time to sign and write. First row whose `maxDays` holds wins.
 */
export const TIMING_BANDS: readonly { maxDays: number; points: number }[] = [
  { maxDays: 13, points: 40 },
  { maxDays: 30, points: 70 },
  { maxDays: 120, points: 100 },
];

/** More than 120 days out: real, but not this quarter's work. */
export const TIMING_FAR_POINTS = 60;

export interface LeadScoreInput {
  /** `fitScore` of the client's non-hard-failed `LeadMatch` rows. */
  matchFitScores: readonly number[];
  need: {
    projectIdeaStated: boolean;
    readinessTestCompleted: boolean;
    budgetNeedStated: boolean;
  };
  activityKinds: readonly string[];
  /** Whole days to the best match's deadline; `null` when no deadline is known. */
  daysToDeadline: number | null;
}

export interface LeadScoreBreakdown {
  fit: number;
  need: number;
  intent: number;
  timing: number;
  weights: ScoreWeights;
  total: number;
}

const clamp = (n: number) => Math.min(100, Math.max(0, n));

export function fitSubScore(matchFitScores: readonly number[]): number {
  const finite = matchFitScores.filter((n) => Number.isFinite(n));
  return finite.length === 0 ? 0 : clamp(Math.round(Math.max(...finite)));
}

export function needSubScore(need: LeadScoreInput['need']): number {
  return (
    (need.projectIdeaStated ? NEED_POINTS.projectIdeaStated : 0) +
    (need.readinessTestCompleted ? NEED_POINTS.readinessTestCompleted : 0) +
    (need.budgetNeedStated ? NEED_POINTS.budgetNeedStated : 0)
  );
}

export function intentSubScore(activityKinds: readonly string[]): number {
  const seen = new Set(activityKinds.map((k) => k.trim().toUpperCase()));
  let points = 0;
  for (const kind of seen) points += INTENT_POINTS[kind] ?? 0;
  return clamp(points);
}

export function timingSubScore(daysToDeadline: number | null): number {
  if (daysToDeadline === null || !Number.isFinite(daysToDeadline) || daysToDeadline < 0) return 0;
  for (const band of TIMING_BANDS) if (daysToDeadline <= band.maxDays) return band.points;
  return TIMING_FAR_POINTS;
}

export function scoreLead(input: LeadScoreInput, weights: ScoreWeights = DEFAULT_SCORE_WEIGHTS): LeadScoreBreakdown {
  const fit = fitSubScore(input.matchFitScores);
  const need = needSubScore(input.need);
  const intent = intentSubScore(input.activityKinds);
  const timing = timingSubScore(input.daysToDeadline);
  const total = clamp(
    Math.round(fit * weights.fit + need * weights.need + intent * weights.intent + timing * weights.timing)
  );
  return { fit, need, intent, timing, weights: { ...weights }, total };
}
