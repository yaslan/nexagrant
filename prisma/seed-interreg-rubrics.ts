import { prisma } from '../src/lib/db';
import { rubricProblems } from '../src/modules/m17/rubric';
import { INTERREG_RUBRICS } from './seed-data/interreg-rubrics';

/**
 * M17 assessment grids (FO-186). Platform reference data, needed in every
 * environment (an analysis cannot be created without a rubric), not demo data.
 *
 * Idempotent: rubrics upsert on `id`, criteria on (rubricId, criterionKey); a
 * second run rewrites the same rows. A criterion dropped from the data is not
 * deleted here (marks may point at it, FK RESTRICT) — a revised grid is a new
 * rubric id. Written as the owning role: fabrika_app may only read these tables.
 */
export default async function seedInterregRubrics() {
  for (const r of INTERREG_RUBRICS) {
    const problems = rubricProblems(r);
    if (problems.length) throw new Error(`Rubric ${r.id} is inconsistent: ${problems.join('; ')}`);

    const { criteria, ...rubric } = r;
    await prisma.interregRubric.upsert({ where: { id: r.id }, update: rubric, create: rubric });
    for (const [position, c] of criteria.entries()) {
      const data = { ...c, position };
      await prisma.interregRubricCriterion.upsert({
        where: { rubricId_criterionKey: { rubricId: r.id, criterionKey: c.criterionKey } },
        update: data,
        create: { ...data, rubricId: r.id },
      });
    }
  }
  console.log(`  ↳ ${INTERREG_RUBRICS.length} Interreg rubric(s)`);
}
