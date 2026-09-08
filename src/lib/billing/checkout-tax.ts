import { withTenant } from '@/lib/db';
import { logger } from '@/lib/logger';
import { vatOnNetMinor } from '@/lib/money';

import { resolveVatRate } from './vat-rate';

/**
 * The VAT a checkout has to add on top of a VAT-exclusive catalogue total.
 *
 * Boss decision, 2026-09-08: catalogue prices are VAT-exclusive and VAT is
 * added by the buyer's country. That decision has two halves, and shipping only
 * one of them would be worse than shipping neither: if the invoice adds tax the
 * charge did not, the document stops reconciling with the receipt; if the
 * pricing page says "KDV hariç" and the charge is unchanged, the page is simply
 * wrong about what it is selling.
 *
 * This module is the checkout half. It reads the same resolver the invoice
 * writer reads (`./vat-rate`), so a sale cannot be charged at one rate and
 * invoiced at another.
 *
 * ## Why a tenant with no known tax country is still allowed to buy
 *
 * The tax country comes from `TenantBillingIdentity`, and today nothing in the
 * product fills that row in (TASK-MTSY71BUMBLWM). Refusing checkout without it
 * would close the funnel for every customer to fix a fiscal gap, so an unknown
 * country is charged the net total and reported here — and the invoice writer
 * independently refuses to issue a document for it, raising
 * `invoice_vat_country_unknown`. The sale is visible and fixable; it is never
 * quietly taxed at a guessed rate.
 */
export interface CheckoutTax {
  /** ISO country the rate came from, or null when it could not be resolved. */
  country: string | null;
  /** The applied rate. `0` both when the country levies none and when unknown. */
  ratePercent: number;
  /** VAT on the net total, minor units. */
  vatMinor: number;
  /** False when no rate could be resolved — the caller must not read 0 as "0%". */
  resolved: boolean;
}

/**
 * VAT for one tenant's cart, or a resolved-false answer.
 *
 * Never throws: a checkout must not 500 because a tax lookup had a bad day. A
 * database failure is logged and treated exactly like an unknown country, which
 * is the conservative direction — the customer is charged the net price and no
 * invoice is issued until the gap is closed.
 */
export async function taxLineForTenant(
  tenantId: string,
  netTotalMinor: number
): Promise<CheckoutTax> {
  const unresolved: CheckoutTax = { country: null, ratePercent: 0, vatMinor: 0, resolved: false };

  let buyerCountry: string | null = null;
  try {
    const identity = await withTenant(tenantId, (tx) =>
      tx.tenantBillingIdentity.findUnique({
        where: { tenantId },
        select: { buyerCountry: true },
      })
    );
    buyerCountry = identity?.buyerCountry ?? null;
  } catch (error) {
    logger.warn('Checkout could not read the buyer tax country; charging the net total', {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return unresolved;
  }

  const vat = resolveVatRate(buyerCountry);
  if (vat.status !== 'resolved') {
    logger.warn('Checkout has no sourced VAT rate for this buyer; charging the net total', {
      tenantId,
      reason: vat.status,
      detail: vat.detail,
    });
    return unresolved;
  }

  return {
    country: vat.country,
    ratePercent: vat.ratePercent,
    vatMinor: vatOnNetMinor(netTotalMinor, vat.ratePercent),
    resolved: true,
  };
}
