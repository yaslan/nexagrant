import { prisma } from './db';

export interface Entitlements {
  allowedModules: string[];
  seats: number;
  workspaces: number;
  aiCreditsMonthly: number;
}

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

  let planId = 'free';
  if (tenant.subscription && ['TRIALING', 'ACTIVE'].includes(tenant.subscription.status)) {
    planId = tenant.subscription.planId;
  }

  const plan = await prisma.plan.findUnique({
    where: { id: planId },
  });

  if (!plan) {
    throw new Error(`Plan not found: ${planId}`);
  }

  const allowedModules = new Set<string>(plan.modules);
  let seats = plan.seats + (tenant.subscription?.seatsExtra || 0);
  let workspaces = plan.workspaces + (tenant.subscription?.workspacesExtra || 0);
  let aiCreditsMonthly = plan.aiCreditsMonthly;

  if (tenant.subscription && tenant.subscription.addOns) {
    const activeAddOns = tenant.subscription.addOns.filter((a: any) => !a.endedAt || a.endedAt > new Date());
    
    if (activeAddOns.length > 0) {
      const addOnSkus = activeAddOns.map((a: any) => a.sku);
      const catalog = await prisma.addOnCatalog.findMany({
        where: { sku: { in: addOnSkus } }
      });
      const catalogMap = new Map(catalog.map((c: any) => [c.sku, c]));

      for (const addon of activeAddOns) {
        const details = catalogMap.get(addon.sku) as any;
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

export async function getAllPlans(): Promise<PlanDetails[]> {
  const plans = await prisma.plan.findMany({
    orderBy: { id: 'asc' },
  });

  return plans.map((plan: (typeof plans)[number]) => ({
    id: plan.id,
    name: plan.name,
    price: {
      monthly: plan.monthlyCents,
      yearly: plan.yearlyCents,
      currency: plan.currency,
    },
    seats: plan.seats,
    workspaces: plan.workspaces,
    aiCreditsMonthly: plan.aiCreditsMonthly,
    modules: plan.modules,
  }));
}

export function formatPrice(cents: number, currency: string = 'EUR'): string {
  const euros = cents / 100;
  const formatter = new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return formatter.format(euros);
}
