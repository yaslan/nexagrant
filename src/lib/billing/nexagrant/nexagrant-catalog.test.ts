/**
 * NG-57 — the NexaGrant plan × feature matrix, price offers, trial policy and the plan
 * half of `can()`. Pure: no database. The matrix under test is the seed data
 * (`prisma/seed-data/nexagrant-catalog.ts`), the one place the catalogue is written; the
 * expected table below is `06-Fiyat-Politikasi.md` §1 (S1 scope), §4 and §7, re-typed by
 * hand on purpose so a change to the data must be a change to this table too.
 */
import { describe, expect, it } from 'vitest';
import {
  NG_PLANS,
  NG_PLAN_FEATURES,
  NG_PLAN_PRICES,
  NG_TRIAL_POLICIES,
} from '../../../../prisma/seed-data/nexagrant-catalog';
import { can } from '@/lib/rbac';
import {
  NG_CURRENCIES,
  NG_FEATURE_KEYS,
  NG_INTERVALS,
  NG_PLAN_IDS,
  type NgFeatureKey,
  type NgPlanId,
} from './features';
import {
  entitlementFor,
  featureLimit,
  grantedFeatures,
  priceOffersFor,
  type NgPlanRow,
} from './entitlement';

/** `false` = not granted; `null` = granted, unlimited; a number = granted with that limit. */
type Cell = false | null | number;

const EXPECTED: Record<NgPlanId, Record<NgFeatureKey, Cell>> = {
  'ng-free': {
    org_profile: null,
    eligibility_check: 3,
    call_search: false,
    trl_score: false,
    apply_decision: false,
    newsletter: false,
    partner_search: false,
    outreach: false,
    similar_projects: false,
    seats: 1,
    ai_writing_monthly: false,
  },
  'ng-basic': {
    org_profile: null,
    eligibility_check: null,
    call_search: null,
    trl_score: null,
    apply_decision: null,
    newsletter: null,
    partner_search: false,
    outreach: false,
    similar_projects: false,
    seats: 2,
    ai_writing_monthly: false,
  },
  'ng-pro': {
    org_profile: null,
    eligibility_check: null,
    call_search: null,
    trl_score: null,
    apply_decision: null,
    newsletter: null,
    partner_search: null,
    outreach: null,
    similar_projects: null,
    seats: 5,
    ai_writing_monthly: 50,
  },
  'ng-enterprise': {
    org_profile: null,
    eligibility_check: null,
    call_search: null,
    trl_score: null,
    apply_decision: null,
    newsletter: null,
    partner_search: null,
    outreach: null,
    similar_projects: null,
    seats: null,
    ai_writing_monthly: 300,
  },
};

function cellOf(planId: NgPlanId, feature: NgFeatureKey): Cell {
  const limit = featureLimit(entitlementFor(planId, NG_PLAN_FEATURES), feature);
  return limit.granted ? limit.limit : false;
}

describe('NG-57 plan catalogue: the plans', () => {
  it('has exactly the four NexaGrant plan ids, none of them an id of the other plan ladder', () => {
    expect(NG_PLANS.map((p) => p.id).sort()).toEqual([...NG_PLAN_IDS].sort());
    for (const p of NG_PLANS) expect(['free', 'basic', 'pro', 'ultra']).not.toContain(p.id);
  });

  it('falls back to Ücretsiz Kontrol (ng-free) and to nothing else', () => {
    expect(NG_PLANS.filter((p) => p.isFallback).map((p) => p.id)).toEqual(['ng-free']);
  });

  it('sells Temel and Profesyonel only: free is a state, Kurumsal is S2 (pre-registration)', () => {
    expect(NG_PLANS.filter((p) => p.sellable).map((p) => p.id).sort()).toEqual(['ng-basic', 'ng-pro']);
  });
});

