import type { PrismaClient } from '@prisma/client';

import { prisma } from '../src/lib/db';
import { round1, rubricProblems, type RubricDef } from '../src/modules/m17/rubric';
import { rubricProfileSchema } from '../src/modules/m17/rubric-schema';
import { RUBRIC_SELECT, rubricDef, toRubricView } from '../src/modules/m17/server/rubrics';
import { INTERREG_RUBRICS, type InterregRubricSeed } from './seed-data/interreg-rubrics';

/**
 * M17 assessment grids (FO-186). Platform reference data, needed in every
 * environment (an analysis cannot be created without a rubric), not demo data.
 *
 * Idempotent: rubrics upsert on `id`, criteria on (rubricId, criterionKey); a
 * second run rewrites the same rows. Written as the owning role: fabrika_app may
 * only read these tables.
 *
 * A published grid is not re-scored in place (crw2 B1): analyses and marks point
 * at it. When the id already exists, its scoring — maxRaw, passRaw, allowedMarks,
 * the criterion keys and each one's maxMark and knockoutBelow — must be what the
 * data says; otherwise the seed stops and asks for a new id. Texts (names,
 * sub-questions, sources) may be corrected in place. After the write the rubric
 * is read back from the database and checked again, so a value the column cannot
 * hold (Decimal(4,1)) or a criterion left over from an earlier run cannot slip
 * through; one transaction per rubric, so a refused rubric leaves no trace.
 */

/** The parts of a grid a score depends on, in a form two grids can be compared by. */
function scoringOf(def: RubricDef): string {
  return JSON.stringify({
    maxRaw: round1(def.maxRaw),
    passRaw: def.passRaw === null ? null : round1(def.passRaw),
    allowedMarks: [...def.allowedMarks].sort((x, y) => x - y),
    criteria: [...def.criteria]
      .sort((x, y) => x.criterionKey.localeCompare(y.criterionKey))
      .map((c) => [c.criterionKey, c.maxMark, c.knockoutBelow]),
  });
}

function defOfSeed(r: InterregRubricSeed): RubricDef {
  return {
    id: r.id,
    allowedMarks: r.allowedMarks,
    maxRaw: r.maxRaw,
    passRaw: r.passRaw,
    criteria: r.criteria.map(({ criterionKey, maxMark, knockoutBelow }) => ({ criterionKey, maxMark, knockoutBelow })),
  };
}

export class RubricSeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RubricSeedError';
  }
}

export async function seedRubric(db: PrismaClient, r: InterregRubricSeed): Promise<void> {
  // The zod profile (FO-188) includes rubricProblems: field shapes and the totals in one check.
  const parsed = rubricProfileSchema.safeParse(r);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.') || '(rubric)'}: ${i.message}`);
    throw new RubricSeedError(`Rubric ${r.id} is inconsistent: ${problems.join('; ')}`);
  }

  await db.$transaction(async (tx) => {
    const existing = await tx.interregRubric.findUnique({ where: { id: r.id }, select: RUBRIC_SELECT });
    if (existing && scoringOf(rubricDef(toRubricView(existing))) !== scoringOf(defOfSeed(r))) {
      throw new RubricSeedError(
        `Rubric ${r.id} already exists with a different scoring (maxRaw, passRaw, allowedMarks or criteria). ` +
          'Analyses point at it: give the revised grid a new id instead of editing this one.',
      );
    }

    const { criteria, ...rubric } = r;
    await tx.interregRubric.upsert({ where: { id: r.id }, update: rubric, create: rubric });
    for (const [position, c] of criteria.entries()) {
      const data = { ...c, position };
      await tx.interregRubricCriterion.upsert({
        where: { rubricId_criterionKey: { rubricId: r.id, criterionKey: c.criterionKey } },
        update: data,
        create: { ...data, rubricId: r.id },
      });
    }

    const stored = await tx.interregRubric.findUniqueOrThrow({ where: { id: r.id }, select: RUBRIC_SELECT });
    const storedDef = rubricDef(toRubricView(stored));
    const storedProblems = rubricProblems(storedDef);
    if (storedProblems.length || scoringOf(storedDef) !== scoringOf(defOfSeed(r))) {
      throw new RubricSeedError(
        `Rubric ${r.id} as stored differs from the data or is inconsistent: ` +
          (storedProblems.join('; ') || 'stored scoring ≠ seed scoring'),
      );
    }
  });
}

export default async function seedInterregRubrics(
  db: PrismaClient = prisma,
  rubrics: readonly InterregRubricSeed[] = INTERREG_RUBRICS,
) {
  for (const r of rubrics) await seedRubric(db, r);
  console.log(`  ↳ ${rubrics.length} Interreg rubric(s)`);
}
