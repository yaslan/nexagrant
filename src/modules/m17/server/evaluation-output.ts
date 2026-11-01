/**
 * The shape the M17 model answer must have (FO-188 §5), built from the grid the
 * analysis is assessed against: one mark per criterion of that grid, each on its
 * scale, one entry per programme check. The model gives marks, never a score —
 * `scoreMarks` computes the score from them.
 */
import { z } from 'zod';

import { marksSchema } from '../rubric-schema';
import type { RubricDef } from '../rubric';

const text = z.string().trim().min(1);

export const PROGRAM_CHECK_STATUSES = ['met', 'missing', 'unclear'] as const;
export type ProgramCheckStatus = (typeof PROGRAM_CHECK_STATUSES)[number];

const evidenceSchema = z.object({ quote: text, location: text });

/** What a grid needs to validate an answer: its scoring and its programme check keys. */
export interface EvaluationGrid {
  def: RubricDef;
  programCheckKeys: readonly string[];
}

export function evaluationOutputSchema(grid: EvaluationGrid) {
  const keys = grid.def.criteria.map((c) => c.criterionKey);
  const known = new Set(keys);
  const checkKeys = new Set(grid.programCheckKeys);
  const marks = marksSchema(grid.def);

  return z
    .object({
      rubricId: z.literal(grid.def.id),
      callGridNote: z.string().trim().nullable().optional(),
      criterionMarks: z.array(
        z.object({
          criterionKey: text,
          mark: z.number(),
          strengths: z.array(text),
          weaknesses: z.array(text),
          evidence: z.array(evidenceSchema).min(1),
        }),
      ),
      programChecks: z.array(z.object({ key: text, status: z.enum(PROGRAM_CHECK_STATUSES), note: text })),
      redFlags: z.array(z.object({ finding: text, why: text, fix: text })),
      improvements: z.array(z.object({ criterionKey: text, suggestion: text })),
      rewrite: z.object({ originalExcerpt: text, location: text, revisedEn: text }),
    })
    .superRefine((o, ctx) => {
      const seen = o.criterionMarks.map((m) => m.criterionKey);
      const dup = seen.filter((k, i) => seen.indexOf(k) !== i);
      if (dup.length) ctx.addIssue({ code: 'custom', message: `duplicate criterionKey: ${dup.join(', ')}`, path: ['criterionMarks'] });
      // Missing, extra and off-scale marks: the same check the score path applies.
      const parsed = marks.safeParse(Object.fromEntries(o.criterionMarks.map((m) => [m.criterionKey, m.mark])));
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          ctx.addIssue({ code: 'custom', message: `${issue.path.join('.') || 'marks'}: ${issue.message}`, path: ['criterionMarks'] });
        }
      }
      const checks = o.programChecks.map((c) => c.key);
      for (const k of checkKeys) {
        if (!checks.includes(k)) ctx.addIssue({ code: 'custom', message: `missing programme check ${k}`, path: ['programChecks'] });
      }
      for (const k of checks) {
        if (!checkKeys.has(k)) ctx.addIssue({ code: 'custom', message: `unknown programme check ${k}`, path: ['programChecks'] });
      }
      for (const [i, imp] of o.improvements.entries()) {
        if (!known.has(imp.criterionKey)) {
          ctx.addIssue({ code: 'custom', message: `unknown criterionKey ${imp.criterionKey}`, path: ['improvements', i] });
        }
      }
    })
    .transform((o) => ({
      ...o,
      callGridNote: o.callGridNote || null,
      // Grid order, whatever order the model answered in.
      criterionMarks: keys.map((k) => o.criterionMarks.find((m) => m.criterionKey === k)!),
    }));
}

export type EvaluationOutput = z.output<ReturnType<typeof evaluationOutputSchema>>;

export type ParseEvaluationResult =
  | { ok: true; output: EvaluationOutput }
  | { ok: false; problems: string[] };

/**
 * The model's text → a checked answer. Tolerates a Markdown fence or a sentence
 * around the object (the prompt forbids both; models still do it), nothing more:
 * everything inside the object must match the schema.
 */
export function parseEvaluation(raw: string, grid: EvaluationGrid): ParseEvaluationResult {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return { ok: false, problems: ['no JSON object in the answer'] };
  let json: unknown;
  try {
    json = JSON.parse(raw.slice(start, end + 1));
  } catch (e) {
    return { ok: false, problems: [`invalid JSON: ${(e as Error).message}`] };
  }
  const parsed = evaluationOutputSchema(grid).safeParse(json);
  if (!parsed.success) {
    return { ok: false, problems: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) };
  }
  return { ok: true, output: parsed.data };
}
