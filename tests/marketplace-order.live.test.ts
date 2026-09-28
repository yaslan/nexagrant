import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createDbClient, withTenantOn } from '@/lib/db';
import { placeMarketplaceOrderOn } from '@/modules/marketplace/server/orders';
import { envValue } from './helpers/dotenv';

/**
 * TASK-MULQK8IRX9GSN — a marketplace order, placed for real over the
 * NOBYPASSRLS role.
 *
 * Why `fabrika_app` and not the app's own `DATABASE_URL`: the listing belongs
 * to the SELLER's tenant and the order to the BUYER's, so the whole question is
 * what each side can see through RLS. `fabrika` is SUPERUSER + BYPASSRLS, where
 * every read succeeds and every cross-tenant assertion would pass on a database
 * with no policies at all (tests/system-scope.live.test.ts says the same at
 * length). So `placeMarketplaceOrderOn` runs over `DATABASE_URL_RLS_TEST`, and
 * the fixtures are written and read back over the privileged handle, never
 * through the code under test.
 *
 * The first arm is the counterfactual: inside the buyer's own scope the seller's
 * listing is invisible. Without it, the successful order below would say
 * nothing about why the discovery path is there.
 *
 * `.live`: skips itself when the database or the RLS role is missing.
 */

const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');

/** Every row this file creates carries it, so cleanup can never over-reach. */
const RUN = `mulqk8-${Date.now()}`;

let rls: PrismaClient | undefined;
let admin: PrismaClient | undefined;
let skipReason = '';

try {
  if (!RLS_URL || !ADMIN_URL) throw new Error('DATABASE_URL_RLS_TEST is not set. Run `pnpm db:rls-role`.');
  rls = createDbClient(RLS_URL);
  admin = createDbClient(ADMIN_URL);
  const caps = await rls.$queryRaw<Array<{ bypass: boolean }>>`
    SELECT rolbypassrls AS bypass FROM pg_roles WHERE rolname = current_user`;
  if (caps[0]?.bypass !== false) throw new Error('the test role is BYPASSRLS; nothing here would measure RLS.');
} catch (e) {
  skipReason = e instanceof Error ? e.message : String(e);
  console.warn(`marketplace-order live test skipped: ${skipReason}`);
}

const ready = skipReason === '';

describe.skipIf(!ready)('placeMarketplaceOrderOn over a NOBYPASSRLS role', () => {
  let buyer: string;
  let seller: string;
  let activeListing: string;
  let unlistedListing: string;
  let negotiableListing: string;

  const db = (): PrismaClient => admin!;
  const app = (): PrismaClient => rls!;

  beforeAll(async () => {
    const mk = async (label: string) =>
      (
        await db().tenant.create({
          data: { name: `Tenant ${label} ${RUN}`, slug: `${RUN}-${label}`, country: 'TR', orgType: 'SME' },
        })
      ).id;
    buyer = await mk('buyer');
    seller = await mk('seller');

    const listing = async (status: string, price: string) =>
      (
        await db().marketplaceListing.create({
          data: { tenantId: seller, kind: 'consultancy', title: `${RUN} ${status}`, description: RUN, price, status },
        })
      ).id;
    activeListing = await listing('active', '€2,500');
    unlistedListing = await listing('unlisted', '€2,500');
    negotiableListing = await listing('active', 'Görüşülecek');
  });

  afterAll(async () => {
    await db().marketplaceOrder.deleteMany({ where: { tenantId: { in: [buyer, seller] } } });
    await db().marketplaceListing.deleteMany({ where: { tenantId: { in: [buyer, seller] } } });
    await db().tenant.deleteMany({ where: { slug: { startsWith: RUN } } });
    await rls?.$disconnect().catch(() => {});
    await admin?.$disconnect().catch(() => {});
  });

  test("inside the buyer's own scope the seller's listing is invisible", async () => {
    const seen = await withTenantOn(app(), buyer, (tx) =>
      tx.marketplaceListing.findUnique({ where: { id: activeListing } })
    );
    expect(seen).toBeNull();
  });

  test('an order is priced from the listing and written for the buyer', async () => {
    const res = await placeMarketplaceOrderOn(app(), buyer, activeListing);

    expect(res.success).toBe(true);
    if (!res.success) return;

    // Read back over the privileged handle: the row exists, with these values.
    const row = await db().marketplaceOrder.findUnique({ where: { id: res.order.id } });
    expect(row).toMatchObject({
      tenantId: buyer,
      sellerTenantId: seller,
      listingId: activeListing,
      totalAmountMinor: 250000,
      platformFeeMinor: 25000,
      payoutAmountMinor: 225000,
      currency: 'EUR',
      status: 'CONFIRMED',
    });
  });

  test('the order is readable by the buyer and by no other tenant', async () => {
    const res = await placeMarketplaceOrderOn(app(), buyer, activeListing);
    expect(res.success).toBe(true);
    if (!res.success) return;
    const id = res.order.id;

    const asBuyer = await withTenantOn(app(), buyer, (tx) => tx.marketplaceOrder.findUnique({ where: { id } }));
    const asSeller = await withTenantOn(app(), seller, (tx) => tx.marketplaceOrder.findUnique({ where: { id } }));
    const unscoped = await app().marketplaceOrder.findUnique({ where: { id } });

    expect(asBuyer?.id).toBe(id);
    expect(asSeller).toBeNull();
    expect(unscoped).toBeNull();
  });

  test('a write naming another tenant is refused by the database', async () => {
    await expect(
      withTenantOn(app(), buyer, (tx) =>
        tx.marketplaceOrder.create({
          data: {
            tenantId: seller,
            listingId: activeListing,
            sellerTenantId: seller,
            totalAmountMinor: 1,
            platformFeeMinor: 0,
            payoutAmountMinor: 1,
          },
        })
      )
    ).rejects.toThrow(/row-level security/i);
  });

  test.each([
    ['a listing id that does not exist', () => `${RUN}-missing`, 'LISTING_NOT_FOUND'],
    ["another tenant's unlisted listing", () => unlistedListing, 'LISTING_NOT_FOUND'],
    ['a listing with no fixed price', () => negotiableListing, 'PRICE_NOT_FIXED'],
  ])('%s is refused and nothing is written', async (_label, id, code) => {
    const before = await db().marketplaceOrder.count({ where: { tenantId: buyer } });

    const res = await placeMarketplaceOrderOn(app(), buyer, id());

    expect(res).toEqual({ success: false, code });
    expect(await db().marketplaceOrder.count({ where: { tenantId: buyer } })).toBe(before);
  });

  test("the seller cannot order their own listing", async () => {
    const res = await placeMarketplaceOrderOn(app(), seller, activeListing);

    expect(res).toEqual({ success: false, code: 'OWN_LISTING' });
    expect(await db().marketplaceOrder.count({ where: { tenantId: seller } })).toBe(0);
  });
});
