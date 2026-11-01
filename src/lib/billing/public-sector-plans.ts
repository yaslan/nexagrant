/**
 * FB KAMU B11 (TASK-MULRSG6T55LO0) — the public-sector packages as database
 * rows.
 *
 * The terms live in `PUBLIC_SECTOR_PLANS` (src/lib/billing/catalog.ts). This
 * file projects them onto `Plan` + `PlanVersion` v1 + `PlanFeature`, the same
 * three tables the plan studio and the entitlement check read, so a municipal
 * package is an ordinary plan everywhere except the shopfront.
 *
 * Idempotent: every write is an upsert keyed on a stable id, and the feature
 * rows of v1 are replaced as a set, so running it twice leaves the same rows.
 * Called from `prisma/seed.ts` and from `scripts/seed-public-sector-plans.ts`
 * (for a database that should not be fully re-seeded).
 */

import {
  PLAN_GRANTS,
  PUBLIC_SECTOR_PLANS,
  type PublicSectorPlan,
} from '@/lib/billing/catalog';

/** One card bullet, in both locales. */
export interface ServiceLine {
  textTr: string;
  textEn: string;
}

/**
 * The service terms of a package as card bullets — the "plan metadata" the
 * card asks for. `PlanFeature` rows of kind `text` are the only per-version
 * free-form slot the schema has, and the one the studio already edits, so no
 * column is added for them.
 */
export function serviceLines(plan: PublicSectorPlan): ServiceLine[] {
  const lines: ServiceLine[] = [
    { textTr: `${plan.seats} koltuk`, textEn: `${plan.seats} seats` },
  ];
  const { onboardingDays, trainingDays, reportCadence } = plan.services;
  if (onboardingDays > 0) {
    lines.push({
      textTr: `${onboardingDays} onboarding günü`,
      textEn: `${onboardingDays} onboarding day${onboardingDays === 1 ? '' : 's'}`,
    });
  }
  if (trainingDays > 0) {
    lines.push({
      textTr: `${trainingDays} eğitim günü`,
      textEn: `${trainingDays} training day${trainingDays === 1 ? '' : 's'}`,
    });
  }
  if (reportCadence === 'quarterly') {
    lines.push({ textTr: 'Çeyreklik kullanım raporu', textEn: 'Quarterly usage report' });
  } else if (reportCadence === 'monthly') {
    lines.push({ textTr: 'Aylık kullanım raporu', textEn: 'Monthly usage report' });
  }
  lines.push({ textTr: 'Yıllık sözleşme, KDV hariç', textEn: 'Annual contract, VAT excluded' });
  return lines;
}

/** The `Plan` / `PlanVersion` column values of one package. */
export function publicSectorPlanRow(plan: PublicSectorPlan) {
  const grant = PLAN_GRANTS.find((g) => g.planId === plan.planId);
  if (!grant) throw new Error(`No grant for public-sector plan ${plan.planId}`);
  return {
    id: plan.planId,
    name: plan.name,
    // Yearly only: a municipality contracts a year. 0 is "no monthly cycle",
    // and the plan never reaches a surface that would offer one.
    monthlyCents: 0,
    yearlyCents: plan.yearlyListMinor,
    currency: plan.currency,
    seats: grant.seats,
    workspaces: grant.workspaces,
    aiCreditsMonthly: grant.aiCreditsMonthly,
    modules: [...grant.moduleIds],
  };
}

/**
 * The delegates this needs. Typed structurally (not as `PrismaClient`) because
 * `prisma generate` does not run in this repo — see
 * src/types/prisma-override.d.ts — and so a test can pass a fake.
 */
export interface PublicSectorPlanWriter {
  plan: { upsert(args: unknown): Promise<unknown> };
  planVersion: { upsert(args: unknown): Promise<{ id: string }> };
  planFeature: {
    deleteMany(args: unknown): Promise<unknown>;
    createMany(args: unknown): Promise<unknown>;
  };
}

export async function upsertPublicSectorPlans(db: PublicSectorPlanWriter): Promise<string[]> {
  const written: string[] = [];
  for (const plan of PUBLIC_SECTOR_PLANS) {
    const row = publicSectorPlanRow(plan);
    await db.plan.upsert({
      where: { id: row.id },
      // Visibility is set on create only. `private` keeps the package off every
      // public list; an operator who later archives it must not see a re-seed
      // bring it back.
      create: { ...row, visibility: 'private' },
      update: row,
    });

    const versionData = {
      monthlyCents: row.monthlyCents,
      yearlyCents: row.yearlyCents,
      currency: row.currency,
      seats: row.seats,
      workspaces: row.workspaces,
      aiCreditsMonthly: row.aiCreditsMonthly,
      modules: row.modules,
    };
    const version = await db.planVersion.upsert({
      where: { planId_version: { planId: row.id, version: 1 } },
      update: versionData,
      create: {
        id: `pv_${row.id}_1`,
        planId: row.id,
        version: 1,
        status: 'published',
        publishedAt: new Date(),
        ...versionData,
      },
    });

    await db.planFeature.deleteMany({ where: { planVersionId: version.id } });
    await db.planFeature.createMany({
      data: serviceLines(plan).map((line, index) => ({
        planVersionId: version.id,
        order: index + 1,
        kind: 'text',
        textTr: line.textTr,
        textEn: line.textEn,
      })),
    });
    written.push(row.id);
  }
  return written;
}
