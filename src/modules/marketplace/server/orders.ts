import type { PrismaClient } from '@prisma/client';
import { withTenantOn } from '@/lib/db';
import { withSystemScopeOn } from '@/lib/system-scope';
import { applyPercentDiscount, toMinorUnits, type MoneyAmount } from '@/lib/money';
import type { MarketplaceOrderRow } from '@/types/db-rows';

/**
 * Placing a marketplace order — TASK-MULQK8IRX9GSN (the code half of
 * TASK-MTVUQXSYL0X2H).
 *
 * `orderMarketplaceService` used to take `priceAmountEUR` from the browser
 * (default 1500), never looked `listingId` up, and returned a confirmation
 * object for an order it never wrote. A server action is a public POST
 * endpoint, so the buyer named their own price. Here the price is read from the
 * listing row, the commission is computed on the server, and the order is a
 * `MarketplaceOrder` row owned by the buyer's tenant.
 *
 * The listing belongs to the SELLER's tenant, and the buyer has no scope over
 * it. Under `fabrika_app` (NOBYPASSRLS) a read inside the buyer's `withTenant`
 * returns nothing, so every order would be refused as "not found". The listing
 * id names its own tenant, so the read runs on the sanctioned discovery path
 * (src/lib/system-scope.ts) and selects only what pricing needs. The write
 * that follows is back in the buyer's own scope, where `tenant_isolation`
 * checks the row's `tenantId`.
 *
 * Takes the client explicitly so tests/marketplace-order.live.test.ts can run
 * the real thing over the NOBYPASSRLS role. The server action passes `prisma`.
 */

/** Platform commission, in whole percent of the listing price. */
export const PLATFORM_FEE_PERCENT = 10;

export type MarketplaceOrderRefusal =
  /** No such listing, or it is not active. One code for both, so the answer
   *  does not reveal that another tenant's unlisted listing exists. */
  | 'LISTING_NOT_FOUND'
  | 'OWN_LISTING'
  /** "Görüşülecek" / "Negotiable" or an ambiguous amount: nothing to charge. */
  | 'PRICE_NOT_FIXED';

export type MarketplaceOrderResult =
  | { success: true; order: MarketplaceOrderRow }
  | { success: false; code: MarketplaceOrderRefusal };

const CURRENCY_ALIASES: Record<string, string> = {
  '€': 'EUR',
  EUR: 'EUR',
  $: 'USD',
  USD: 'USD',
  '£': 'GBP',
  GBP: 'GBP',
  '₺': 'TRY',
  TL: 'TRY',
  TRY: 'TRY',
};

/**
 * Reads a fixed price out of `MarketplaceListing.price`, which is free text a
 * seller typed ("€1,500", "2500 EUR", "Görüşülecek").
 *
 * Accepts a plain decimal ("1500", "1500.50") or comma-grouped thousands
 * ("1,500", "12,500.00"), with an optional currency symbol or code before or
 * after it. No currency means EUR: the form's default is "€1,500" and EUR was
 * the only currency the old action knew.
 *
 * Returns null for anything else rather than guessing. "2.500" is the case that
 * matters: in Turkish and German it is two thousand five hundred, in English it
 * is two and a half, and charging the wrong one is a 1000x error either way.
 */
export function parseListingPrice(price: string | null | undefined): MoneyAmount | null {
  if (!price) return null;
  let text = price.trim();
  let currency: string | undefined;

  const affix = /^([€$£₺]|[A-Za-z]{2,3})\s*(.*)$|^(.*?)\s*([€$£₺]|[A-Za-z]{2,3})$/.exec(text);
  if (affix) {
    const mapped = CURRENCY_ALIASES[(affix[1] ?? affix[4] ?? '').toUpperCase()];
    if (!mapped) return null;
    currency = mapped;
    text = (affix[2] ?? affix[3] ?? '').trim();
  }

  const plain = /^\d+(?:\.\d{1,2})?$/;
  const grouped = /^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/;
  if (!plain.test(text) && !grouped.test(text)) return null;

  const resolved = currency ?? 'EUR';
  const amountMinor = toMinorUnits(text.replace(/,/g, ''), resolved);
  if (amountMinor <= 0) return null;
  return { amountMinor, currency: resolved };
}

export async function placeMarketplaceOrderOn(
  client: PrismaClient,
  buyerTenantId: string,
  listingId: string
): Promise<MarketplaceOrderResult> {
  // The listing id names the seller's tenant; the buyer has no scope over it
  // yet. Only the columns pricing needs leave the discovery transaction.
  const listing = await withSystemScopeOn(
    client,
    'tenant-discovery',
    'marketplace.placeOrder.listingById',
    (tx) =>
      tx.marketplaceListing.findUnique({
        where: { id: listingId },
        select: { id: true, tenantId: true, status: true, price: true },
      })
  );

  if (!listing || listing.status !== 'active') {
    return { success: false, code: 'LISTING_NOT_FOUND' };
  }
  if (listing.tenantId === buyerTenantId) {
    return { success: false, code: 'OWN_LISTING' };
  }

  const price = parseListingPrice(listing.price);
  if (!price) {
    return { success: false, code: 'PRICE_NOT_FIXED' };
  }

  const payoutAmountMinor = applyPercentDiscount(price.amountMinor, PLATFORM_FEE_PERCENT);
  const platformFeeMinor = price.amountMinor - payoutAmountMinor;

  const order = await withTenantOn(client, buyerTenantId, (tx) =>
    tx.marketplaceOrder.create({
      data: {
        tenantId: buyerTenantId,
        listingId: listing.id,
        sellerTenantId: listing.tenantId,
        totalAmountMinor: price.amountMinor,
        platformFeeMinor,
        payoutAmountMinor,
        currency: price.currency,
        status: 'CONFIRMED',
      },
    })
  );

  return { success: true, order };
}
