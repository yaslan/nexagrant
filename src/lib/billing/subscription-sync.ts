import Stripe from 'stripe';
import { prisma } from '@/lib/db';

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
function mapStripeStatus(stripeStatus: string): string {
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
  const existingAudit = await prisma.auditEvent.findFirst({
    where: {
      data: { equals: { stripeEventId: eventId } },
    },
  });

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

  await prisma.subscription.upsert({
    where: { tenantId },
    create: {
      tenantId,
      planId,
      status: mapStripeStatus(subscription.status),
      billingInterval: subscription.billing_cycle_anchor
        ? 'year'
        : 'month',
      provider: 'stripe',
      providerCustomerId: subscription.customer as string,
      providerSubId: subscription.id,
      currentPeriodEnd,
    },
    update: {
      planId,
      status: mapStripeStatus(subscription.status),
      currentPeriodEnd,
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
  const existingAudit = await prisma.auditEvent.findFirst({
    where: {
      data: { equals: { stripeEventId: eventId } },
    },
  });

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

  // Update subscription status
  await prisma.subscription.update({
    where: { tenantId },
    data: { status: 'CANCELED' },
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
  const existingAudit = await prisma.auditEvent.findFirst({
    where: {
      data: { equals: { stripeEventId: eventId } },
    },
  });

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
}
