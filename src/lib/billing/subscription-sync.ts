import Stripe from 'stripe';
import type { SubStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getActiveTier } from '@/lib/billing/active-tier';
import { CATALOG_CURRENCY, priceLine, UnknownSkuError } from '@/lib/billing/catalog';
import {
  clearedPriceLock,
  priceLockDefect,
  priceLockOnActivation,
  type PriceLockColumns,
} from '@/lib/billing/price-lock';
import { publishedVersionIdFor } from '@/lib/billing/plan-repository';
import { createInvoiceForPayment } from '@/lib/billing/invoice-writer';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock');

interface SubscriptionSyncResult {
  tenantId: string;
  planId: string;
  status: string;
  addedAddOns: string[];
  removedAddOns: string[];
  creditsGranted: number;
  error?: string;
}

/**
 * Maps Stripe subscription status to internal SubStatus enum
 */
function mapStripeStatus(stripeStatus: string): SubStatus {
  switch (stripeStatus) {
    case 'trialing':
      return 'TRIALING';
    case 'active':
      return 'ACTIVE';
    case 'past_due':
      return 'PAST_DUE';
    case 'canceled':
      return 'CANCELED';
    case 'paused':
      return 'PAUSED';
    default:
      return 'PAUSED';
  }
}

/**
 * Extracts plan ID from Stripe subscription by matching price IDs to Plan records
 */
async function extractPlanIdFromSubscription(
  subscription: Stripe.Subscription
): Promise<string> {
  const mainItem = subscription.items?.data?.[0];
  if (!mainItem?.price?.id) {
    return 'free'; // Fallback for subscriptions without a main plan item
  }

  const plan = await prisma.plan.findFirst({
    where: {
      OR: [
        { stripePriceMonthly: mainItem.price.id },
        { stripePriceYearly: mainItem.price.id },
      ],
    },
  });

  return plan?.id || 'free';
}

/**
 * Extracts add-ons from Stripe subscription items (skipping the main plan item)
 */
async function extractAddOnsFromSubscription(
  subscription: Stripe.Subscription
): Promise<Array<{ sku: string; quantity: number; itemId: string }>> {
  if (!subscription.items?.data || subscription.items.data.length <= 1) {
    return [];
  }

  // Get all items except the main plan item (first item)
  const addonItems = subscription.items.data.slice(1);
  const priceIds = addonItems
    .map((item) => (typeof item.price === 'string' ? undefined : item.price?.id))
    .filter(Boolean) as string[];

  if (priceIds.length === 0) {
    return [];
  }

  const addOnCatalogs = await prisma.addOnCatalog.findMany({
    where: { stripePriceId: { in: priceIds } },
  });

  type CatalogMapEntry = [key: string, value: typeof addOnCatalogs[0]];
  const catalogMap = new Map<string, typeof addOnCatalogs[0]>(
    addOnCatalogs.map(
      (c: typeof addOnCatalogs[0]): CatalogMapEntry => [
        c.stripePriceId as string,
        c,
      ]
    )
  );

  return addonItems
    .map((item) => {
      const priceId = typeof item.price === 'string' ? undefined : item.price?.id;
      if (!priceId) return null;
      const catalog = catalogMap.get(priceId);
      if (!catalog) return null;
      return {
        sku: catalog.sku as string,
        quantity: item.quantity || 1,
        itemId: item.id,
      };
    })
    .filter((a): a is NonNullable<typeof a> => a !== null);
}

/**
 * What one period of this subscription actually costs, for the price lock.
 *
 * Read off the Stripe subscription item first: that is the amount Stripe will
 * charge on every renewal, so it is the truth about what the customer joined at
 * rather than a second guess at it. Only when Stripe carries no unit amount
 * (a mocked object in a test, a legacy item) does it fall back to pricing the
 * plan through the catalogue at the campaign that is running.
 */
