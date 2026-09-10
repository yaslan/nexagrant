import Stripe from 'stripe';
import type { SubStatus } from '@prisma/client';
import { prisma, withTenant, type TenantTx } from '@/lib/db';
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
import { invoiceLinePeriodFallback } from '@/lib/efatura';

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
  tenantId: string,
  subscription: Stripe.Subscription,
  existing: ({ status?: string | null } & Partial<PriceLockColumns>) | null,
  planId: string,
  billingInterval: string
): PriceLockColumns | null {
  const defect = priceLockDefect(existing);
  if (defect) {
    // `tenantId` is passed in rather than read off the Stripe metadata again.
    // It used to be `(subscription.metadata?.tenantId as string) ?? ''`, which
    // logged an empty string for a subscription that carries its tenant in
    // `description` instead — a warning naming a tenant that can never be
    // looked up, which is exactly what `assertTenantScope` rejects
    // (`pnpm rls:bypass-check` B2, TASK-MTVSBEO7VX6Y4). The caller has already
    // resolved and validated it; there is one resolution, not two.
    logger.warn('Subscription carries an unusable price lock; it will not be honoured', {
      tenantId,
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

/** Which webhook wrote a `StripeEventLog` row. */
type WebhookHandler = 'subscription.sync' | 'subscription.cancel' | 'invoice.payment';

/**
 * Has this Stripe event already been handled?
 *
 * Stripe retries a webhook for up to three days, so a redelivery is ordinary
 * traffic and must be a no-op. This is the cheap fast path only: the authority
 * is the UNIQUE constraint on `StripeEventLog.stripeEventId`, claimed as the
 * first statement of the same transaction that writes the money
 * (see {@link claimStripeEvent}).
 *
 * Why it is not an `AuditEvent` lookup any more (ADR-0003, TASK-MTVSBEO7VX6Y4):
 * `AuditEvent.tenantId` is nullable, so the table carries `tenant_or_shared`
 * rather than `tenant_isolation`, and a row that HAS a tenant is neither
 * readable nor writable unless `app.tenant_id` is set to that tenant. Under the
 * BYPASSRLS role the app connects as today that is invisible; under
 * `fabrika_app` the guard read returned nothing and the guard write was refused
 * outright — measured, after the credits had already been granted.
 *
 * Reading it inside `withTenant` is therefore not a detail: it is the only
 * scope in which the row exists. A row belonging to another tenant stays
 * hidden here, which is correct rather than a miss — the claim below still
 * collides on it.
 */
async function stripeEventAlreadyHandled(tenantId: string, eventId: string): Promise<boolean> {
  const seen = await withTenant(tenantId, (tx) =>
    tx.stripeEventLog.findUnique({
      where: { stripeEventId: eventId },
      select: { id: true },
    })
  );
  return seen !== null;
}

/**
 * Claims this Stripe event inside the caller's transaction, or reports that
 * someone else already has.
 *
 * Called as the FIRST statement of the transaction that writes the money, so
 * the key and the money commit together or not at all. Before this change the
 * key was written last and outside the transaction: a crash — or, under
 * `fabrika_app`, an RLS refusal — left the money written and the key missing,
 * and the redelivery granted the monthly allowance a second time.
 *
 * The `false` return is what makes two *simultaneous* deliveries safe, not just
 * a redelivery. Both read no row (READ COMMITTED shows neither the other's
 * uncommitted insert), both try to claim, and Postgres refuses one of them —
 * the gap the old read-then-write guard could not close without a constraint.
 */
async function claimStripeEvent(
  tx: TenantTx,
  tenantId: string,
  eventId: string,
  handler: WebhookHandler
): Promise<boolean> {
  try {
    await tx.stripeEventLog.create({
      data: { tenantId, stripeEventId: eventId, handler },
    });
    return true;
  } catch (error) {
    if (isUniqueViolation(error)) return false;
    throw error;
  }
}

/** Prisma's unique-constraint violation. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

/**
 * Thrown inside a `withTenant` callback to roll the transaction back when the
 * claim above lost the race. Not an error the caller reports: the outcome is
 * "already processed", which is a successful no-op.
 */
class StripeEventAlreadyClaimed extends Error {
  constructor() {
    super('stripe event already claimed');
    this.name = 'StripeEventAlreadyClaimed';
  }
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
  // The tenant is resolved before the idempotency check, not after it.
  //
  // It used to be the other way round, because the key was a tenant-less
  // `AuditEvent` lookup. The key now lives in a tenant-scoped table, so the
  // guard needs a tenant to read in — and resolving it first costs nothing:
  // this is pure string handling on the Stripe object, no query (ADR-0003).
  const tenantId =
    subscription.metadata?.tenantId || subscription.description || '';

  if (!tenantId) {
    throw new Error(
      `Unable to determine tenantId from subscription ${subscription.id}`
    );
  }

  // Fast path for a redelivery. Not the authority — `claimStripeEvent` in the
  // write transaction below is — just a way to skip the platform reads.
  if (await stripeEventAlreadyHandled(tenantId, eventId)) {
    console.log(`Event ${eventId} already processed; skipping`);
    return {
      tenantId,
      planId: '',
      status: 'skipped',
      addedAddOns: [],
      removedAddOns: [],
      creditsGranted: 0,
    };
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

  // Fetch existing subscription to detect changes.
  //
  // Its own wrapper, not the write transaction below: the version lookup
  // between the two goes through the bare singleton, and holding a transaction
  // across it would take a second pool connection while the first is still
  // held. This read already stood in its own autocommit before this change, so
  // the window between reading it and writing over it is exactly the one that
  // was there yesterday — see the transaction-boundary measurement in
  // docs/agent-results/TASK-MTVRACMDFRGKV-customer-support.md.
  const existingSubscription = await withTenant(tenantId, (tx) =>
    tx.subscription.findUnique({ where: { tenantId } })
  );

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
  const lockColumns = priceLockUpdate(
    tenantId,
    subscription,
    existingSubscription,
    planId,
    billingInterval
  );

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

  // Which modules the new plan no longer carries.
  //
  // Read here rather than inside the transaction below: `Plan` is a platform
  // table reached through the bare singleton, and asking for it while a tenant
  // transaction holds a pool connection needs a second one. At the pool size
  // this app runs (pg default, max=10) that is how a burst of webhooks
  // deadlocks itself rather than merely queueing.
  const modulesToTurnOff: string[] = [];
  if (existingSubscription && existingSubscription.planId !== planId) {
    const oldPlan = await prisma.plan.findUnique({
      where: { id: existingSubscription.planId },
    });

    if (oldPlan) {
      const oldModules = new Set(oldPlan.modules);
      const newModules = new Set(plan.modules);

      for (const moduleId of oldModules) {
        const moduleIdStr = moduleId as string;
        if (!newModules.has(moduleIdStr)) {
          modulesToTurnOff.push(moduleIdStr);
        }
      }
    }
  }

  // Every tenant-scoped write this handler makes, in one wrapper.
  //
  // `withTenant` sets `app.tenant_id` for the transaction it opens, which is
  // what the RLS policies read; before this change these queries ran on the
  // bare client and were tenant-safe only because each `where` happened to
  // carry `tenantId` by hand (TASK-MTSZ0AL4QP2CT §3.3).
  //
  // One wrapper rather than eleven: eleven would mean eleven `set_config`
  // round-trips for one webhook, and it would leave the subscription row, the
  // add-on rows and the credit grant able to land separately — the state a
  // half-applied plan change leaves behind. Nothing inside reaches the bare
  // singleton, so the transaction never waits on a second connection.
  //
  // The idempotency key is claimed as the FIRST statement in here and the audit
  // row is written as the last, both inside this transaction (ADR-0003). Before
  // this change the key was written after the transaction had committed, on the
  // bare client: a crash — or, under `fabrika_app`, an RLS refusal on a table
  // whose policy the bare client cannot satisfy — left the money written and
  // the key missing, and Stripe's redelivery then granted the monthly allowance
  // again. There is no longer an order of events that produces that state.
  const outcome = await withTenant(tenantId, async (tx) => {
    if (!(await claimStripeEvent(tx, tenantId, eventId, 'subscription.sync'))) {
      // A concurrent delivery of the same event committed the claim while this
      // one was in flight. Roll back rather than write over its work.
      throw new StripeEventAlreadyClaimed();
    }

    await tx.subscription.upsert({
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
    const added: string[] = [];
    const removed: string[] = [];

    // Get current active add-ons
    const currentAddOns = await tx.addOn.findMany({
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
        removed.push(skuStr);
        // Mark as ended
        await tx.addOn.updateMany({
          where: { tenantId, sku: skuStr, endedAt: null },
          data: { endedAt: new Date() },
        });
      }
    }

    // Add new add-ons or update existing ones
    for (const addon of incomingAddOns) {
      const existing = await tx.addOn.findFirst({
        where: { tenantId, sku: addon.sku, endedAt: null },
      });

      if (!existing) {
        added.push(addon.sku);
        await tx.addOn.create({
          data: {
            tenantId,
            sku: addon.sku,
            quantity: addon.quantity,
            providerItemId: addon.itemId,
          },
        });
      } else if (existing.quantity !== addon.quantity) {
        // Update quantity if changed.
        //
        // `updateMany` with the tenant in the predicate rather than
        // `update({ where: { id } })`: the id came from the `findFirst`
        // three lines up, inside this same transaction and already filtered
        // by `tenantId`, so the row count is always 1 and nothing observable
        // changes — but the tenant now travels with the write as well as
        // with the read, which is what the rest of this file already does.
        await tx.addOn.updateMany({
          where: { id: existing.id, tenantId },
          data: { quantity: addon.quantity },
        });
      }
    }

    // Grant credits on successful subscription (only on initial setup or re-activation)
    let granted = 0;

    if (!existingSubscription && subscription.status === 'active') {
      // New subscription — grant initial monthly allowance
      granted = plan.aiCreditsMonthly;

      await tx.creditLedger.create({
        data: {
          tenantId,
          delta: granted,
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
      granted = plan.aiCreditsMonthly;

      await tx.creditLedger.create({
        data: {
          tenantId,
          delta: granted,
          reason: 'monthly_grant',
          refId: subscription.id,
        },
      });
    }

    // Handle downgrade: modules the new plan no longer carries are turned off
    for (const moduleId of modulesToTurnOff) {
      await tx.moduleState.upsert({
        where: { tenantId_moduleId: { tenantId, moduleId } },
        create: { tenantId, moduleId, status: 'OFF' },
        update: { status: 'OFF' },
      });
    }

    // The audit trail, written here rather than after the commit. It is no
    // longer the idempotency key — `StripeEventLog` is — but it still has to
    // land under the tenant it belongs to, which is the only scope in which
    // `AuditEvent`'s `tenant_or_shared` policy will accept it.
    await tx.auditEvent.create({
      data: {
        tenantId,
        type: 'subscription.updated',
        target: subscription.id,
        data: {
          stripeEventId: eventId,
          planId,
          status: mapStripeStatus(subscription.status),
          addedAddOns: added,
          removedAddOns: removed,
          creditsGranted: granted,
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

    return { addedAddOns: added, removedAddOns: removed, creditsGranted: granted };
  }).catch((error: unknown) => {
    if (error instanceof StripeEventAlreadyClaimed) return null;
    throw error;
  });

  // `null` means the claim lost the race; the delivery that won it did the work.
  if (outcome === null) {
    console.log(`Event ${eventId} claimed concurrently; skipping`);
    return {
      tenantId,
      planId: '',
      status: 'skipped',
      addedAddOns: [],
      removedAddOns: [],
      creditsGranted: 0,
    };
  }

  return {
    tenantId,
    planId,
    status: mapStripeStatus(subscription.status),
    addedAddOns: outcome.addedAddOns,
    removedAddOns: outcome.removedAddOns,
    creditsGranted: outcome.creditsGranted,
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

  // Check idempotency — fast path only; the claim inside the transaction below
  // is the authority (ADR-0003).
  if (await stripeEventAlreadyHandled(tenantId, eventId)) {
    return {
      tenantId,
      planId: 'free',
      status: 'skipped',
      addedAddOns: [],
      removedAddOns: [],
      creditsGranted: 0,
    };
  }

  // The free plan and the module catalogue are platform tables — no tenant
  // column, no RLS policy — and they are read here, before the wrapper, so the
  // tenant transaction below never has to reach for a second pool connection
  // while holding one. They were read after the subscription update before this
  // change; a lookup that throws still throws, and these two reads write
  // nothing, so the only difference is that a cancellation which fails on a
  // missing subscription row now costs two harmless SELECTs first.
  const freePlan = await prisma.plan.findUnique({
    where: { id: 'free' },
  });

  const modulesToTurnOff: string[] = [];
  if (freePlan) {
    const freeModules = new Set(freePlan.modules);
    const allModules = await prisma.moduleCatalog.findMany();

    for (const moduleCatalog of allModules) {
      if (!freeModules.has(moduleCatalog.id)) {
        modulesToTurnOff.push(moduleCatalog.id);
      }
    }
  }

  // Every tenant-scoped write of a cancellation, in one wrapper — see the note
  // on the same wrapper in `syncStripeSubscription`. The idempotency claim and
  // the audit row are inside it now, so a cancellation that lands leaves its
  // key behind and a cancellation that fails leaves nothing at all.
  const claimed = await withTenant(tenantId, async (tx) => {
    if (!(await claimStripeEvent(tx, tenantId, eventId, 'subscription.cancel'))) {
      throw new StripeEventAlreadyClaimed();
    }

    // Update subscription status, and drop the price lock with it: the locked
    // rate belongs to the subscription that just ended, not to the tenant. Coming
    // back means joining again, at whatever campaign is running then — which is
    // what `priceLockOnActivation` does with a CANCELED row.
    await tx.subscription.update({
      where: { tenantId },
      data: { status: 'CANCELED', ...clearedPriceLock() },
    });

    // End all add-ons
    await tx.addOn.updateMany({
      where: { tenantId, endedAt: null },
      data: { endedAt: new Date() },
    });

    // Turn off non-free modules
    for (const moduleId of modulesToTurnOff) {
      await tx.moduleState.upsert({
        where: { tenantId_moduleId: { tenantId, moduleId } },
        create: { tenantId, moduleId, status: 'OFF' },
        update: { status: 'OFF' },
      });
    }

    await tx.auditEvent.create({
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

    return true;
  }).catch((error: unknown) => {
    if (error instanceof StripeEventAlreadyClaimed) return false;
    throw error;
  });

  if (!claimed) {
    return {
      tenantId,
      planId: 'free',
      status: 'skipped',
      addedAddOns: [],
      removedAddOns: [],
      creditsGranted: 0,
    };
  }

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

  // Check idempotency — fast path; the claim inside the transaction is the
  // authority (ADR-0003).
  if (await stripeEventAlreadyHandled(tenantId, eventId)) {
    return;
  }

  // The claim and the audit row, together or not at all.
  //
  // The invoice document is deliberately NOT in here — see the comment on
  // `createInvoiceForPayment` below. It carries its own idempotency
  // (`Invoice.paymentRef` is unique per tenant), so it does not need this
  // transaction to be safe, and putting it inside would take a second pool
  // connection while this one is held (it fetches a TCMB rate over the network
  // and writes SystemAlert rows through the bare singleton).
  const claimed = await withTenant(tenantId, async (tx) => {
    if (!(await claimStripeEvent(tx, tenantId, eventId, 'invoice.payment'))) {
      throw new StripeEventAlreadyClaimed();
    }

    await tx.auditEvent.create({
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

    return true;
  }).catch((error: unknown) => {
    if (error instanceof StripeEventAlreadyClaimed) return false;
    throw error;
  });

  if (!claimed) {
    return;
  }

  // The invoice document FonBridge issues for this payment, shared with the
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
  // well as on the `StripeEventLog` claim above: the claim stops a redelivery
  // before this line, and the constraint stops a payment reaching the writer
  // twice by any other route.
  //
  // Unchanged by ADR-0003 and worth stating plainly: because the claim commits
  // first, an invoice that cannot be issued is not retried by the redelivery.
  // That was already true when the audit row played the key's part, and the
  // `catch` below plus the writer's own SystemAlert are what make it visible.
  try {
    // The language the fallback line is written in, when Stripe sends no
    // description of its own. `Tenant.locale` is the only place this is recorded:
    // a Stripe webhook carries no user and no request, so there is no
    // Accept-Language and no next-intl context to inherit here.
    //
    // Read inside the `try` on purpose: this is a second database round-trip on a
    // path whose whole point is that a database failure must not fail a payment
    // that already succeeded. Outside it, a tenant lookup that threw would replay
    // the webhook Stripe retries — the exact thing the catch below exists to stop.
    // Read after the idempotency guard, so a redelivered event does not pay for it.
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { locale: true },
    });

    await createInvoiceForPayment(
      prisma,
      {
        tenantId,
        paymentRef: invoice.id ?? eventId,
        amountMinor: invoice.amount_paid,
        currency: invoice.currency.toUpperCase(),
        description: invoiceLineDescription(invoice, tenant?.locale ?? null),
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
 *
 * That fallback is printed onto a document the customer downloads, so it is
 * catalogued in both languages like any other user-visible sentence (CLAUDE.md
 * rule 8) and carries `{brand}` rather than the product name as a literal.
 *
 * The description Stripe itself sends is passed through untranslated on purpose:
 * it is the wording the buyer accepted at checkout, and restating a line the
 * customer agreed to in words we chose would make the invoice disagree with the
 * sale. Only the sentence we author is ours to translate.
 */
function invoiceLineDescription(invoice: Stripe.Invoice, locale: string | null): string {
  const first = invoice.lines?.data?.[0]?.description?.trim();
  return first && first.length > 0 ? first : invoiceLinePeriodFallback(locale);
}
