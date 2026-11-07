'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Zap, Shield, Gift, Copy, Flame, Layers, ShoppingBag } from 'lucide-react';
import { useCart } from '@/components/cart/CartContext';
import {
  DISCOUNT_TIERS,
  findEntry,
  priceLine,
  type BillingCycle,
  type DiscountTier,
} from '@/lib/billing/catalog';
import type { StorefrontPlanCards, TierScheduleRow } from '@/lib/billing/storefront';
import { formatMoney } from '@/lib/money';
import { planCardCopy } from '@/lib/billing/plan-copy';
import type { LifetimeScarcity } from '@/lib/billing/lifetime-licence';

const PRICING_BULLETS = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'] as const;

interface PricingClientProps {
  locale: string;
  /**
   * The campaign the server is running, from `getActiveTier()`. The page shows
   * it; it does not get to pick one. The tier bar below is a read-only
   * schedule for exactly this reason: a selector that moved the headline price
   * let a visitor read $132.30 off the card and then be charged $44.10 at
   * checkout, which is the mismatch this screen was reported for.
   */
  activeTier: DiscountTier;
  /**
   * How many lifetime licences are actually on record, already turned into a
   * badge state by `lifetimeScarcity()`. `unknown` means the count could not be
   * read, and the badge then names the cap and nothing else — an invented owner
   * count is exactly what this prop replaced.
   */
  lifetimeScarcity: LifetimeScarcity;
  /**
   * The plans this visitor may buy, already priced on both cycles by the server
   * component from the published `PlanVersion` rows.
   *
   * The page used to hold the catalogue itself and run `priceLine()` in the
   * browser. It no longer prices anything: a figure computed here could differ
   * from the one `/api/billing/checkout` computes, and a card the browser
   * assembles could show a private plan the visitor was never granted.
   */
  plans: StorefrontPlanCards[];
  /**
   * The same plans priced under every campaign tier, for the schedule table
   * lower down the page. Server-computed for the same reason the cards are.
   */
  tierSchedule: TierScheduleRow[];
  /**
   * False when the plan list could not be read at all. An empty list and an
   * unreadable one are different facts, and neither may be papered over with a
   * price typed into this file.
   */
  plansMeasured: boolean;
}