function chargedAmountForLock(
  subscription: Stripe.Subscription,
  planId: string,
  billingInterval: string
): { amountMinor: number; currency: string } {
  const item = subscription.items?.data?.[0];
  const price = typeof item?.price === 'string' ? null : item?.price;
  if (price && typeof price.unit_amount === 'number' && price.unit_amount >= 0) {
    return {
      amountMinor: price.unit_amount,
      currency: (price.currency ?? CATALOG_CURRENCY).toUpperCase(),
    };
  }

  try {
    const line = priceLine(
      { sku: planId, billingCycle: billingInterval === 'year' ? 'yearly' : 'monthly' },
      getActiveTier()
    );
    return { amountMinor: line.amountMinor, currency: line.currency };
  } catch (error) {
    if (error instanceof UnknownSkuError) {
      // `free` and any retired id are not sellable lines. A subscription on one
      // has no price to keep, so the lock records zero rather than refusing the
      // whole sync over an amount nobody is charged.
      return { amountMinor: 0, currency: CATALOG_CURRENCY };
    }
    throw error;
  }
}

/**
 * The price-lock columns this activation writes, or `null` to leave them alone.
 *
 * `priceLockOnActivation` holds the whole rule and is unit-tested in
 * `price-lock.test.ts`; this only supplies it with the charge and logs the
 * one thing worth hearing about — a lock already in the database that is not
 * whole, which would otherwise quietly re-price the customer at today's
 * campaign.
 */
function priceLockUpdate(
  subscription: Stripe.Subscription,
  existing: ({ status?: string | null } & Partial<PriceLockColumns>) | null,
  planId: string,
  billingInterval: string
): PriceLockColumns | null {
  const defect = priceLockDefect(existing);
  if (defect) {
    logger.warn('Subscription carries an unusable price lock; it will not be honoured', {
      tenantId: (subscription.metadata?.tenantId as string) ?? '',
      defect,
    });
  }

  const decision = priceLockOnActivation({
    existing,
    activeTier: getActiveTier(),
    charged: chargedAmountForLock(subscription, planId, billingInterval),
    now: new Date(),
  });
  return decision.action === 'write' ? decision.columns : null;
}

/**
 * The audit row a Stripe event already wrote, or `null` if it is new.
 *
 * Every handler below opens with this: Stripe retries a webhook for up to three
 * days, so a redelivery is ordinary traffic and must be a no-op.
 *
 * The filter used to be `data: { equals: { stripeEventId: eventId } }`, which
 * reads as "the row whose stripeEventId is this one" and is not that. On a Json
 * column `equals` compares the *whole* document, so it only matched a row whose
 * `data` was exactly `{"stripeEventId": "..."}` — and every row these handlers
 * write carries more keys than that. The guard therefore never matched, and a
 * redelivered event was processed a second time in full: a second audit row, a
 * second monthly credit grant, and a cancelled subscription pulled back to
 * ACTIVE by a stale `active` event (TASK-MTSY88Q6AMCGB, measured).
 *
 * `path` addresses the one key instead, which is what was meant.
 *
 * This is a read-then-write guard, so it settles a redelivery, not two truly
 * simultaneous deliveries of the same event. Closing that would take a unique
 * constraint on the event id, which is a migration and is not this change.
 */
async function auditForStripeEvent(eventId: string) {
  return prisma.auditEvent.findFirst({
    where: {
      data: { path: ['stripeEventId'], equals: eventId },
    },
  });
}

/**
 * Syncs a Stripe subscription to the database, updating Subscription and AddOn records.
 * Handles plan changes, add-on changes, and credit grants.
 * Logs audit events for all changes.
 * Idempotent: using event.id as idempotency key.
 */
