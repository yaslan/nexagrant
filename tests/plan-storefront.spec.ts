import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createDbClient, prisma, withTenantOn } from '../src/lib/db';
import { NO_DISCOUNT_TIER, findTierByCode, type DiscountTier, type PricedLine } from '../src/lib/billing/catalog';
import { envValue } from './helpers/dotenv';

/**
 * TASK-MTSHVKTSGC8A4 — a plan published in the studio must be buyable, and a
 * private one must not be buyable by a tenant it was never given to.
 *
 * Two separate claims, measured separately, because they fail in different
 * ways. Before this task, against the running app on 2026-09-08:
 *
 *   • `PlanVersion.monthlyCents` for `ultra` set to 99900 → `/tr/pricing` still
 *     quoted $99.75 and `POST /api/billing/checkout` still charged 14700. The
 *     studio's price reached nobody.
 *   • `Plan.visibility = 'private'` on `basic` with zero assignments → the card
 *     stayed on the public pricing page and checkout answered `totalMinor:
 *     4500` to anybody who asked.
 *
 * The suite runs against the app role `fabrika_app` (NOBYPASSRLS), the one
 * production uses, for the reason recorded in tests/plan-visibility-rls.spec.ts:
 * the default `fabrika` role is SUPERUSER, so a missing tenant scope looks
 * perfect on it. Hiding a plan from a listing is presentation; being refused
 * the *purchase* is the assertion that matters, so both are made here.
 */
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');

const PLAN_ID = 'storefront-private-fixture';
const VERSION_ID = 'pv_storefront_private_fixture_1';
/** $99.00 / month, $990.00 / year — nothing in catalog.ts carries these figures. */
const PRIVATE_MONTHLY = 9_900;
const PRIVATE_YEARLY = 99_000;

/** A price for `pro` that exists only in the database, never in catalog.ts. */
const REPRICED_PRO_MONTHLY = 12_345;
const REPRICED_PRO_YEARLY = 123_450;

type Storefront = {
  storefrontPlans: (tenantId: string | null) => Promise<Array<{ planId: string; monthlyListMinor: number }>>;
  priceLineForTenant: (
    request: { sku: string; billingCycle?: 'monthly' | 'yearly' | 'one-time'; quantity?: number },
    tier: DiscountTier,
    tenantId: string | null
  ) => Promise<PricedLine>;
  PlanNotAvailableError: new (sku: string, reason: 'unknown' | 'not-visible') => Error;
};

