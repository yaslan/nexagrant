import type { TenantTx } from './db';
import { logger } from './logger';
import {
  CATALOG_CURRENCY,
  FALLBACK_PLAN_ID,
  PLAN_GRANTS,
  findEntry,
  grantsFor,
  resolvePlanId,
} from './billing/catalog';
import {
  grantFromPlanVersion,
  planVersionRefusal,
  type EntitlementSource,
  type SubscribedPlanVersion,
} from './billing/entitlement-source';

/**
 * prisma/schema.prisma `model AddOn` — one purchased add-on on a subscription.
 *
 * Query results arrive untyped here (`prisma generate` does not run in this
 * repo; see src/types/prisma-override.d.ts), so the rows these two queries
 * return are declared rather than inferred.
 */
interface AddOnRow {
  sku: string;
  quantity: number;
  endedAt: Date | null;
}

/** prisma/schema.prisma `model AddOnCatalog` — what a sku grants. */
interface AddOnCatalogRow {
  sku: string;
  grantsModule: string | null;
  grantsSeats: number | null;
  grantsCredits: number | null;
  grantsWorkspaces: number | null;
}

export interface Entitlements {
  /**
   * The plan the figures belong to, after `resolvePlanId` (a retired id is
   * already its replacement); `free` when no live subscription. For limits that
   * are read from the catalogue by plan, such as `partnerSearchGrant`.
   */
  planId: string;
  allowedModules: string[];
  seats: number;
  workspaces: number;
  aiCreditsMonthly: number;
  /**
   * Which row decided the figures above — the subscription's own published
   * `PlanVersion`, or the compiled catalogue. Reported rather than inferred so
   * an operator looking at a quota can tell whether the studio reaches it;
   * `'catalogue'` on a live subscription means the backfill has not run for it.
   */
  source: EntitlementSource;
  /** The version the figures came from, `null` when the catalogue answered. */
  planVersionId: string | null;
}

/**
 * What a tenant is entitled to right now.
 *
 * The capacity and module grant comes from the **published `PlanVersion` the
 * subscription points at** — the immutable row holding the terms that tenant is
 * living under. That is what makes the plan studio real: raising Pro from 6
 * seats to 10 and publishing moves every live Pro subscription onto the new
 * version (`publishVersion`), and this function reads it.
 *
 * When the subscription carries no version — sold before the column was
 * written, or a plan with no published version — the compiled catalogue answers
 * exactly as it did before, and the reason a row is not entitled from the
 * `Plan` table still holds: `Plan` is a projection, and a stale or hand-edited
 * row must not hand out a module (TASK-MTR6QIE05ZKNH). The full rule, including
 * the two pointers that are refused, is in
 * src/lib/billing/entitlement-source.ts.
 *
 * Add-ons stay in the database, because they are per-subscription purchases
 * rather than catalogue facts.
 *
 * A retired EUR plan id still sitting on a subscription resolves to its
 * replacement (`team` → `pro`) instead of throwing, so a row the migration did
 * not reach is served rather than locked out.
 *
 * `client` is required (FA-49): Subscription is tenant-scoped, so a call on the
 * bare singleton reads no subscription under fabrika_app and silently entitles
 * a paying tenant from the free fallback. Callers open `withTenant`.
 */