export async function syncStripeSubscription(
  subscription: Stripe.Subscription,
  eventId: string
): Promise<SubscriptionSyncResult> {
  // Check if we've already processed this event
  const existingAudit = await auditForStripeEvent(eventId);

  if (existingAudit) {
    console.log(`Event ${eventId} already processed; skipping`);
    return {
      tenantId: existingAudit.tenantId || '',
      planId: '',
      status: 'skipped',
      addedAddOns: [],
      removedAddOns: [],
      creditsGranted: 0,
    };
  }

  // Determine tenant ID from metadata or subscription description
  const tenantId =
    subscription.metadata?.tenantId || subscription.description || '';

  if (!tenantId) {
    throw new Error(
      `Unable to determine tenantId from subscription ${subscription.id}`
    );
  }

  // Verify tenant exists
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });

  if (!tenant) {
    throw new Error(`Tenant not found: ${tenantId}`);
  }

  // Extract plan from subscription
  const planId = await extractPlanIdFromSubscription(subscription);

  // Verify plan exists
  const plan = await prisma.plan.findUnique({
    where: { id: planId },
  });

  if (!plan) {
    throw new Error(`Plan not found: ${planId}`);
  }

  // Extract add-ons from subscription
  const incomingAddOns = await extractAddOnsFromSubscription(subscription);

  // Fetch existing subscription to detect changes
  const existingSubscription = await prisma.subscription.findUnique({
    where: { tenantId },
  });

  // Upsert subscription
  const stripeSubscription = subscription as {
    current_period_end?: number;
  } & Stripe.Subscription;
  const currentPeriodEnd =
    stripeSubscription.current_period_end &&
    typeof stripeSubscription.current_period_end === 'number'
      ? new Date(stripeSubscription.current_period_end * 1000)
      : null;

  const billingInterval = subscription.billing_cycle_anchor ? 'year' : 'month';

  // The price the tenant joined at, kept — see src/lib/billing/price-lock.ts.
  // `null` means "leave whatever is there alone", which is what a duplicate
  // event, a renewal and a plan change all get.
  const lockColumns = priceLockUpdate(subscription, existingSubscription, planId, billingInterval);

  // The terms this subscription is entitled from — the version the plan sells
  // right now (TASK-MTSJH8NMAXPRM). `Subscription.planVersionId` had sat unused
  // since the studio's first phase, so `getEntitlements` had nothing to read
  // and fell back to the compiled catalogue for every subscription ever sold.
  //
  // Written on a first sale and on a plan change only. A renewal leaves it
  // alone: moving a tenant between versions is the publish's job, and doing it
  // on renewal would quietly re-term whoever happened to pay that day. `null`
  // (a plan with no published version) also leaves it alone, so a purchase is
  // never lost to an unpublished plan — the catalogue answers as before.
  const planChanged = !existingSubscription || existingSubscription.planId !== planId;
  const versionId = planChanged ? await publishedVersionIdFor(planId) : null;
  const versionColumn = versionId ? { planVersionId: versionId } : {};

  await prisma.subscription.upsert({
    where: { tenantId },
    create: {
      tenantId,
      planId,
      status: mapStripeStatus(subscription.status),
      billingInterval,
      provider: 'stripe',
      providerCustomerId: subscription.customer as string,
      providerSubId: subscription.id,
      currentPeriodEnd,
      ...versionColumn,
      ...(lockColumns ?? {}),
    },
    update: {
      planId,
      status: mapStripeStatus(subscription.status),
      currentPeriodEnd,
      ...versionColumn,
      ...(lockColumns ?? {}),
    },
  });

  // Sync add-ons
  const addedAddOns: string[] = [];
  const removedAddOns: string[] = [];

  // Get current active add-ons
  const currentAddOns = await prisma.addOn.findMany({
    where: { tenantId, endedAt: null },
  });

  const currentAddOnSkus = new Set(
    currentAddOns.map((a: typeof currentAddOns[0]) => a.sku)
  );
  const incomingAddOnSkus = new Set(incomingAddOns.map((a) => a.sku));

  // Find removed add-ons
  for (const sku of currentAddOnSkus) {
    const skuStr = sku as string;
    if (!incomingAddOnSkus.has(skuStr)) {
      removedAddOns.push(skuStr);
      // Mark as ended
      await prisma.addOn.updateMany({
        where: { tenantId, sku: skuStr, endedAt: null },
        data: { endedAt: new Date() },
      });
    }
  }

  // Add new add-ons or update existing ones
  for (const addon of incomingAddOns) {
    const existing = await prisma.addOn.findFirst({
      where: { tenantId, sku: addon.sku, endedAt: null },
    });

    if (!existing) {
      addedAddOns.push(addon.sku);
      await prisma.addOn.create({
        data: {
          tenantId,
          sku: addon.sku,
          quantity: addon.quantity,
          providerItemId: addon.itemId,
        },
      });
    } else if (existing.quantity !== addon.quantity) {
      // Update quantity if changed
      await prisma.addOn.update({
        where: { id: existing.id },
        data: { quantity: addon.quantity },
      });
    }
  }

  // Grant credits on successful subscription (only on initial setup or re-activation)
  let creditsGranted = 0;

  if (!existingSubscription && subscription.status === 'active') {
    // New subscription — grant initial monthly allowance
    creditsGranted = plan.aiCreditsMonthly;

    await prisma.creditLedger.create({
      data: {
        tenantId,
        delta: creditsGranted,
        reason: 'monthly_grant',
        refId: subscription.id,
      },
    });
  } else if (
    existingSubscription &&
    existingSubscription.status !== 'ACTIVE' &&
    subscription.status === 'active'
  ) {
    // Re-activation after cancellation — grant fresh monthly allowance
    creditsGranted = plan.aiCreditsMonthly;

    await prisma.creditLedger.create({
      data: {
        tenantId,
        delta: creditsGranted,
        reason: 'monthly_grant',
        refId: subscription.id,
      },
    });
  }

  // Handle downgrade: if plan changed to a lower tier, mark module state changes
  if (existingSubscription && existingSubscription.planId !== planId) {
    // Find modules that are no longer in the new plan
    const oldPlan = await prisma.plan.findUnique({
      where: { id: existingSubscription.planId },
    });

    if (oldPlan) {
      const oldModules = new Set(oldPlan.modules);
      const newModules = new Set(plan.modules);

      for (const moduleId of oldModules) {
        const moduleIdStr = moduleId as string;
        if (!newModules.has(moduleIdStr)) {
          // Turn off module
          await prisma.moduleState.upsert({
            where: { tenantId_moduleId: { tenantId, moduleId: moduleIdStr } },
            create: { tenantId, moduleId: moduleIdStr, status: 'OFF' },
            update: { status: 'OFF' },
          });
        }
      }
    }
  }

  // Log audit event
  await prisma.auditEvent.create({
    data: {
      tenantId,
      type: 'subscription.updated',
      target: subscription.id,
      data: {
        stripeEventId: eventId,
        planId,
        status: mapStripeStatus(subscription.status),
        addedAddOns,
        removedAddOns,
        creditsGranted,
        planChanged: existingSubscription?.planId !== planId,
        // The lock is a column, not a table, so this is where its history lives:
        // "what rate did we lock, and when" stays answerable after an upgrade or
        // a cancellation has overwritten the column.
        priceLock: lockColumns
          ? {
              tierCode: lockColumns.lockedTierCode,
              percentOff: lockColumns.lockedPercentOff,
              amountMinor: lockColumns.lockedAmountMinor,
              currency: lockColumns.lockedCurrency,
              lockedAt: lockColumns.priceLockedAt?.toISOString() ?? null,
            }
          : 'unchanged',
      },
    },
  });

  return {
    tenantId,
    planId,
    status: mapStripeStatus(subscription.status),
    addedAddOns,
    removedAddOns,
    creditsGranted,
  };
}

