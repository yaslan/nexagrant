import { prisma } from './db';
import {
  CATALOG_CURRENCY,
  FALLBACK_PLAN_ID,
  PLAN_GRANTS,
  findEntry,
  grantsFor,
  resolvePlanId,
} from './billing/catalog';

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
  allowedModules: string[];
  seats: number;
  workspaces: number;
  aiCreditsMonthly: number;
}

/**
 * What a tenant is entitled to right now.
 *
 * Capacity and module grants come from the billing catalogue, not from the
 * `Plan` row: the row is a projection of the catalogue written by the seed, and
 * reading the catalogue directly means a stale or hand-edited row cannot
 * silently hand out a module (TASK-MTR6QIE05ZKNH). Add-ons stay in the
 * database, because they are per-subscription purchases rather than catalogue
 * facts.
 *
 * A retired EUR plan id still sitting on a subscription resolves to its
 * replacement (`team` → `pro`) instead of throwing, so a row the migration did
 * not reach is served rather than locked out.
 */
export async function getEntitlements(tenantId: string): Promise<Entitlements> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      subscription: {
        include: {
          addOns: true,
        },
      },
    },
  });

  if (!tenant) {
    throw new Error(`Tenant not found: ${tenantId}`);
  }

  let planId: string = FALLBACK_PLAN_ID;
  if (tenant.subscription && ['TRIALING', 'ACTIVE'].includes(tenant.subscription.status)) {
    planId = resolvePlanId(tenant.subscription.planId);
  }

  const plan = grantsFor(planId);

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
      const catalog: AddOnCatalogRow[] = await prisma.addOnCatalog.findMany({
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
    allowedModules: Array.from(allowedModules),
    seats,
    workspaces,
    aiCreditsMonthly,
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
