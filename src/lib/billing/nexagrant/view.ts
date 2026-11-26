/**
 * NG-57 — the serialisable shapes the NexaGrant billing server actions return (the server
 * contract NG-11 builds the pricing and plan screens on). Pure; dates as ISO strings.
 */
import { NG_FEATURE_KEYS, type NgCurrency, type NgFeatureKey, type NgInterval } from './features';
import { entitlementFor, featureLimit, priceOffersFor, type NgEntitlement } from './entitlement';
import type { NgCatalog, NgBillingState } from './repository';
import type { NgUsage } from './usage';
import type { Role, SubStatus } from '@prisma/client';
import { can } from '@/lib/rbac';

export interface NgFeatureView {
  key: NgFeatureKey;
  /** null = unlimited. */
  limit: number | null;
}

export interface NgPlanView {
  id: string;
  tier: string;
  sortOrder: number;
  sellable: boolean;
  isFallback: boolean;
  /** Granted features only, in NG_FEATURE_KEYS order. */
  features: NgFeatureView[];
  prices: { currency: NgCurrency; interval: NgInterval; amountMinor: number | null; purchasable: boolean }[];
}

export interface NgTrialPolicyView {
  segment: string;
  days: number;
  planId: string;
  endPlanId: string;
}

export interface NgCatalogView {
  plans: NgPlanView[];
  trialPolicies: NgTrialPolicyView[];
}

export type NgTrialView =
  | { kind: 'none' }
  | { kind: 'running'; segment: string | null; startedAt: string; endsAt: string; daysLeft: number; endPlanId: string | null }
  | { kind: 'ended'; segment: string | null; startedAt: string; endsAt: string; endedAt: string | null };

/** One counted limit: used against limit (null = unlimited, 0 = not in the plan). */
export interface NgCounterView {
  used: number;
  limit: number | null;
}

/** NG-250: the counters of a NexaGrant tenant; null for a tenant without a NexaGrant row. */
export interface NgUsageView {
  seats: NgCounterView;
  /** Counted from `periodStart` (00:00 Istanbul on the 1st, ISO UTC) to now. */
  aiWritingMonthly: NgCounterView & { periodStart: string };
}

export interface NgBillingStateView {
  planId: string;
  tier: string;
  source: 'subscription' | 'fallback';
  /** NG-250: typed. Only TRIALING and ACTIVE carry the plan; any other status reads as the fallback plan. */
  status: SubStatus;
  features: NgFeatureView[];
  trial: NgTrialView;
  /** NG-250: may this member buy or change the plan (`can(role, 'manage_billing')`). */
  canManageBilling: boolean;
  /** NG-250: null when the counters were not read or the tenant has no NexaGrant row. */
  usage: NgUsageView | null;
}

export interface NgBillingViewContext {
  role?: Role | null;
  usage?: NgUsage | null;
}

function usageView(u: NgUsage | null | undefined): NgUsageView | null {
  if (!u) return null;
  return {
    seats: { used: u.seats.used, limit: u.seats.limit },
    aiWritingMonthly: {
      used: u.aiWritingMonthly.used,
      limit: u.aiWritingMonthly.limit,
      periodStart: u.aiWritingMonthly.periodStart.toISOString(),
    },
  };
}

export function featuresView(entitlement: NgEntitlement): NgFeatureView[] {
  const out: NgFeatureView[] = [];
  for (const key of NG_FEATURE_KEYS) {
    const l = featureLimit(entitlement, key);
    if (l.granted) out.push({ key, limit: l.limit });
  }
  return out;
}

export function catalogView(c: NgCatalog): NgCatalogView {
  return {
    plans: c.plans.map((p) => ({
      ...p,
      features: featuresView(entitlementFor(p.id, c.features)),
      prices: priceOffersFor(p, c.prices),
    })),
    trialPolicies: c.trialPolicies.map((t) => ({ ...t })),
  };
}

export function billingStateView(s: NgBillingState, ctx: NgBillingViewContext = {}): NgBillingStateView {
  const t = s.trial;
  const trial: NgTrialView =
    t.kind === 'none'
      ? { kind: 'none' }
      : t.kind === 'running'
        ? {
            kind: 'running',
            segment: t.segment,
            startedAt: t.startedAt.toISOString(),
            endsAt: t.endsAt.toISOString(),
            daysLeft: t.daysLeft,
            endPlanId: t.endPlanId,
          }
        : {
            kind: 'ended',
            segment: t.segment,
            startedAt: t.startedAt.toISOString(),
            endsAt: t.endsAt.toISOString(),
            endedAt: t.endedAt ? t.endedAt.toISOString() : null,
          };
  return {
    planId: s.plan.id,
    tier: s.plan.tier,
    source: s.source,
    status: s.status,
    features: featuresView(s.entitlement),
    trial,
    canManageBilling: ctx.role ? can(ctx.role, 'manage_billing') : false,
    usage: usageView(ctx.usage),
  };
}
