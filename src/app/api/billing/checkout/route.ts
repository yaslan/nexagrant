import { NextResponse } from 'next/server';
import { internalError } from '@/lib/api-error';
import { z } from 'zod';
import Stripe from 'stripe';
import { logger } from '@/lib/logger';
import {
  findTierByCode,
  UnsupportedCycleError,
  type PricedLine,
} from '@/lib/billing/catalog';
import { PlanNotAvailableError, priceLineForTenant } from '@/lib/billing/storefront';
import { tierForTenant } from '@/lib/billing/tenant-tier';
import { taxLineForTenant } from '@/lib/billing/checkout-tax';
import { requireTenantApi } from '@/lib/tenant';
import { asRole, can } from '@/lib/rbac';
import { FORBIDDEN_ROLE_DIGEST } from '@/lib/forbidden-role';
import { getPilotState } from '@/lib/billing/pilot';
import { hasActiveInternalPlan } from '@/lib/billing/internal-plan';
import { appUrl as resolveAppUrl } from '@/lib/app-url';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const isLiveStripe = Boolean(stripeSecretKey && !stripeSecretKey.includes('mock') && stripeSecretKey.startsWith('sk_'));

const stripe = isLiveStripe ? new Stripe(stripeSecretKey!, {
  apiVersion: '2026-08-26.dahlia',
}) : null;

/** Stripe refuses a charge under 50 cents; a catalogue line below it is a bug here, not there. */
const STRIPE_MINIMUM_MINOR = 50;

/**
 * Fields a client may send about *price*. None of them are read: the amount is
 * computed from the catalogue and the server's active tier. They are listed so
 * that a request carrying one can be logged — a caller trying to name its own
 * price is a signal worth keeping, not something to swallow silently.
 */
const CLIENT_PRICE_FIELDS = ['price', 'originalPrice', 'discountPercent', 'unitAmount', 'amount', 'total'] as const;

/**
 * What checkout accepts. `sku`/`id`/`planId` say *which* catalogue line; the
 * catalogue says what it costs. Unknown keys are stripped by zod, so a
 * `price` in the body never reaches the pricing code.
 */
const CheckoutItemSchema = z
  .object({
    sku: z.string().min(1).optional(),
    id: z.string().min(1).optional(),
    planId: z.string().min(1).optional(),
    quantity: z.number().int().min(1).max(999).optional(),
    billingCycle: z.enum(['monthly', 'yearly', 'one-time']).optional(),
  })
  .refine((item) => Boolean(item.sku || item.id || item.planId), {
    message: 'Each item needs a sku, id or planId',
  });

const CheckoutBodySchema = z.object({
  priceId: z.string().min(1).optional(),
  items: z.array(CheckoutItemSchema).optional(),
  mode: z.enum(['subscription', 'payment']).optional(),
  couponCode: z.string().max(64).optional(),
  billingCycle: z.enum(['monthly', 'yearly', 'one-time']).optional(),
  locale: z.string().max(10).optional(),
  workspace: z.string().max(120).optional(),
});

/** Names every price-ish key the request carried, so the attempt can be logged. */
function collectClientPriceFields(body: unknown): string[] {
  const found = new Set<string>();
  const scan = (value: unknown, path: string) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach((entry, index) => scan(entry, `${path}[${index}]`));
      return;
    }
    for (const field of CLIENT_PRICE_FIELDS) {
      if (field in (value as Record<string, unknown>)) found.add(`${path}${field}`);
    }
  };
  scan(body, '');
  if (body && typeof body === 'object' && 'items' in (body as Record<string, unknown>)) {
    scan((body as Record<string, unknown>).items, 'items');
  }
  return [...found];
}