/**
 * Handles subscription deletion by downgrading to free plan
 */
export async function handleSubscriptionCancellation(
  subscription: Stripe.Subscription,
  eventId: string
): Promise<SubscriptionSyncResult> {
  const tenantId =
    subscription.metadata?.tenantId || subscription.description || '';

  if (!tenantId) {
    throw new Error(
      `Unable to determine tenantId from subscription ${subscription.id}`
    );
  }

  // Check idempotency
  const existingAudit = await auditForStripeEvent(eventId);

  if (existingAudit) {
    return {
      tenantId,
      planId: 'free',
      status: 'skipped',
      addedAddOns: [],
      removedAddOns: [],
      creditsGranted: 0,
    };
  }

  // Update subscription status, and drop the price lock with it: the locked
  // rate belongs to the subscription that just ended, not to the tenant. Coming
  // back means joining again, at whatever campaign is running then — which is
  // what `priceLockOnActivation` does with a CANCELED row.
  await prisma.subscription.update({
    where: { tenantId },
    data: { status: 'CANCELED', ...clearedPriceLock() },
  });

  // End all add-ons
  await prisma.addOn.updateMany({
    where: { tenantId, endedAt: null },
    data: { endedAt: new Date() },
  });

  // Turn off non-free modules
  const freePlan = await prisma.plan.findUnique({
    where: { id: 'free' },
  });

  if (freePlan) {
    const freeModules = new Set(freePlan.modules);
    const allModules = await prisma.moduleCatalog.findMany();

    for (const moduleCatalog of allModules) {
      if (!freeModules.has(moduleCatalog.id)) {
        await prisma.moduleState.upsert({
          where: { tenantId_moduleId: { tenantId, moduleId: moduleCatalog.id } },
          create: { tenantId, moduleId: moduleCatalog.id, status: 'OFF' },
          update: { status: 'OFF' },
        });
      }
    }
  }

  // Log audit event
  await prisma.auditEvent.create({
    data: {
      tenantId,
      type: 'subscription.canceled',
      target: subscription.id,
      data: {
        stripeEventId: eventId,
        reason: subscription.cancellation_details?.reason || 'user_requested',
        priceLock: 'cleared',
      },
    },
  });

  return {
    tenantId,
    planId: 'free',
    status: 'CANCELED',
    addedAddOns: [],
    removedAddOns: [],
    creditsGranted: 0,
  };
}

