/**
 * Zod shapes of the M17 rubric (FO-188 Faz A, FO-187 §5.2): one for a grid
 * profile as the seed writes it, one for the set of marks a run hands to
 * `scoreMarks`. Both read every number from the grid — the scale, each
 * criterion's maximum, which keys exist — none is written here.
 *
 * `rubricProblems` (./rubric.ts) still checks what zod cannot say in a field:
 * that the maxima add up to `maxRaw`, that a knockout floor can trigger.
 */
import { z } from 'zod';

import { round1, rubricProblems, type RubricDef } from './rubric';

const nonEmpty = z.string().trim().min(1);
/** A mark or threshold on the grid's scale: positive, at most one decimal. */
const mark = z.number().positive().refine((n) => round1(n) === n, { message: 'at most one decimal' });

export const rubricCriterionSchema = z
  .object({
    criterionKey: z.string().regex(/^[a-z][a-z0-9_]*$/),
    officialRef: z.string().regex(/^\d+(\.\d+)*$/),
    section: nonEmpty,
    group: z.enum(['strategic', 'operational']),
    name: nonEmpty,
    maxMark: mark,
    knockoutBelow: mark.nullable(),
    subQuestions: z.array(nonEmpty).min(1),
    afSections: z.array(nonEmpty).min(1),
    evidenceExpectation: nonEmpty,
  })
  .strict();

export const rubricProfileSchema = z
  .object({
    // Lower-case slug segments joined by "." or "-" (interreg-next-bsb.call2.regular).
    id: z.string().regex(/^[a-z0-9]+([.-][a-z0-9]+)*$/),
    programme: nonEmpty,
    label: nonEmpty,
    isDefault: z.boolean(),
    allowedMarks: z.array(mark).min(1),
    maxRaw: mark,
    passRaw: mark.nullable(),
    budgetMinMinor: z.number().int().nonnegative().nullable(),
    budgetMaxMinor: z.number().int().positive().nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
    maxDurationMonths: z.number().int().positive().nullable(),
    source: z.record(z.string(), nonEmpty),
    tieBreak: z.array(z.string().regex(/^(section|criterion):[a-z0-9_]+$/)),
    programChecks: z.array(z.object({ key: z.string().regex(/^[a-z0-9_]+$/), rule: nonEmpty, source: nonEmpty }).strict()),
    criteria: z.array(rubricCriterionSchema).min(1),
  })
  .strict()
  .superRefine((r, ctx) => {
    const def: RubricDef = {
      id: r.id,
      allowedMarks: r.allowedMarks,
      maxRaw: r.maxRaw,
      passRaw: r.passRaw,
      criteria: r.criteria.map(({ criterionKey, maxMark, knockoutBelow }) => ({ criterionKey, maxMark, knockoutBelow })),
    };
    for (const problem of rubricProblems(def)) ctx.addIssue({ code: 'custom', message: problem });
    if (r.budgetMinMinor !== null && r.budgetMaxMinor !== null && r.budgetMinMinor > r.budgetMaxMinor) {
      ctx.addIssue({ code: 'custom', message: 'budgetMinMinor > budgetMaxMinor', path: ['budgetMinMinor'] });
    }
    if ((r.budgetMinMinor !== null || r.budgetMaxMinor !== null) && r.currency === null) {
      ctx.addIssue({ code: 'custom', message: 'a budget range needs a currency', path: ['currency'] });
    }
    const keys = new Set(r.criteria.map((c) => c.criterionKey));
    for (const [i, tb] of r.tieBreak.entries()) {
      const [kind, key] = tb.split(':');
      const known = kind === 'criterion' ? keys.has(key!) : r.criteria.some((c) => c.section === key);
      if (!known) ctx.addIssue({ code: 'custom', message: `tieBreak ${tb} names nothing in the grid`, path: ['tieBreak', i] });
    }
  });

export type RubricProfile = z.infer<typeof rubricProfileSchema>;

/**
 * Exactly one mark per criterion of `def`, each one of `allowedMarks` and not
 * above that criterion's maximum. A missing or an extra `criterionKey` is a zod
 * error, so a half-marked answer never reaches `scoreMarks`.
 */
export function marksSchema(def: RubricDef) {
  const shape: Record<string, z.ZodType<number>> = {};
  for (const c of def.criteria) {
    shape[c.criterionKey] = z
      .number()
      .refine((n) => def.allowedMarks.includes(n), { message: `not one of ${def.allowedMarks.join(', ')}` })
      .refine((n) => n <= c.maxMark, { message: `above the criterion maximum ${c.maxMark}` });
  }
  return z.object(shape).strict();
}