export async function getEntitlements(tenantId: string, client: TenantTx): Promise<Entitlements> {
  const db = client;
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    include: {
      subscription: {
        include: {
          addOns: true,
          // Joined, not fetched separately: the version is read on every
          // entitlement check, and a second round trip per check would be paid
          // by every module gate in the app.
          planVersion: true,
        },
      },
    },
  });

  if (!tenant) {
    throw new Error(`Tenant not found: ${tenantId}`);
  }

  let planId: string = FALLBACK_PLAN_ID;
  let live = false;
  if (tenant.subscription && ['TRIALING', 'ACTIVE'].includes(tenant.subscription.status)) {
    planId = resolvePlanId(tenant.subscription.planId);
    live = true;
  }

  // The version only speaks for a live subscription. A CANCELED row may still
  // carry the pointer it had while it was paying; entitling from it would keep
  // a cancelled tenant on Pro.
  const versionRow: SubscribedPlanVersion | null = live
    ? ((tenant.subscription?.planVersion as SubscribedPlanVersion | null) ?? null)
    : null;
  const fromVersion = grantFromPlanVersion(planId, versionRow);

  if (versionRow && !fromVersion) {
    // Refused, not silently ignored: a subscription pointing at another plan's
    // version, or at a draft, is a defect somewhere upstream and the tenant is
    // being served from the catalogue instead.
    logger.warn('Subscription plan version refused; entitling from the catalogue', {
      tenantId,
      planId,
      planVersionId: versionRow.id,
      reason: planVersionRefusal(planId, versionRow) ?? 'unknown',
    });
  }

  const plan = fromVersion?.grant ?? grantsFor(planId);

  if (!plan) {
    throw new Error(`Plan not found in catalogue: ${planId}`);
  }

  const allowedModules = new Set<string>(plan.moduleIds);
  let seats = plan.seats + (tenant.subscription?.seatsExtra || 0);
  let workspaces = plan.workspaces + (tenant.subscription?.workspacesExtra || 0);
  let aiCreditsMonthly = plan.aiCreditsMonthly;

  if (tenant.subscription && tenant.subscription.addOns) {
    const activeAddOns: AddOnRow[] = tenant.subscription.addOns.filter(
      (a: AddOnRow) => !a.endedAt || a.endedAt > new Date()
    );
    
    if (activeAddOns.length > 0) {
      const addOnSkus = activeAddOns.map((a) => a.sku);
      const catalog: AddOnCatalogRow[] = await db.addOnCatalog.findMany({
        where: { sku: { in: addOnSkus } }
      });
      const catalogMap = new Map(catalog.map((c) => [c.sku, c]));

      for (const addon of activeAddOns) {
        const details = catalogMap.get(addon.sku);
        if (details) {
          if (details.grantsModule) {
            allowedModules.add(details.grantsModule);
          }
          if (details.grantsSeats) {
            seats += (details.grantsSeats * addon.quantity);
          }
          if (details.grantsWorkspaces) {
            workspaces += (details.grantsWorkspaces * addon.quantity);
          }
          if (details.grantsCredits) {
            // Note: One-time credits logic should usually map directly to ledger, 
            // but if they are treated as monthly here, we add them. 
            // According to BILLING.md, 'addon_credits_250' is one-time, so it usually
            // is handled directly by Stripe webhook injecting to CreditLedger.
            // For simplicity we add it to the 'monthly' limit, but ideally the ledger
            // handles this as a transaction.
            aiCreditsMonthly += (details.grantsCredits * addon.quantity);
          }
        }
      }
    }
  }

  return {
    planId,
    allowedModules: Array.from(allowedModules),
    seats,
    workspaces,
    aiCreditsMonthly,
    source: fromVersion ? 'plan-version' : 'catalogue',
    planVersionId: fromVersion?.versionId ?? null,
  };
}

export interface PlanDetails {
  id: string;
  name: string;
  price: { monthly: number; yearly: number; currency: string };
  seats: number;
  workspaces: number;
  aiCreditsMonthly: number;
  modules: string[];
}

/**
 * The plan ladder as the product sells it. Derived from the catalogue rather
 * than queried, so this and the pricing panels cannot disagree; `free` is
 * excluded because it is a fallback state, not a purchasable plan.
 *
 * Prices are **list** prices — the campaign discount belongs to checkout.
 */
export function getAllPlans(): PlanDetails[] {
  return PLAN_GRANTS.filter((grant) => grant.purchasable).map((grant) => {
    const entry = findEntry(grant.planId);
    if (!entry || entry.kind !== 'plan') {
      throw new Error(`Purchasable plan ${grant.planId} has no catalogue price`);
    }
    return {
      id: grant.planId,
      name: grant.name,
      price: {
        monthly: entry.monthlyListMinor,
        yearly: entry.yearlyListMinor,
        currency: CATALOG_CURRENCY,
      },
      seats: grant.seats,
      workspaces: grant.workspaces,
      aiCreditsMonthly: grant.aiCreditsMonthly,
      modules: [...grant.moduleIds],
    };
  });
}

export function formatPrice(cents: number, currency: string = CATALOG_CURRENCY): string {
  const major = cents / 100;
  const formatter = new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return formatter.format(major);
}