/**
 * Logs successful invoice payment to audit trail
 */
export async function logInvoicePayment(
  invoice: Stripe.Invoice,
  eventId: string
): Promise<void> {
  const stripeInvoice = invoice as { subscription?: string } & Stripe.Invoice;
  const subscriptionId = stripeInvoice.subscription;
  if (!subscriptionId) {
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  const tenantId =
    subscription.metadata?.tenantId || subscription.description || '';

  if (!tenantId) {
    console.warn(
      `Unable to determine tenantId for invoice ${invoice.id}; skipping log`
    );
    return;
  }

  // Check idempotency
  const existingAudit = await auditForStripeEvent(eventId);

  if (existingAudit) {
    return;
  }

  await prisma.auditEvent.create({
    data: {
      tenantId,
      type: 'invoice.payment_succeeded',
      target: invoice.id,
      data: {
        stripeEventId: eventId,
        amountCents: invoice.amount_paid,
        currency: invoice.currency,
        url: invoice.hosted_invoice_url,
      },
    },
  });

  // The invoice document Fabrika issues for this payment, shared with the
  // iyzico path (TASK-MTSWL8ADKZKDM). Stripe's own hosted invoice is a receipt
  // from Stripe; it is not a Turkish e-Fatura and cannot be filed with GİB.
  //
  // Deliberately outside the audit write and never allowed to throw upward: a
  // payment that succeeded must stay recorded even if no invoice can be issued
  // for it. `createInvoiceForPayment` reports that case as `skipped` with a
  // SystemAlert; a genuine database failure is caught here so a webhook Stripe
  // will retry does not replay the whole subscription sync for it.
  //
  // Idempotency here rests on `Invoice.paymentRef` being unique per tenant as
  // well as on the `existingAudit` guard above: the guard stops a redelivery
  // before this line, and the constraint stops a payment reaching the writer
  // twice by any other route.
  try {
    await createInvoiceForPayment(
      prisma,
      {
        tenantId,
        paymentRef: invoice.id ?? eventId,
        amountMinor: invoice.amount_paid,
        currency: invoice.currency.toUpperCase(),
        description: invoiceLineDescription(invoice),
        paidAt: new Date(),
        provider: 'stripe',
      }
      // No third argument: the VAT rate is no longer a server setting. It comes
      // from the buyer's country inside the writer (boss decision 2026-09-08).
    );
  } catch (error) {
    console.error(
      `[logInvoicePayment] invoice not issued for ${invoice.id}: ${
        error instanceof Error ? error.message : 'unknown error'
      }`
    );
  }
}

/**
 * What the invoice line should say this payment bought.
 *
 * Taken from the description Stripe already carries on the line item, because
 * that is the wording the customer saw at checkout. When Stripe sends no
 * description the line falls back to naming the period rather than inventing a
 * plan name — the invoice may be vague about the product, never wrong about it.
 */
function invoiceLineDescription(invoice: Stripe.Invoice): string {
  const first = invoice.lines?.data?.[0]?.description?.trim();
  return first && first.length > 0 ? first : 'Fabrika abonelik dönemi';
}
