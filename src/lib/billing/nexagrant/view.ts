/**
 * NG-57 — the serialisable shapes the NexaGrant billing server actions return (the server
 * contract NG-11 builds the pricing and plan screens on). Pure; dates as ISO strings.
 */
import { NG_FEATURE_KEYS, type NgCurrency, type NgFeatureKey, type NgInterval } from './features';
import { entitlementFor, featureLimit, priceOffersFor, type NgEntitlement } from './entitlement';
import type { NgCatalog, NgBillingState } from './repository';

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

export interface NgBillingStateView {
  planId: string;
  tier: string;
  source: 'subscription' | 'fallback';
  status: string;
  features: NgFeatureView[];
  trial: NgTrialView;
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

export function billingStateView(s: NgBillingState): NgBillingStateView {
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
  };
}
