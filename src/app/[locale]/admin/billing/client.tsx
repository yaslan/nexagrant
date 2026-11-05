'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  CreditCard,
  CheckCircle2,
  ShoppingBag,
  ExternalLink,
} from 'lucide-react';
import { useCart } from '@/components/cart/CartContext';
import {
  type BillingCycle,
  type DiscountTier,
} from '@/lib/billing/catalog';
import type { StorefrontPlanCards } from '@/lib/billing/storefront';
import { formatMoney } from '@/lib/money';
import { planCardCopy } from '@/lib/billing/plan-copy';

const ADMIN_BULLETS = ['f1', 'f2', 'f3', 'f4'] as const;

interface BillingClientProps {
  locale: string;
  tenantName: string;
  currentPlanId: string;
  currentProvider: string;
  /**
   * The live campaign, from `getActiveTier()` on the server.
   *
   * This panel used to bill `price * 0.3 // Apply active 70% discount`: the
   * campaign was frozen into the admin screen while the public pricing page
   * moved with its own selector, so the two panels quoted different prices for
   * the same plan. Both now read one tier and one catalogue.
   */
  activeTier: DiscountTier;
  /**
   * The plans on offer to this tenant, priced on both cycles by the server from
   * the published `PlanVersion` rows (TASK-MTSHVKTSGC8A4). This panel used to
   * price the static catalogue in the browser, so a price the plan studio
   * published never reached it and the figure here could differ from what
   * `/api/billing/checkout` charged.
   */
  plans: StorefrontPlanCards[];
  /** False when the plan list could not be read — not the same as "none". */
  plansMeasured: boolean;
}

