/**
 * FB KAMU B11 (TASK-MULRSG6T55LO0) — write the three public-sector packages
 * into a database without re-running the whole seed.
 *
 * `prisma/seed.ts` calls the same function; this entry point exists because a
 * full seed also resets demo data, which a shared dev database should not get
 * as a side effect of adding three plans. Idempotent — run it twice and the
 * second run changes nothing.
 *
 * Rollback (no subscription may point at them first — `deletePlan` refuses
 * otherwise):
 *   DELETE FROM "PlanFeature" WHERE "planVersionId" IN
 *     ('pv_public-starter_1','pv_public-team_1','pv_public-institution_1');
 *   DELETE FROM "PlanVersion" WHERE "planId" IN ('public-starter','public-team','public-institution');
 *   DELETE FROM "PlanAssignment" WHERE "planId" IN ('public-starter','public-team','public-institution');
 *   DELETE FROM "Plan" WHERE id IN ('public-starter','public-team','public-institution');
 *
 * Usage: pnpm db:seed-public-sector-plans
 */
import 'dotenv/config';
import { prisma } from '@/lib/db';
import { upsertPublicSectorPlans } from '@/lib/billing/public-sector-plans';

async function main() {
  const written = await upsertPublicSectorPlans(prisma);
  const rows = await prisma.planVersion.findMany({
    where: { planId: { in: written }, version: 1 },
    orderBy: { yearlyCents: 'asc' },
    select: {
      planId: true,
      status: true,
      yearlyCents: true,
      currency: true,
      seats: true,
      modules: true,
      _count: { select: { features: true } },
    },
  });
  console.log(JSON.stringify(rows, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