describe('NG-57 plan × feature matrix', () => {
  for (const planId of NG_PLAN_IDS) {
    for (const feature of NG_FEATURE_KEYS) {
      const want = EXPECTED[planId][feature];
      const label = want === false ? 'not granted' : want === null ? 'granted, unlimited' : `granted, limit ${want}`;
      it(`${planId} × ${feature}: ${label}`, () => {
        expect(cellOf(planId, feature)).toBe(want);
      });
    }
  }

  it('the matrix names only known plans and known features (no orphan row)', () => {
    for (const row of NG_PLAN_FEATURES) {
      expect(NG_PLAN_IDS as readonly string[]).toContain(row.planId);
      expect(NG_FEATURE_KEYS as readonly string[]).toContain(row.featureKey);
    }
  });

  it('upgrading never takes a feature away (free ⊆ basic ⊆ pro ⊆ enterprise)', () => {
    const ladder: NgPlanId[] = ['ng-free', 'ng-basic', 'ng-pro', 'ng-enterprise'];
    for (let i = 1; i < ladder.length; i++) {
      const lower = grantedFeatures(entitlementFor(ladder[i - 1]!, NG_PLAN_FEATURES));
      const upper = grantedFeatures(entitlementFor(ladder[i]!, NG_PLAN_FEATURES));
      for (const f of lower) expect(upper.has(f), `${ladder[i]} keeps ${f}`).toBe(true);
    }
  });

  it('a row with a feature key the code does not know grants nothing (fail closed)', () => {
    const ent = entitlementFor('ng-x', [
      { planId: 'ng-x', featureKey: 'teleport', limitValue: null },
      { planId: 'ng-x', featureKey: 'org_profile', limitValue: null },
    ]);
    expect([...grantedFeatures(ent)]).toEqual(['org_profile']);
  });

  it('an unknown plan grants nothing', () => {
    expect(grantedFeatures(entitlementFor('ng-nope', NG_PLAN_FEATURES)).size).toBe(0);
  });
});

describe('NG-57 prices (structure only — amounts wait on the accountant)', () => {
  it('every plan has one row per TRY/EUR × year/month, and no other currency (K-584156 = A)', () => {
    for (const p of NG_PLANS) {
      const rows = NG_PLAN_PRICES.filter((r) => r.planId === p.id);
      const cells = rows.map((r) => `${r.currency}/${r.interval}`).sort();
      const want = NG_CURRENCIES.flatMap((c) => NG_INTERVALS.map((i) => `${c}/${i}`)).sort();
      expect(cells, p.id).toEqual(want);
    }
  });

  it('no amount is in the seed: every price is empty, so nothing is purchasable yet', () => {
    expect(NG_PLAN_PRICES.length).toBeGreaterThan(0);
    for (const r of NG_PLAN_PRICES) expect(r.amountMinor, `${r.planId} ${r.currency}/${r.interval}`).toBeNull();
    for (const p of NG_PLANS) {
      for (const o of priceOffersFor(p, NG_PLAN_PRICES)) expect(o.purchasable).toBe(false);
    }
  });

  const pro: NgPlanRow = { id: 'ng-pro', tier: 'professional', sortOrder: 3, sellable: true, isFallback: false };
  const ent: NgPlanRow = { id: 'ng-enterprise', tier: 'enterprise', sortOrder: 4, sellable: false, isFallback: false };

  it('a priced cell of a sellable plan is purchasable; an empty cell next to it is not', () => {
    const offers = priceOffersFor(pro, [
      { planId: 'ng-pro', currency: 'TRY', interval: 'year', amountMinor: 123_45 },
      { planId: 'ng-pro', currency: 'EUR', interval: 'year', amountMinor: null },
    ]);
    expect(offers).toEqual([
      { currency: 'TRY', interval: 'year', amountMinor: 123_45, purchasable: true },
      { currency: 'EUR', interval: 'year', amountMinor: null, purchasable: false },
    ]);
  });

  it('a priced cell of a plan that is not sellable is not purchasable', () => {
    const [offer] = priceOffersFor(ent, [{ planId: 'ng-enterprise', currency: 'EUR', interval: 'year', amountMinor: 1 }]);
    expect(offer?.purchasable).toBe(false);
  });

  it('a zero or negative amount is not a price; USD and rows of other plans are dropped', () => {
    const offers = priceOffersFor(pro, [
      { planId: 'ng-pro', currency: 'TRY', interval: 'month', amountMinor: 0 },
      { planId: 'ng-pro', currency: 'EUR', interval: 'month', amountMinor: -5 },
      { planId: 'ng-pro', currency: 'USD', interval: 'year', amountMinor: 100 },
      { planId: 'ng-basic', currency: 'TRY', interval: 'year', amountMinor: 100 },
    ]);
    expect(offers.map((o) => [o.currency, o.interval, o.purchasable])).toEqual([
      ['TRY', 'month', false],
      ['EUR', 'month', false],
    ]);
  });
});

