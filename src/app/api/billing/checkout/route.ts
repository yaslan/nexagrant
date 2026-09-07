import { NextResponse } from 'next/server';
import { z } from 'zod';
import Stripe from 'stripe';
import { auth } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getActiveTier } from '@/lib/billing/active-tier';
import { withTenant } from '@/lib/db';
import {
  findTierByCode,
  priceLine,
  UnknownSkuError,
  UnsupportedCycleError,
  type PricedLine,
} from '@/lib/billing/catalog';
import {
  effectiveTier,
  priceLockDefect,
  readPriceLock,
  type PriceLockColumns,
} from '@/lib/billing/price-lock';

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

/**
 * The tenant's own locked rate, when it has one.
 *
 * A miss here must never become a *higher* price by accident, so a database
 * error is logged and treated as "no lock" — the same tier the shopfront is
 * quoting — rather than swallowed into some other rate. The read goes through
 * `withTenant` because `Subscription` is under RLS.
 */
async function lockedRateFor(tenantId: string) {
  try {
    const row = await withTenant<(Partial<PriceLockColumns>) | null>(tenantId, (tx) =>
      tx.subscription.findUnique({
        where: { tenantId },
        select: {
          lockedTierCode: true,
          lockedPercentOff: true,
          lockedAmountMinor: true,
          lockedCurrency: true,
          priceLockedAt: true,
        },
      })
    );
    const defect = priceLockDefect(row);
    if (defect) {
      logger.warn('Checkout found an unusable price lock; pricing at the active tier', { tenantId, defect });
    }
    return readPriceLock(row);
  } catch (error) {
    logger.error('Checkout could not read the price lock; pricing at the active tier', error, { tenantId });
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    const tenantId = session?.tenantId || 'default-tenant';

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
    const shopfrontTier = getActiveTier();
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
    const lock = await lockedRateFor(tenantId);
    const activeTier = effectiveTier(lock, shopfrontTier);
    if (lock) {
      logger.info('Checkout priced under the tenant price lock', {
        tenantId,
        lockedTier: lock.tierCode,
        lockedPercentOff: lock.percentOff,
        shopfrontTier: shopfrontTier.code,
        appliedPercentOff: activeTier.percentOff,
      });
    }

    let priced: PricedLine[];
    try {
      priced = requestedLines.map((line) => priceLine(line, activeTier));
    } catch (error) {
      if (error instanceof UnknownSkuError) {
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
      return NextResponse.json({ error: 'Pricing error' }, { status: 500 });
    }

    const totalMinor = priced.reduce((sum, line) => sum + line.totalMinor, 0);
    const currency = priced[0]?.currency ?? 'USD';

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
        priceLocked: lock !== null,
        ignoredClientFields: clientPriceFields,
        currency,
        totalMinor,
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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

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
      },
      success_url: `${appUrl}/${locale}/${workspace}/settings/billing?success=true`,
      cancel_url: `${appUrl}/${locale}/${workspace}/settings/billing?canceled=true`,
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    logger.error('Error creating checkout session', error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
