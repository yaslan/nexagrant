import type { PrismaClient } from '@prisma/client';

import { prisma } from '../src/lib/db';
import { NG_PLANS, NG_PLAN_FEATURES, NG_PLAN_PRICES, NG_TRIAL_POLICIES } from './seed-data/nexagrant-catalog';

/**
 * NG-57 — the NexaGrant plan catalogue. Platform reference data, needed in every
 * environment (registration starts a trial from it), not demo data. Written as the
 * owning role: fabrika_app may only read these tables.
 *
 * Idempotent; a second run writes the same rows:
 *   - plans and trial policies upsert: the data file owns them;
 *   - the matrix upserts, and a cell of a NexaGrant plan that the data no longer has is
 *     removed — otherwise a feature taken out of a plan would stay granted;
 *   - prices are insert-only: a cell that exists keeps its amount, so a price entered
 *     after the accountant's approval is never reset to empty by a re-seed.
 */
export default async function seedNexagrantCatalog(db: PrismaClient = prisma): Promise<void> {
  await db.$transaction(async (tx) => {
    // The fallback flag is unique among true rows: clear a stale holder before setting it.
    const fallbackId = NG_PLANS.find((p) => p.isFallback)?.id;
    if (fallbackId) {
      await tx.ngPlan.updateMany({ where: { isFallback: true, id: { not: fallbackId } }, data: { isFallback: false } });
    }
    for (const p of NG_PLANS) {
      const data = { tier: p.tier, sortOrder: p.sortOrder, sellable: p.sellable, isFallback: p.isFallback };
      await tx.ngPlan.upsert({ where: { id: p.id }, create: { id: p.id, ...data }, update: data });
    }

    const planIds = NG_PLANS.map((p) => p.id);
    const keep = new Set(NG_PLAN_FEATURES.map((f) => `${f.planId}\u0000${f.featureKey}`));
    const existing = await tx.ngPlanFeature.findMany({
      where: { planId: { in: planIds } },
      select: { planId: true, featureKey: true },
    });
    for (const row of existing) {
      if (!keep.has(`${row.planId}\u0000${row.featureKey}`)) {
        await tx.ngPlanFeature.delete({ where: { planId_featureKey: { planId: row.planId, featureKey: row.featureKey } } });
      }
    }
    for (const f of NG_PLAN_FEATURES) {
      await tx.ngPlanFeature.upsert({
        where: { planId_featureKey: { planId: f.planId, featureKey: f.featureKey } },
        create: f,
        update: { limitValue: f.limitValue },
      });
    }

    for (const price of NG_PLAN_PRICES) {
      await tx.ngPlanPrice.upsert({
        where: { planId_currency_interval: { planId: price.planId, currency: price.currency, interval: price.interval } },
        create: price,
        update: {},
      });
    }

    for (const t of NG_TRIAL_POLICIES) {
      const data = { days: t.days, planId: t.planId, endPlanId: t.endPlanId };
      await tx.ngTrialPolicy.upsert({ where: { segment: t.segment }, create: { segment: t.segment, ...data }, update: data });
    }
  });
  console.log(
    `NexaGrant catalogue seeded (${NG_PLANS.length} plans, ${NG_PLAN_FEATURES.length} matrix cells, ` +
      `${NG_PLAN_PRICES.length} price cells, ${NG_TRIAL_POLICIES.length} trial policies).`
  );
}