export function BillingClient({
  locale,
  tenantName,
  currentPlanId = 'pro',
  currentProvider = 'stripe',
  activeTier,
  plans,
  plansMeasured,
}: BillingClientProps) {
  const t = useTranslations('billingPanels.admin');
  const { addToCart } = useCart();
  const [billingCycle, setBillingCycle] = useState<Exclude<BillingCycle, 'one-time'>>('yearly');
  const [portalNotice, setPortalNotice] = useState<string | null>(null);

  const money = (amountMinor: number, currency: string) => formatMoney(amountMinor, currency, locale);
  const cycleLabel = billingCycle === 'yearly' ? t('cycleYearly') : t('cycleMonthly');

  const handleStripePortal = async () => {
    setPortalNotice(null);
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' });
      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url;
      } else {
        setPortalNotice(t('portalDemo'));
      }
    } catch {
      setPortalNotice(t('portalUnreachable'));
    }
  };

  /** Server-priced, same source and same tier as the public pricing cards. */
  const cards = plans.map((card) => ({
    entry: card.plan,
    charged: card[billingCycle].charged,
    list: card[billingCycle].list,
    yearlyVsMonthly: card.yearlySavingPercent,
  }));

  return (
    <div className="space-y-6 font-sans">
      {/* ──────────────────────── HEADER BANNER ──────────────────────── */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 font-semibold tracking-wider uppercase mb-1">
              <CreditCard className="w-4 h-4 text-cyan-400" />
              <span>{t('kicker')}</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight font-heading text-white">
              {t('title')}
            </h1>
            <p className="text-slate-300 text-xs md:text-sm mt-1 max-w-2xl">
              {t('orgLabel')}{' '}
              <strong className="text-white font-semibold">{tenantName}</strong> —{' '}
              {t('providerLabel')}{' '}
              <span className="font-mono text-cyan-400 font-bold uppercase">{currentProvider}</span>
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handleStripePortal}
              className="bg-[#22d3ee] hover:bg-[#67e8f9] text-[#080d1a] px-4 py-2.5 rounded-xl font-extrabold text-xs shadow-md transition flex items-center gap-2 cursor-pointer font-mono"
            >
              <CreditCard className="w-4 h-4 text-[#080d1a]" />
              <span>{t('portalCta')}</span>
              <ExternalLink className="w-3.5 h-3.5 text-[#080d1a]" />
            </button>
          </div>
        </div>

        {portalNotice && (
          <div role="status" className="mt-4 text-xs font-mono text-cyan-200 bg-slate-950/60 border border-cyan-500/30 rounded-xl px-3 py-2 relative z-10">
            {portalNotice}
          </div>
        )}
      </div>

      <div className="space-y-6">
        {/* Header Controls */}
        <div className="bg-surface border border-line rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-sm text-ink">{t('secureTitle')}</h3>
            <p className="text-muted text-xs mt-0.5">{t('secureBody')}</p>
            <p className="text-muted text-[11px] mt-1 font-mono">
              {t('activeTierNote', { code: activeTier.code, percent: activeTier.percentOff })}
            </p>
          </div>

          <div className="bg-ground p-1 rounded-xl border border-line flex items-center shrink-0">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-4 py-1.5 text-xs font-bold rounded-lg transition ${
                billingCycle === 'monthly' ? 'bg-accent text-white shadow-xs' : 'text-muted hover:text-ink'
              }`}
            >
              {t('cycleMonthly')}
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-4 py-1.5 text-xs font-bold rounded-lg transition flex items-center gap-1 ${
                billingCycle === 'yearly' ? 'bg-accent text-white shadow-xs' : 'text-muted hover:text-ink'
              }`}
            >
              <span>{t('cycleYearly')}</span>
              <span className="text-[9px] bg-slate-950 text-cyan-300 px-1.5 py-0.2 rounded font-mono font-extrabold">
                {t('yearlyBadge')}
              </span>
            </button>
          </div>
        </div>

        {/*
          A plan list that could not be read says so. Falling back to the
          static catalogue is what this panel used to do unconditionally, and
          it is how a price the studio has since changed keeps being quoted.
        */}
        {!plansMeasured && (
          <div
            data-testid="admin-plans-unavailable"
            role="status"
            className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900"
          >
            {t('plansUnavailable')}
          </div>
        )}

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {cards.map(({ entry, charged, list, yearlyVsMonthly }) => {
            const isCurrent = currentPlanId.toLowerCase() === entry.planId;
            const recommended = entry.planId === 'pro';
            const copy = planCardCopy(entry, t, locale, { summary: 'desc', bullets: ADMIN_BULLETS });

            return (
              <div
                key={entry.planId}
                data-testid={`admin-plan-card-${entry.planId}`}
                className={`bg-surface border rounded-2xl p-6 shadow-xs space-y-4 flex flex-col justify-between relative transition-all ${
                  recommended ? 'border-2 border-accent ring-1 ring-accent/30' : 'border-line hover:border-accent/40'
                }`}
              >
                {recommended && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-white text-[10px] font-bold font-mono px-3 py-0.5 rounded-full uppercase shadow-xs">
                    {t('mostPopular')}
                  </span>
                )}

                <div className="space-y-3">
                  <span className="text-xs font-mono font-bold text-muted uppercase tracking-wider">{entry.name}</span>
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span
                      data-testid={`admin-plan-price-${entry.planId}`}
                      className="text-3xl font-bold text-ink font-mono"
                    >
                      {money(charged.monthlyEquivalentMinor, charged.currency)}
                    </span>
                    <span className="text-sm text-muted line-through font-mono">
                      {money(list.monthlyEquivalentMinor, list.currency)}
                    </span>
                    <span className="text-[11px] bg-accent/15 text-accent font-extrabold px-1.5 py-0.5 rounded font-mono">
                      -{charged.percentOff}%
                    </span>
                    <span className="text-xs text-muted font-semibold">{t('perMonth')}</span>
                  </div>
                  <p className="text-[10px] font-mono text-muted">
                    {billingCycle === 'yearly'
                      ? t('yearlyBillingNote', {
                          total: money(charged.amountMinor, charged.currency),
                          percent: yearlyVsMonthly,
                        })
                      : t('monthlyBillingNote')}
                  </p>
                  {copy.summary && <p className="text-xs text-muted">{copy.summary}</p>}
                  <ul className="text-xs space-y-2 pt-2 border-t border-line text-ink-2">
                    {copy.bullets.map(({ key, text }) => (
                      <li key={key} className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
                        <span>{text}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  onClick={() =>
                    addToCart({
                      sku: entry.sku,
                      type: 'plan',
                      name: `${entry.name} · ${cycleLabel}`,
                      subtitle: copy.summary ?? undefined,
                      billingCycle,
                      quantity: 1,
                    })
                  }
                  className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer flex items-center justify-center gap-2 ${
                    isCurrent
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-accent hover:opacity-90 text-white font-extrabold'
                  }`}
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>{isCurrent ? t('currentPlan') : t('addToCart')}</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