export default function PricingClient({
  locale,
  activeTier,
  lifetimeScarcity,
  plans,
  tierSchedule,
  plansMeasured,
}: PricingClientProps) {
  const t = useTranslations('billingPanels.pricing');
  const { addToCart } = useCart();
  const [billingCycle, setBillingCycle] = useState<Exclude<BillingCycle, 'one-time'>>('yearly');
  const [copiedCoupon, setCopiedCoupon] = useState(false);

  const money = (amountMinor: number, currency: string) => formatMoney(amountMinor, currency, locale);

  const handleCopyCoupon = (code: string) => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(code);
      setCopiedCoupon(true);
      setTimeout(() => setCopiedCoupon(false), 2500);
    }
  };

  /**
   * The cards to draw: the cycle toggle picks between two sets of figures the
   * server already computed. Nothing here multiplies, discounts or rounds.
   */
  const cards = plans.map((card) => ({
    plan: card.plan,
    charged: card[billingCycle].charged,
    list: card[billingCycle].list,
    yearlyVsMonthly: card.yearlySavingPercent,
  }));

  // The lifetime licence is a one-time catalogue sku rather than a plan version,
  // so it is still priced from `catalog.ts` — there is no `Plan` row for it and
  // the studio does not edit it.
  const lifetimeEntry = findEntry('lifetime-ultra');
  const lifetime = lifetimeEntry ? priceLine({ sku: lifetimeEntry.sku }, activeTier) : null;

  // The comparison box weighs that licence against the Ultra subscription, so
  // the Ultra figures come from the *storefront* card rather than the static
  // catalogue: a price the studio publishes has to move both sides of the
  // comparison, or the box argues from a number nobody is charged. When Ultra
  // is not on this visitor's storefront at all there is nothing to compare
  // against, and the whole banner is withheld rather than compared to a price
  // that is not on offer.
  const ultraCard = plans.find((card) => card.plan.planId === 'ultra') ?? null;
  const ultraYearly = ultraCard?.yearly.charged ?? null;
  const ultraYearlyList = ultraCard?.yearly.list ?? null;
  const ultraThreeYearMinor =
    ultraYearly && ultraYearlyList ? ultraYearly.amountMinor + ultraYearlyList.amountMinor * 2 : 0;
  const lifetimeSavingMinor = lifetime ? ultraThreeYearMinor - lifetime.amountMinor : 0;

  const cycleLabel = billingCycle === 'yearly' ? t('cycleYearly') : t('cycleMonthly');

  return (
    <div className="flex-1 flex flex-col dark bg-[#080d1a] text-slate-100 font-sans selection:bg-accent/30 selection:text-accent-ink">
      <main className="flex-1 max-w-6xl mx-auto py-12 px-edge sm:px-6 w-full">
        {/* Header Section */}
        <div className="text-center max-w-3xl mx-auto mb-10 space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent-ink text-xs font-semibold uppercase tracking-wider shadow-[0_0_15px_rgba(34,211,238,0.15)]">
            <Flame className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            <span>{t('policyBadge')}</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white font-heading">
            {t('heroTitle')}
          </h1>
          <p className="text-slate-400 text-sm sm:text-base leading-relaxed max-w-2xl mx-auto">
            {t('heroSubtitle')}
          </p>
          {/*
            The sentence above ("the price you join at stays yours") is backed by
            `Subscription.locked*` + `src/lib/billing/price-lock.ts` since
            TASK-MTR882HVZ8BG7. This line states the two limits of that lock so
            the promise is exact rather than merely reassuring: it belongs to the
            subscription, and it is a floor, not a ceiling.
          */}
          <p className="text-slate-500 text-xs leading-relaxed max-w-2xl mx-auto">
            {t('priceLockNote')}
          </p>
        </div>

        {/* ─── TIER SCHEDULE (read-only: the live tier comes from the server) ─── */}
        <div className="bg-[#0e1628]/90 border border-accent/30 rounded-2xl p-6 shadow-xl mb-10 relative overflow-hidden backdrop-blur-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-5">
            <div>
              <div className="text-[11px] font-bold text-accent-ink font-mono uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-accent-ink" />
                <span>{t('tierScheduleKicker')}</span>
              </div>
              <h2 className="text-lg font-bold text-white mt-0.5">{t('tierScheduleTitle')}</h2>
            </div>

            <div className="bg-slate-900 border border-slate-700 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold text-accent-ink flex items-center gap-2 self-start sm:self-auto">
              <span>{t('activeCode')}</span>
              <span className="text-amber-300 font-extrabold" data-testid="active-tier-code">
                {activeTier.code}
              </span>
              <button
                onClick={() => handleCopyCoupon(activeTier.code)}
                className="hover:text-white transition"
                title={t('copyCode')}
                aria-label={t('copyCode')}
              >
                {copiedCoupon ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Tier bar — display only. Rank tells past from live from upcoming. */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {DISCOUNT_TIERS.map((tier) => {
              const isActive = tier.code === activeTier.code;
              return (
                <div
                  key={tier.code}
                  className={`p-3 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                    isActive
                      ? 'bg-accent/15 border-accent text-white shadow-[0_0_15px_rgba(34,211,238,0.25)] ring-1 ring-accent'
                      : 'bg-slate-900/80 border-slate-800 text-slate-400'
                  } ${tier.rank < activeTier.rank ? 'opacity-50' : ''}`}
                >
                  {isActive && (
                    <span className="absolute -top-2 left-2 bg-amber-500 text-slate-950 text-[9px] font-black uppercase px-1.5 py-0.2 rounded font-mono">
                      {t('tierLive')}
                    </span>
                  )}
                  <div>
                    <div className="text-[10px] font-bold font-mono text-slate-400">
                      {t(`tiers.${tier.code}`)}
                    </div>
                    <div className={`text-lg font-extrabold font-heading mt-0.5 ${tier.rank < activeTier.rank ? "text-white" : "text-accent-ink"}`}>
                      -{tier.percentOff}%
                    </div>
                  </div>
                  <div className="text-[9px] font-mono text-slate-400 mt-2">{tier.code}</div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row justify-between items-center text-xs font-mono text-slate-400 gap-2">
            <div>
              <span className="text-amber-400 font-bold">▶ {t(`tiers.${activeTier.code}`)}:</span>{' '}
              <span>{t('tierApplied', { percent: activeTier.percentOff, code: activeTier.code })}</span>
            </div>
            <div className="text-accent-ink text-[11px] font-bold">{t('tierServerNote')}</div>
          </div>
        </div>

        {/* Top Billing Toggle Pill (Monthly vs Yearly) */}
        <div className="flex justify-center mb-10">
          <div className="bg-[#0f172a] p-1.5 rounded-full border border-slate-800 flex items-center shadow-xl relative">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-6 py-2 rounded-full text-xs font-bold transition-all duration-200 relative z-10 ${
                billingCycle === 'monthly'
                  ? 'bg-accent-strong text-white shadow-[0_0_20px_rgba(34,211,238,0.4)]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t('cycleMonthly')}
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-6 py-2 rounded-full text-xs font-bold transition-all duration-200 relative z-10 flex items-center gap-1.5 ${
                billingCycle === 'yearly'
                  ? 'bg-accent-strong text-white shadow-[0_0_20px_rgba(34,211,238,0.4)]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>{t('cycleYearly')}</span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold tracking-tight ${
                  billingCycle === 'yearly' ? 'bg-slate-950 text-accent-ink' : 'bg-accent/20 text-accent-ink border border-accent/30'
                }`}
              >
                {t('yearlyBadge')}
              </span>
            </button>
          </div>
        </div>

        {/*
          Absence is not zero (CLAUDE.md rule 7). A storefront that could not be
          read says so; it does not fall back to a price typed into this file,
          because the figure it would fall back to is exactly the stale one this
          page was rebuilt to stop showing.
        */}
        {!plansMeasured && (
          <div
            data-testid="pricing-plans-unavailable"
            role="status"
            className="mb-16 rounded-2xl border border-amber-500/40 bg-amber-950/30 p-6 text-center text-sm text-amber-200"
          >
            {t('plansUnavailable')}
          </div>
        )}
        {plansMeasured && cards.length === 0 && (
          <div
            data-testid="pricing-plans-empty"
            role="status"
            className="mb-16 rounded-2xl border border-slate-800 bg-[#0b1324] p-6 text-center text-sm text-slate-400"
          >
            {t('plansEmpty')}
          </div>
        )}

        {/* ─── PRICING CARDS GRID — one card per plan on this visitor's storefront ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-16 items-stretch">
          {cards.map(({ plan: entry, charged, list, yearlyVsMonthly }) => {
            const recommended = entry.planId === 'pro';
            const copy = planCardCopy(entry, t, locale, { summary: 'subtitle', bullets: PRICING_BULLETS });
            return (
              <div
                key={entry.planId}
                data-testid={`plan-card-${entry.planId}`}
                className={`rounded-2xl p-6 sm:p-7 flex flex-col justify-between relative transition-all duration-300 ${
                  recommended
                    ? 'bg-[#0f192e] border-2 border-accent shadow-[0_0_35px_rgba(34,211,238,0.2)] ring-1 ring-accent/50'
                    : 'bg-[#0b1324] border border-slate-800 hover:border-slate-700 shadow-xl'
                }`}
              >
                {recommended && (
                  <div className="absolute -top-3.5 right-6 bg-accent-strong text-white text-[10px] font-black uppercase tracking-wider py-1 px-3 rounded-full shadow-[0_0_15px_rgba(34,211,238,0.5)]">
                    {t('recommended')}
                  </div>
                )}

                <div>
                  <h3 className="text-2xl font-bold text-white mb-1 font-heading">{entry.name}</h3>
                  <p className="text-slate-400 text-xs mb-6 min-h-[32px]">{copy.summary}</p>

                  {/* Price Header */}
                  <div className="mb-4">
                    <div className="flex items-baseline gap-2">
                      <span
                        data-testid={`plan-price-${entry.planId}`}
                        className="text-4xl sm:text-5xl font-extrabold text-white font-heading tracking-tight"
                      >
                        {money(charged.monthlyEquivalentMinor, charged.currency)}
                      </span>
                      <span className="text-lg text-slate-500 line-through font-semibold">
                        {money(list.monthlyEquivalentMinor, list.currency)}
                      </span>
                      <span className="bg-accent/20 text-accent-ink border border-accent/30 text-[11px] font-extrabold px-2 py-0.5 rounded font-mono">
                        -{charged.percentOff}%
                      </span>
                      <span className="text-slate-400 text-xs">{t('perMonth')}</span>
                    </div>

                    <div className="text-[11px] text-slate-400 mt-2 font-mono leading-relaxed">
                      {billingCycle === 'yearly'
                        ? t('yearlyBillingNote', {
                            total: money(charged.amountMinor, charged.currency),
                            percent: yearlyVsMonthly,
                          })
                        : t('monthlyBillingNote')}
                    </div>

                    {/* Catalogue prices are VAT-exclusive (boss decision
                        2026-09-08); the tax is added at checkout from the
                        buyer's country. Saying so next to the figure is the
                        only thing that keeps the headline price honest. */}
                    <div
                      data-testid="vat-exclusive-note"
                      className="text-[11px] text-slate-400 mt-1 font-mono leading-relaxed"
                    >
                      {t('vatExclusiveNote')}
                    </div>

                    <div className="mt-2 text-[10px] font-mono text-accent-ink bg-accent/60 border border-accent/30 rounded-lg p-2 flex items-center justify-between">
                      <span>{t('couponLabel', { code: charged.campaignCode })}</span>
                      <span>{t('renewalRate', { percent: charged.percentOff })}</span>
                    </div>
                  </div>

                  {/* Lifetime option, shown on the plan the licence covers */}
                  {entry.planId === 'ultra' && lifetime && (
                    <div className="mb-6 bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-300">{t('lifetimeInline')}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-accent-ink">
                          {money(lifetime.amountMinor, lifetime.currency)}
                        </span>
                        <span className="line-through text-slate-500 text-[10px]">
                          {money(lifetime.listAmountMinor, lifetime.currency)}
                        </span>
                        <span className="bg-accent/20 text-accent-ink text-[9px] px-1 rounded">
                          -{lifetime.percentOff}%
                        </span>
                      </div>
                    </div>
                  )}

                  {/* CTA Button */}
                  <div className="mb-8">
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
                      className={`w-full py-3.5 rounded-xl font-extrabold text-xs transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
                        recommended
                          ? 'bg-accent-strong hover:opacity-90 text-white shadow-[0_0_25px_rgba(34,211,238,0.4)] hover:shadow-[0_0_35px_rgba(34,211,238,0.6)]'
                          : 'bg-slate-900 hover:bg-slate-800 text-white border border-slate-700 hover:border-slate-600'
                      }`}
                    >
                      <ShoppingBag className="w-4 h-4" />
                      <span>{t('addToCart', { plan: entry.name })}</span>
                      <span>↗</span>
                    </button>
                  </div>

                  {/* Feature Checklist */}
                  <div className="space-y-3 pt-4 border-t border-slate-800/80">
                    {copy.bullets.map(({ key, text }) => (
                      <div key={key} className="flex items-start gap-2.5 text-xs text-slate-300 leading-snug">
                        <Check className="w-4 h-4 text-accent-ink shrink-0 mt-0.5" />
                        <span>{text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ─── LIFETIME OFFER BANNER ─── */}
        {lifetime && ultraYearly && ultraYearlyList && (
          <div className="bg-[#0b1426] border-2 border-accent/80 rounded-3xl p-6 sm:p-8 shadow-[0_0_40px_rgba(34,211,238,0.2)] mb-12 relative overflow-hidden backdrop-blur-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-800 font-mono">
              <div className="flex items-center gap-2 text-xs font-bold text-accent-ink tracking-widest uppercase">
                <span className="w-2.5 h-2.5 rounded-full bg-accent-strong animate-ping" />
                <span>{t('lifetimeKicker')}</span>
              </div>
              {/*
                Scarcity counters, counted rather than typed in: every figure
                here is `count()` over the `LifetimeLicence` rows (CLAUDE.md
                rule 7). The four states are not cosmetic variants — a missing
                count must not render as zero, and a full run must not promise a
                next licence.
              */}
              <div
                data-testid="lifetime-scarcity"
                data-scarcity={lifetimeScarcity.kind}
                className="bg-slate-900 border border-slate-700 px-3.5 py-1.5 rounded-full text-xs text-slate-300 font-bold flex items-center gap-2 self-start sm:self-auto shadow-inner"
              >
                {lifetimeScarcity.kind === 'unknown' && (
                  <span className="text-accent-ink">{t('lifetimeCapOnly', { cap: lifetimeScarcity.cap })}</span>
                )}
                {lifetimeScarcity.kind === 'none' && (
                  <>
                    <span className="text-amber-400 font-extrabold">{t('lifetimeOwnersNone')}</span>
                    <span>·</span>
                    <span className="text-accent-ink">
                      {t('lifetimeNextSeq', { next: lifetimeScarcity.next, cap: lifetimeScarcity.cap })}
                    </span>
                  </>
                )}
                {lifetimeScarcity.kind === 'available' && (
                  <>
                    <span className="text-amber-400 font-extrabold">
                      {t('lifetimeOwnersCount', { count: lifetimeScarcity.owners })}
                    </span>
                    <span>·</span>
                    <span className="text-accent-ink">
                      {t('lifetimeNextSeq', { next: lifetimeScarcity.next, cap: lifetimeScarcity.cap })}
                    </span>
                  </>
                )}
                {lifetimeScarcity.kind === 'sold-out' && (
                  <span className="text-amber-400 font-extrabold">
                    {t('lifetimeSoldOut', { count: lifetimeScarcity.owners, cap: lifetimeScarcity.cap })}
                  </span>
                )}
              </div>
            </div>

            <div className="max-w-3xl mb-8">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white tracking-tight mb-2 font-heading">
                {t('lifetimeTitle')}
              </h2>
              <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">{t('lifetimeBody')}</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              {/* Purchase card */}
              <div className="lg:col-span-5 bg-[#0e182e] border border-accent/50 rounded-2xl p-6 flex flex-col justify-between shadow-xl relative">
                <div>
                  <div className="text-xs font-bold text-slate-400 font-mono uppercase tracking-wider mb-1">
                    {lifetime.name}
                  </div>
                  <div className="flex items-baseline gap-2 mb-3">
                    <span
                      data-testid="lifetime-price"
                      className="text-4xl sm:text-5xl font-extrabold text-white font-heading"
                    >
                      {money(lifetime.amountMinor, lifetime.currency)}
                    </span>
                    <span className="text-lg text-slate-500 line-through font-semibold">
                      {money(lifetime.listAmountMinor, lifetime.currency)}
                    </span>
                    <span className="bg-accent/20 text-accent-ink border border-accent/30 text-xs font-extrabold px-2.5 py-0.5 rounded font-mono">
                      -{lifetime.percentOff}%
                    </span>
                    <span className="text-xs text-slate-400 font-mono">{t('oneTime')}</span>
                  </div>

                  <div className="inline-flex items-center gap-1.5 text-[11px] font-mono text-accent-ink bg-accent/80 border border-accent/30 px-2.5 py-1 rounded-lg mb-6">
                    <span>{lifetime.campaignCode}</span>
                    <span>·</span>
                    <span>{t('lifetimeCouponNote', { percent: lifetime.percentOff })}</span>
                  </div>
                </div>

                <div>
                  <button
                    onClick={() =>
                      addToCart({
                        sku: lifetime.sku,
                        type: 'lifetime',
                        name: lifetime.name,
                        subtitle: t('lifetimeCartSubtitle'),
                        billingCycle: 'one-time',
                        quantity: 1,
                      })
                    }
                    className="w-full py-3.5 rounded-xl font-extrabold text-xs bg-accent-strong hover:opacity-90 text-white shadow-[0_0_25px_rgba(34,211,238,0.4)] hover:shadow-[0_0_35px_rgba(34,211,238,0.6)] transition-all flex items-center justify-center gap-2 cursor-pointer mb-3"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    <span>{t('lifetimeCta')}</span>
                    <span>↗</span>
                  </button>
                  <div className="text-[10px] text-slate-400 font-mono text-center">{t('refundNote')}</div>
                </div>
              </div>

              {/* Comparison box — every figure priced from the catalogue */}
              <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between font-mono text-xs shadow-xl">
                <div>
                  <h3 className="font-bold text-white mb-4 text-sm font-heading">{t('compareTitle')}</h3>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                      <span className="text-slate-400">{t('compareToday')}</span>
                      <div className="space-x-4">
                        <span className="text-slate-400">
                          {t('compareYearlyTag')} {money(ultraYearly.amountMinor, ultraYearly.currency)}
                        </span>
                        <span className="font-bold text-accent-ink">
                          {t('compareLifetimeTag')} {money(lifetime.amountMinor, lifetime.currency)}
                        </span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                      <span className="text-slate-400">{t('compareEveryYear')}</span>
                      <div className="space-x-4">
                        <span className="text-slate-400">
                          {money(ultraYearlyList.amountMinor, ultraYearlyList.currency)}
                        </span>
                        <span className="font-bold text-emerald-400">{money(0, lifetime.currency)}</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-1 font-bold">
                      <span className="text-white">{t('compareThreeYears')}</span>
                      <div className="space-x-4">
                        <span className="text-slate-400 line-through">
                          {money(ultraThreeYearMinor, ultraYearly.currency)}
                        </span>
                        <span className="text-accent-ink text-sm">
                          {money(lifetime.amountMinor, lifetime.currency)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 bg-accent/40 border border-accent/30 rounded-xl p-3 text-accent-ink text-xs font-semibold leading-relaxed">
                    {t('compareSaving', { amount: money(lifetimeSavingMinor, lifetime.currency) })}
                  </div>
                </div>

                <div className="mt-6 pt-3 border-t border-slate-800 text-[11px] text-slate-400">
                  {t('lifetimeFooter')}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── FULL TIER SCHEDULE TABLE (the preview surface: each row is labelled with its own tier) ─── */}
        <div className="bg-[#0b1324] border border-slate-800 rounded-2xl p-6 shadow-xl mb-12">
          <h3 className="text-lg font-bold text-white mb-2 font-heading">{t('scheduleTitle')}</h3>
          <p className="text-xs text-slate-400 mb-6">{t('scheduleBody')}</p>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead>
                <tr className="bg-slate-900 text-accent-ink border-b border-slate-800">
                  <th className="p-3 font-bold">{t('colTier')}</th>
                  <th className="p-3 font-bold">{t('colRate')}</th>
                  <th className="p-3 font-bold">{t('colCode')}</th>
                  {plans.map(({ plan }) => (
                    <th key={plan.planId} className="p-3 font-bold">
                      {t('colPlanMonthly', { plan: plan.name })}
                    </th>
                  ))}
                  <th className="p-3 font-bold text-right">{t('colStatus')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-300">
                {DISCOUNT_TIERS.map((tier) => {
                  const isActive = tier.code === activeTier.code;
                  const row = tierSchedule.find((entry) => entry.tierCode === tier.code);
                  return (
                    <tr
                      key={tier.code}
                      className={`hover:bg-slate-900/50 transition ${isActive ? 'bg-accent/40 text-white font-bold' : ''}`}
                    >
                      <td className="p-3">{t(`tiers.${tier.code}`)}</td>
                      <td className="p-3 text-accent-ink font-extrabold">-{tier.percentOff}%</td>
                      <td className="p-3 font-bold text-amber-300">{tier.code}</td>
                      {(row?.cells ?? []).map((cell) => (
                        <td
                          key={cell.planId}
                          className={`p-3 ${cell.planId === 'pro' ? 'font-bold text-white' : ''}`}
                        >
                          {money(cell.amountMinor, cell.currency)}
                        </td>
                      ))}
                      <td className="p-3 text-right">
                        {isActive ? (
                          <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded text-[10px]">
                            {t('statusActive')}
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[10px]">
                            {tier.rank < activeTier.rank ? t('statusEnded') : t('statusUpcoming')}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bottom Guarantee & SLA Note */}
        <div className="text-center text-xs text-slate-400 font-mono space-y-2 max-w-2xl mx-auto border-t border-slate-800 pt-8">
          <p>{t('footerNote')}</p>
          <div className="flex justify-center items-center gap-6 text-[11px] text-slate-400 pt-2">
            <span className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-accent-ink" />
              {t('guaranteeRefund')}
            </span>
            <span className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-accent-ink" />
              {t('guaranteeCancel')}
            </span>
            <span className="flex items-center gap-1.5">
              <Gift className="w-3.5 h-3.5 text-accent-ink" />
              {t('guaranteeInvoice')}
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
