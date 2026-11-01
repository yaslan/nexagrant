/**
 * M6 Evaluator Lens — input contracts.
 *
 * These live outside `actions.ts` because a `'use server'` module may only export async
 * functions; the schemas and error classes below are ordinary values, and exporting them
 * from the actions file is a build error. Keeping them here also lets the unit tests
 * exercise validation without pulling in the session or the database.
 */

import { z } from 'zod';

import { MAX_SCORE, MIN_SCORE } from '../types';

/** Ids are cuids from our own tables; reject anything that cannot be one. */
export const idSchema = z.string().trim().min(1).max(64);

/** The 0.0–5.0 REA criterion scale used by the single-reader (HUMAN/AI) lens. */
const reaScore = z.number().finite().min(0).max(5);

/** Free-text bullet lists shown back to the user; bounded so a paste cannot blow up the row. */
const bulletList = z.array(z.string().trim().min(1).max(500)).max(20);

/** An ESR panel total is scored out of 15; a value outside that is a typo, not a data point. */
export const ESR_TOTAL_MIN = 0;
export const ESR_TOTAL_MAX_INPUT = 15;

export const saveHumanEvaluationSchema = z.object({
  opportunityId: idSchema,
  excellence: reaScore,
  impact: reaScore,
  implementation: reaScore,
  weaknesses: bulletList.default([]),
  strengths: bulletList.default([]),
});

export const calibrateEsrSchema = z.object({
  evaluationId: idSchema,
  actualScore: z.number().finite().min(ESR_TOTAL_MIN).max(ESR_TOTAL_MAX_INPUT),
});

/**
 * Criterion *names*, not the DEFAULT_CRITERIA enum.
 *
 * An evaluation's axes are rows in `Criterion`, so a panel may legitimately be scored on
 * something other than the four defaults, and a reviewer may submit a subset. Keying the
 * record on a `z.enum` of the defaults made every criterion mandatory and rejected both
 * cases. The authoritative check is server-side in `saveEvaluation`, which matches each
 * name against that evaluation's own criteria and refuses anything it does not recognise.
 */
export const criterionKeySchema = z.string().trim().min(1).max(120);

export const saveEvaluationSchema = z.object({
  evaluationId: idSchema,
  proposalId: idSchema,
  scores: z
    .record(criterionKeySchema, z.number().int().min(MIN_SCORE).max(MAX_SCORE))
    .refine((s) => Object.keys(s).length > 0, { message: 'At least one criterion must be scored' }),
});

export const aiEvaluationSchema = z.object({
  excellence: reaScore,
  impact: reaScore,
  implementation: reaScore,
  strengths: bulletList,
  weaknesses: bulletList,
  recommendations: bulletList,
});

export type AiEvaluationResult = z.infer<typeof aiEvaluationSchema>;

export class EvaluationInputError extends Error {
  readonly code = 'M6_INVALID_INPUT';
  constructor(message: string) {
    super(message);
    this.name = 'EvaluationInputError';
  }
}

export class EvaluationNotFoundError extends Error {
  readonly code = 'M6_NOT_FOUND';
  constructor(message: string) {
    super(message);
    this.name = 'EvaluationNotFoundError';
  }
}

/** Validate or throw a message the UI can show verbatim. */
export function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new EvaluationInputError(
      first ? `${first.path.join('.') || 'input'}: ${first.message}` : 'Invalid evaluation input',
    );
  }
  return parsed.data;
}