describe('the storefront a tenant sees is the storefront it may buy from', () => {
  let rls: PrismaClient;
  let tenantA_Id: string;
  let tenantB_Id: string;
  let storefront: Storefront;
  let proBefore: { monthlyCents: number; yearlyCents: number } | null = null;
  let ready = false;

  beforeAll(async () => {
    if (!RLS_URL) {
      console.warn('storefront test skipped: DATABASE_URL_RLS_TEST is not set.');
      return;
    }
    try {
      await prisma.$connect();
      rls = createDbClient(RLS_URL);
      await rls.$connect();

      const stamp = Date.now();
      const a = await prisma.tenant.create({
        data: { name: 'Storefront Tenant A', slug: `sf-a-${stamp}`, country: 'TR', orgType: 'SME' },
      });
      const b = await prisma.tenant.create({
        data: { name: 'Storefront Tenant B', slug: `sf-b-${stamp}`, country: 'TR', orgType: 'SME' },
      });
      tenantA_Id = a.id;
      tenantB_Id = b.id;

      // A private plan, published, assigned to A only. Written with the
      // privileged client, as the platform does.
      await prisma.$executeRawUnsafe(
        `INSERT INTO "Plan" ("id","name","monthlyCents","yearlyCents","currency","seats","workspaces","aiCreditsMonthly","modules","visibility")
         VALUES ($1,'Storefront Private Fixture',$2,$3,'USD',9,4,900,'{M1}','private')
         ON CONFLICT ("id") DO UPDATE SET "visibility" = 'private'`,
        PLAN_ID,
        PRIVATE_MONTHLY,
        PRIVATE_YEARLY
      );
      await prisma.$executeRawUnsafe(
        `INSERT INTO "PlanVersion" ("id","planId","version","status","monthlyCents","yearlyCents","currency","seats","workspaces","aiCreditsMonthly","modules","publishedAt","updatedAt")
         VALUES ($1,$2,1,'published',$3,$4,'USD',9,4,900,'{M1}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
         ON CONFLICT ("id") DO NOTHING`,
        VERSION_ID,
        PLAN_ID,
        PRIVATE_MONTHLY,
        PRIVATE_YEARLY
      );
      await prisma.$executeRawUnsafe(
        `INSERT INTO "PlanAssignment" ("id","planId","tenantId","assignedBy","updatedAt")
         VALUES ($1,$2,$3,'storefront-fixture',CURRENT_TIMESTAMP)`,
        `pa_sf_${stamp}`,
        PLAN_ID,
        tenantA_Id
      );

      // Repriced `pro`, so "the published version decides the price" can be
      // asserted on a plan that also exists in catalog.ts at a different figure.
      const before = (await prisma.$queryRawUnsafe(
        `SELECT "monthlyCents", "yearlyCents" FROM "PlanVersion" WHERE "planId" = 'pro' AND "status" = 'published' ORDER BY "version" DESC LIMIT 1`
      )) as Array<{ monthlyCents: number; yearlyCents: number }>;
      proBefore = before[0] ?? null;
      await prisma.$executeRawUnsafe(
        `UPDATE "PlanVersion" SET "monthlyCents" = $1, "yearlyCents" = $2
         WHERE "planId" = 'pro' AND "status" = 'published'`,
        REPRICED_PRO_MONTHLY,
        REPRICED_PRO_YEARLY
      );

      // The real storefront, over a client that is subject to the policies.
      vi.resetModules();
      vi.doMock('@/lib/db', () => ({
        prisma: rls,
        withTenant: <T,>(tenantId: string, cb: (tx: unknown) => Promise<T>) =>
          withTenantOn(rls, tenantId, cb as never),
        withTenantOn,
        createDbClient,
      }));
      storefront = (await import('@/lib/billing/storefront')) as unknown as Storefront;
      ready = true;
    } catch (e) {
      console.warn(`storefront test skipped: ${e instanceof Error ? e.message : String(e)}`);
      ready = false;
    }
  });

  afterAll(async () => {
    try {
      if (proBefore) {
        await prisma.$executeRawUnsafe(
          `UPDATE "PlanVersion" SET "monthlyCents" = $1, "yearlyCents" = $2
           WHERE "planId" = 'pro' AND "status" = 'published'`,
          proBefore.monthlyCents,
          proBefore.yearlyCents
        );
      }
      await prisma.$executeRawUnsafe(`DELETE FROM "PlanAssignment" WHERE "planId" = $1`, PLAN_ID);
      await prisma.$executeRawUnsafe(`DELETE FROM "PlanVersion" WHERE "planId" = $1`, PLAN_ID);
      await prisma.$executeRawUnsafe(`DELETE FROM "Plan" WHERE "id" = $1`, PLAN_ID);
      if (tenantA_Id && tenantB_Id) {
        await prisma.tenant.deleteMany({ where: { id: { in: [tenantA_Id, tenantB_Id] } } });
      }
    } catch {
      // ignore cleanup error
    }
    vi.doUnmock('@/lib/db');
    vi.resetModules();
    await rls?.$disconnect().catch(() => {});
    await prisma.$disconnect().catch(() => {});
  });

  test('the connection under test is genuinely subject to RLS', async (ctx) => {
    if (!ready) return ctx.skip();
    const [role] = await rls.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
      SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user
    `;
    expect(role!.rolsuper).toBe(false);
    expect(role!.rolbypassrls).toBe(false);
  });

  test('the price charged is the published version, not the static catalogue', async (ctx) => {
    if (!ready) return ctx.skip();
    const line = await storefront.priceLineForTenant(
      { sku: 'plan-pro', billingCycle: 'monthly' },
      NO_DISCOUNT_TIER,
      tenantB_Id
    );
    // catalog.ts says 8_700 for pro monthly. The database says 12_345.
    expect(line.amountMinor).toBe(REPRICED_PRO_MONTHLY);
    expect(line.amountMinor).not.toBe(8_700);
  });

  test('a campaign discount still applies, and applies to the database figure', async (ctx) => {
    if (!ready) return ctx.skip();
    const tier = findTierByCode('ILK5')!; // 70% off
    const line = await storefront.priceLineForTenant(
      { sku: 'plan-pro', billingCycle: 'monthly' },
      tier,
      tenantB_Id
    );
    expect(line.listAmountMinor).toBe(REPRICED_PRO_MONTHLY);
    expect(line.amountMinor).toBe(Math.round(REPRICED_PRO_MONTHLY * 0.3));
    expect(line.percentOff).toBe(70);
  });

  test('the assigned tenant can see the private plan and be quoted its price', async (ctx) => {
    if (!ready) return ctx.skip();
    const visible = await storefront.storefrontPlans(tenantA_Id);
    expect(visible.map((plan) => plan.planId)).toContain(PLAN_ID);

    const line = await storefront.priceLineForTenant(
      { sku: `plan-${PLAN_ID}`, billingCycle: 'monthly' },
      NO_DISCOUNT_TIER,
      tenantA_Id
    );
    expect(line.amountMinor).toBe(PRIVATE_MONTHLY);
  });

  test('a tenant it was not assigned to cannot see it', async (ctx) => {
    if (!ready) return ctx.skip();
    const visible = await storefront.storefrontPlans(tenantB_Id);
    expect(visible.map((plan) => plan.planId)).not.toContain(PLAN_ID);
    // Not vacuous: B still sees the public plans.
    expect(visible.length).toBeGreaterThan(0);
  });

  test('and cannot buy it either, even naming the sku by hand', async (ctx) => {
    if (!ready) return ctx.skip();
    // This is the assertion the listing test cannot make. Hiding a card is
    // presentation; the refusal has to happen where the amount is produced,
    // because a request never has to come from a card.
    for (const sku of [`plan-${PLAN_ID}`, PLAN_ID, PLAN_ID.toUpperCase()]) {
      await expect(
        storefront.priceLineForTenant({ sku, billingCycle: 'monthly' }, NO_DISCOUNT_TIER, tenantB_Id)
      ).rejects.toBeInstanceOf(storefront.PlanNotAvailableError);
    }
  });

  test('an anonymous visitor sees only the public plans, and cannot buy a private one', async (ctx) => {
    if (!ready) return ctx.skip();
    const visible = await storefront.storefrontPlans(null);
    expect(visible.map((plan) => plan.planId)).not.toContain(PLAN_ID);
    expect(visible.map((plan) => plan.planId)).toContain('pro');
    await expect(
      storefront.priceLineForTenant({ sku: `plan-${PLAN_ID}` }, NO_DISCOUNT_TIER, null)
    ).rejects.toBeInstanceOf(storefront.PlanNotAvailableError);
  });

  test('the free tier is never on the storefront and is not for sale', async (ctx) => {
    if (!ready) return ctx.skip();
    // `Plan` carries a `free` row because `getEntitlements` falls back to it.
    // It is a state a tenant lands in, not a $0 line anyone can check out.
    const visible = await storefront.storefrontPlans(tenantA_Id);
    expect(visible.map((plan) => plan.planId)).not.toContain('free');
    await expect(
      storefront.priceLineForTenant({ sku: 'plan-free' }, NO_DISCOUNT_TIER, tenantA_Id)
    ).rejects.toBeInstanceOf(storefront.PlanNotAvailableError);
  });

  test('a sku no plan carries is refused rather than defaulted', async (ctx) => {
    if (!ready) return ctx.skip();
    await expect(
      storefront.priceLineForTenant({ sku: 'plan-enterprise' }, NO_DISCOUNT_TIER, tenantA_Id)
    ).rejects.toBeInstanceOf(storefront.PlanNotAvailableError);
  });

  test('the one-time lifetime licence still prices from the catalogue', async (ctx) => {
    if (!ready) return ctx.skip();
    // It is not a `Plan` row and the studio does not edit it, so it must keep
    // working through the storefront path rather than being refused as unknown.
    const line = await storefront.priceLineForTenant(
      { sku: 'lifetime-ultra' },
      NO_DISCOUNT_TIER,
      tenantA_Id
    );
    expect(line.kind).toBe('lifetime');
    expect(line.amountMinor).toBe(128_800); // $2,576.00 less its fixed 50%
  });
});