describe('NG-57 trial policy (K-584180 = A)', () => {
  it('default segment: 14 days of Profesyonel, then Ücretsiz Kontrol', () => {
    expect(NG_TRIAL_POLICIES.find((p) => p.segment === 'default')).toEqual({
      segment: 'default',
      days: 14,
      planId: 'ng-pro',
      endPlanId: 'ng-free',
    });
  });

  it('municipality segment: 30 days of Profesyonel, then Ücretsiz Kontrol', () => {
    expect(NG_TRIAL_POLICIES.find((p) => p.segment === 'municipality')).toEqual({
      segment: 'municipality',
      days: 30,
      planId: 'ng-pro',
      endPlanId: 'ng-free',
    });
  });

  it('has no third segment', () => {
    expect(NG_TRIAL_POLICIES.map((p) => p.segment).sort()).toEqual(['default', 'municipality']);
  });
});

describe('NG-57 can(): role + plan feature + module switch', () => {
  const granted = (planId: NgPlanId) => grantedFeatures(entitlementFor(planId, NG_PLAN_FEATURES));

  it('refuses a feature outside the plan even to the tenant owner', () => {
    expect(can('TENANT_OWNER', 'view_partner_search', { feature: 'partner_search', grantedFeatures: granted('ng-free') })).toBe(false);
  });

  it('allows the same feature when the plan grants it', () => {
    expect(can('TENANT_OWNER', 'view_partner_search', { feature: 'partner_search', grantedFeatures: granted('ng-pro') })).toBe(true);
  });

  it('a plan feature does not lift the role check', () => {
    expect(can('GUEST_PARTNER', 'view_partner_search', { feature: 'partner_search', grantedFeatures: granted('ng-pro') })).toBe(false);
  });

  it('a closed module behind the feature refuses it even on a plan that grants it', () => {
    expect(
      can('TENANT_OWNER', 'view_partner_search', { feature: 'partner_search', grantedFeatures: granted('ng-pro'), moduleOpen: false })
    ).toBe(false);
    expect(
      can('TENANT_OWNER', 'view_partner_search', { feature: 'partner_search', grantedFeatures: granted('ng-pro'), moduleOpen: true })
    ).toBe(true);
  });

  it('without a resource can() is the role table, as before', () => {
    expect(can('TENANT_OWNER', 'manage_billing')).toBe(true);
    expect(can('MEMBER', 'manage_billing')).toBe(false);
    expect(can(null, 'view_proposal')).toBe(false);
  });

  it('NG-250 Ö1: a null resource is not "no resource" — it refuses instead of skipping the plan', () => {
    expect(can('TENANT_OWNER', 'view_partner_search', null as unknown as undefined)).toBe(false);
  });

  it('NG-250: search_calls is held by every role (the call list keeps its audience; the plan narrows it)', () => {
    for (const role of ['TENANT_OWNER', 'TENANT_ADMIN', 'PIPELINE_MANAGER', 'WRITER', 'MEMBER', 'GUEST_PARTNER'] as const) {
      expect(can(role, 'search_calls'), role).toBe(true);
    }
  });
});