export async function POST(req: Request) {
  try {
    // The gate comes first, before the body is read and before anything is
    // priced. Creating a Stripe Checkout Session is a *chargeable* act, so it
    // belongs to a tenant or to nobody. The route used to fall back to
    // `'default-tenant'` — an id that exists in no seed, no script and no
    // schema — which made an anonymous POST create a real, payable session
    // whose webhook could never be recorded: `lifetime-licence.ts` refuses the
    // unknown tenant, Stripe retries the 500 forever, and the money has no home.
    // `requireTenantApi` is the same 401 gate the other tenant routes use
    // (`src/lib/tenant.ts`): no session tenant, no fallback tenant.
    const scope = await requireTenantApi();
    if (!scope.ok) return scope.response;
    const { tenantId } = scope.scope;

    // Buying on the tenant's behalf is `manage_billing`, which only the owner
    // carries (src/lib/rbac.ts). Any member — the outside partner included —
    // used to be able to open a subscription session here (İNCELEME-59 Y-3,
    // TASK-MUNQAXELV83HO). Refused before the pilot read, the pricing and Stripe.
    if (!can(asRole(scope.scope.role), 'manage_billing')) {
      return NextResponse.json(
        {
          error: 'Forbidden',
          message: 'Ödeme ve plan değişikliğini yalnız çalışma alanı sahibi yapabilir.',
          code: FORBIDDEN_ROLE_DIGEST,
        },
        { status: 403 }
      );
    }

    // A tenant on the free pilot buys nothing until the pilot is over: no
    // e-Fatura yet, so no sale may start (TASK-MUMABL78X5JLX). Running or run
    // out, the answer is the same — the conversion is a contract package the
    // platform admin assigns, not a card payment.
    if ((await getPilotState(tenantId)).kind !== 'none') {
      return NextResponse.json(
        {
          error: 'Checkout closed during the pilot',
          message: 'Pilot süresince ödeme ve plan yükseltme kapalıdır; pilot sonrasında açılır.',
          code: 'PILOT_CHECKOUT_CLOSED',
        },
        { status: 403 }
      );
    }

    // A tenant on an internal plan (TASK-MVCH26OXNVLKR) buys nothing either: the
    // plan is the platform admin's, and the Stripe sync leaves such a row alone
    // (`stripeSyncBlocker`), so a payment taken here would land nowhere. The
    // admin takes the internal plan back first; then checkout opens again.
    if (await hasActiveInternalPlan(tenantId)) {
      return NextResponse.json(
        {
          error: 'Checkout closed while an internal plan is assigned',
          message: 'Planınız yönetici tarafından atandı; değişiklik için bizimle iletişime geçin.',
          code: 'INTERNAL_PLAN_CHECKOUT_CLOSED',
        },
        { status: 403 }
      );
    }

    const rawBody: unknown = await req.json();

    // Ignore, but never hide, a client that tried to set its own price.
    const clientPriceFields = collectClientPriceFields(rawBody);
    if (clientPriceFields.length > 0) {
      logger.warn('Checkout request carried client-supplied pricing fields; ignoring them', {
        tenantId,
        fields: clientPriceFields.join(','),
      });
    }

    const parsed = CheckoutBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid checkout request', details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) },
        { status: 400 }
      );
    }
    const { priceId, items, mode, couponCode, billingCycle, locale = 'tr', workspace = 'default' } = parsed.data;

    const requestedLines = items && items.length > 0
      ? items.map((item) => ({
          sku: (item.sku || item.id || item.planId) as string,
          quantity: item.quantity ?? 1,
          billingCycle: item.billingCycle ?? billingCycle,
        }))
      : priceId
      ? [{
          sku: priceId,
          quantity: 1,
          // `mode: 'payment'` used to conjure a $45 plan out of nothing; now the
          // sku has to exist in the catalogue and the mode only picks the cycle.
          billingCycle: (mode === 'payment' ? 'one-time' : billingCycle) as 'monthly' | 'yearly' | 'one-time' | undefined,
        }]
      : [];

    if (requestedLines.length === 0) {
      return NextResponse.json({ error: 'No items in checkout request' }, { status: 400 });
    }

    // The tier is the server's, never the request's. A coupon code names a
    // campaign; if it names one that is not running, it changes nothing.
    //
    // "The price you join at stays yours": a tenant that already carries a lock
    // is priced at its own rate, so an upgrade or a cycle change made after the
    // campaign ended still costs what the customer joined at. `tierForTenant`
    // is the same function `/api/billing/quote` uses, so the cart drawer and
    // the charge cannot disagree about which campaign applies.
    const { shopfront: shopfrontTier, effective: activeTier, locked } = await tierForTenant(tenantId);
    if (couponCode) {
      const named = findTierByCode(couponCode);
      if (named && named.code !== shopfrontTier.code) {
        logger.warn('Checkout coupon names a tier that is not the active one; pricing at the active tier', {
          tenantId,
          couponCode,
          activeTier: shopfrontTier.code,
        });
      }
    }

    // "The price you join at stays yours": a tenant that already carries a lock
    // is priced at its own rate, so an upgrade or a cycle change made after the
    // campaign ended still costs what the customer joined at. A tenant with no
    // lock — a first purchase, or a subscription sold before the lock existed —
    // is priced at the shopfront tier, exactly as before.
    if (locked) {
      logger.info('Checkout priced under the tenant price lock', {
        tenantId,
        lockedTier: activeTier.code,
        shopfrontTier: shopfrontTier.code,
        appliedPercentOff: activeTier.percentOff,
      });
    }

    // Where the amount comes from: the published `PlanVersion` this tenant can
    // actually see (TASK-MTSHVKTSGC8A4), or — for the one-time lifetime licence,
    // which is not a plan row — the static catalogue. Two consequences that are
    // the point of routing through the storefront rather than the catalogue:
    // a price the studio publishes takes effect here, and a private plan is
    // refused to a tenant it was not assigned to even when the sku is typed in
    // by hand rather than clicked.
    let priced: PricedLine[];
    try {
      priced = await Promise.all(
        requestedLines.map((line) => priceLineForTenant(line, activeTier, tenantId))
      );
    } catch (error) {
      if (error instanceof PlanNotAvailableError) {
        // One answer for "no such plan" and "not yours", so the endpoint cannot
        // be used to enumerate which private plans exist. The distinction is
        // kept in the log, where it belongs.
        logger.warn('Checkout refused a plan this tenant may not buy', {
          tenantId,
          sku: error.sku,
          reason: error.reason,
        });
        return NextResponse.json({ error: `Unknown plan: ${error.sku}` }, { status: 400 });
      }
      if (error instanceof UnsupportedCycleError) {
        return NextResponse.json(
          { error: `Plan ${error.sku} cannot be billed ${error.billingCycle}` },
          { status: 400 }
        );
      }
      throw error;
    }

    const below = priced.find((line) => line.amountMinor < STRIPE_MINIMUM_MINOR);
    if (below) {
      // Refuse rather than clamp: `Math.max(50, …)` is how a wrong amount used
      // to become a successful 50-cent charge.
      logger.error('Catalogue produced an amount below the provider minimum', undefined, {
        sku: below.sku,
        amountMinor: below.amountMinor,
        tier: activeTier.code,
      });
      return internalError({ error: 'Pricing error' });
    }

    const totalMinor = priced.reduce((sum, line) => sum + line.totalMinor, 0);
    const currency = priced[0]?.currency ?? 'USD';

    // Catalogue prices are VAT-exclusive since 2026-09-08, so the charge is the
    // catalogue total *plus* the tax of the buyer's country. Without this the
    // "KDV hariç" label on the pricing page would be a claim the checkout
    // contradicts, and the invoice — which adds the tax — would never reconcile
    // with the receipt. A buyer whose tax country is unknown is charged the net
    // total and, by the same rule, gets no invoice until the country is known
    // (`vat_country_unknown`); that is one gap reported in two places, not a
    // silent 0%.
    const tax = await taxLineForTenant(tenantId, totalMinor);

    // Stripe credentials not live or missing: the client falls back to its demo
    // checkout modal. The server still returns the amounts it computed, so the
    // demo shows catalogue prices rather than whatever the browser believed.
    if (!stripe || !isLiveStripe) {
      return NextResponse.json({
        demoMode: true,
        message: 'Stripe credentials not configured. Handled via interactive demo checkout modal.',
        itemsCount: priced.length,
        tenantId,
        couponCode: couponCode ?? null,
        activeTier: { code: activeTier.code, percentOff: activeTier.percentOff },
        shopfrontTier: { code: shopfrontTier.code, percentOff: shopfrontTier.percentOff },
        priceLocked: locked,
        ignoredClientFields: clientPriceFields,
        currency,
        // `totalMinor` stays the VAT-exclusive catalogue total: it is what the
        // pricing page shows and what every existing caller reads. The tax and
        // the amount actually charged are additional fields, not a redefinition
        // of this one.
        totalMinor,
        tax: {
          country: tax.country,
          ratePercent: tax.ratePercent,
          vatMinor: tax.vatMinor,
          resolved: tax.resolved,
        },
        grossTotalMinor: totalMinor + tax.vatMinor,
        lines: priced.map((line) => ({
          sku: line.sku,
          name: line.name,
          billingCycle: line.billingCycle,
          quantity: line.quantity,
          amountMinor: line.amountMinor,
          listAmountMinor: line.listAmountMinor,
          percentOff: line.percentOff,
          campaignCode: line.campaignCode,
          totalMinor: line.totalMinor,
        })),
      });
    }

    const appUrl = resolveAppUrl();

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = priced.map((line) => ({
      price_data: {
        currency: line.currency.toLowerCase(),
        product_data: {
          name: line.name,
          description: `${line.kind.toUpperCase()} · ${line.campaignCode} (-${line.percentOff}%)`,
        },
        unit_amount: line.amountMinor,
        ...(line.recurringInterval ? { recurring: { interval: line.recurringInterval } } : {}),
      },
      quantity: line.quantity,
    }));

    // The tax rides as its own line so the customer sees what they are paying
    // it for, and so a zero-VAT country (Kuveyt) simply has no such line rather
    // than a line reading 0.
    if (tax.vatMinor > 0) {
      lineItems.push({
        price_data: {
          currency: currency.toLowerCase(),
          product_data: {
            name: `KDV / VAT ${tax.ratePercent}% (${tax.country})`,
            description: 'Katma Değer Vergisi — alıcının ülkesine göre',
          },
          unit_amount: tax.vatMinor,
          ...(priced[0]?.recurringInterval
            ? { recurring: { interval: priced[0].recurringInterval } }
            : {}),
        },
        quantity: 1,
      });
    }

    const isSubscriptionMode = priced.some((line) => line.kind === 'plan');

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: isSubscriptionMode ? 'subscription' : 'payment',
      payment_method_types: ['card'],
      line_items: lineItems,
      client_reference_id: tenantId,
      metadata: {
        tenantId,
        couponCode: couponCode || 'NONE',
        activeTier: activeTier.code,
        discountPercent: String(activeTier.percentOff),
        skus: priced.map((line) => line.sku).join(','),
        totalMinor: String(totalMinor),
        vatCountry: tax.country ?? 'UNKNOWN',
        vatRatePercent: String(tax.ratePercent),
        vatMinor: String(tax.vatMinor),
        grossTotalMinor: String(totalMinor + tax.vatMinor),
      },
      success_url: `${appUrl}/${locale}/${workspace}/settings/billing?success=true`,
      cancel_url: `${appUrl}/${locale}/${workspace}/settings/billing?canceled=true`,
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    logger.error('Error creating checkout session', error);
    return internalError();
  }
}
