'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCart } from '@/components/cart/CartContext';
import { ShoppingBag } from 'lucide-react';
import {
  FALLBACK_PLAN_ID,
  findEntry,
  priceLine,
  type BillingCycle,
  type DiscountTier,
} from '@/lib/billing/catalog';
import type { StorefrontPlanCards } from '@/lib/billing/storefront';
import { formatMoney } from '@/lib/money';
import type { LifetimeScarcity } from '@/lib/billing/lifetime-licence';
import type { InvoiceBuyerIdentity, InvoiceListRow } from '@/lib/billing/invoice-list';

interface BillingClientProps {
  workspace: string;
  locale: string;
  tenantId: string;
  /** The tenant's own name, or null when the row could not be read. */
  tenantName: string | null;
  currentPlanId: string;
  /**
   * The tier this tenant is priced under, from the server. Not necessarily the
   * live campaign: a tenant that joined under one keeps that rate
   * (`src/lib/billing/price-lock.ts`), so this can be a campaign that has since
   * closed, and every price on this panel is computed from it.
   */
  activeTier: DiscountTier;
  /**
   * True when the rate above is the tenant's own locked one rather than the
   * campaign running now — the panel then says so instead of naming a campaign
   * the customer can no longer join.
   */
  priceLocked?: boolean;
  /**
   * How many lifetime licences are actually on record, already turned into a
   * badge state by `lifetimeScarcity()` on the server. Same count and same four
   * states as `/[locale]/pricing`: `unknown` names the cap and no number,
   * because a missing count is not zero owners.
   */
  lifetimeScarcity: LifetimeScarcity;
  /**
   * What the tenant is entitled to, as measured. Every field is nullable and
   * `null` means *not measured* — the panel then shows a dash and says so.
   * It used to receive a fallback object (`seats: 6`, `workspaces: 5`,
   * `aiCreditsMonthly: 1000`) whenever the query failed, and printed that
   * invented capacity as the customer's quota (TASK-MTRD91ZLKEQ3A).
   */
  entitlements: {
    allowedModules: string[] | null;
    seats: number | null;
    usedSeats: number | null;
    workspaces: number | null;
    usedWorkspaces: number | null;
    aiCreditsMonthly: number | null;
    aiCreditsRemaining: number | null;
  };
  /** Invoices actually issued to this tenant, newest first. May be empty. */
  invoices: InvoiceListRow[];
  /** False when the history could not be read — which is not the same as none. */
  invoicesMeasured: boolean;
  /** Buyer identity as frozen on the newest invoice; null when there is none. */
  buyerIdentity: InvoiceBuyerIdentity | null;
  /**
   * The plans this tenant may move to, already priced on both cycles by the
   * server at the rate it will actually be charged. Public plans plus any
   * private plan assigned to this tenant — and nothing else, which is the same
   * set `/api/billing/checkout` will accept.
   */
  plans: StorefrontPlanCards[];
  /** False when the plan list could not be read — not the same as "none". */
  plansMeasured: boolean;
}

/**
 * Add-ons the screen used to sell at a price typed into this file ($49, $119,
 * $79 / month). They are not in the billing catalogue, so there is no amount
 * the server would honour — checkout answers 400 `Unknown plan: credits-500`
 * for any of them. Rather than quote a number nobody stands behind, the cards
 * stay visible and unbuyable until the catalogue carries them
 * (raised for TASK-MTR6QIE05ZKNH; adding skus is not this card's scope).
 */
const UNPRICED_ADDONS = ['credits500', 'credits1500', 'addonM6'] as const;


export function BillingClient({
  workspace,
  locale,
  tenantName,
  currentPlanId = FALLBACK_PLAN_ID,
  activeTier,
  priceLocked = false,
  lifetimeScarcity,
  entitlements,
  invoices,
  invoicesMeasured,
  buyerIdentity,
  plans,
  plansMeasured,
}: BillingClientProps) {
  const t = useTranslations('billingPanels.settings');
  const { addToCart } = useCart();
  const [billingCycle, setBillingCycle] = useState<Exclude<BillingCycle, 'one-time'>>('yearly');
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  };

  /**
   * Maps the export route's error code (route.ts) to a user-facing message.
   * Ranked by support-call volume in TASK-MTU64Y932HF96 (§4): the code names
   * below never reach the customer — they used to, as raw JSON, because the
   * download links were plain `<a href>` with no fetch and no error handling.
   */
  const invoiceExportMessage = (code: string | undefined, invoiceNumber: string): string => {
    switch (code) {
      case 'supplier_identity_not_configured':
        return t('invoiceExportUnavailable');
      case 'invoice_not_found':
        return t('invoiceExportNotFound', { number: invoiceNumber });
      case 'unsupported_format':
        return t('invoiceExportUnsupportedFormat');
      case 'unauthorized':
        return t('invoiceExportUnauthorized');
      case 'no_tenant':
        return t('invoiceExportNoTenant');
      case 'invoice_lookup_failed':
      case 'invoice_lines_invalid':
        return t('invoiceExportSystemError');
      default:
        return t('invoiceExportGenericError');
    }
  };

  const handleInvoiceDownload = async (invoiceNumber: string, format: 'xml' | 'pdf') => {
    const key = `${invoiceNumber}:${format}`;
    setDownloadingKey(key);
    // Opened before the fetch so the browser attributes it to the click and
    // does not treat it as an unrequested popup once the response arrives.
    const previewWindow = format === 'pdf' ? window.open('', '_blank', 'noopener,noreferrer') : null;
    try {
      // The printed page is rendered in the language the user is reading the app
      // in; the XML is the document filed with GİB and has no locale, so the
      // parameter is only sent for the page (TASK-MTTUSZF4QSFGU).
      const localeParam = format === 'pdf' ? `&locale=${encodeURIComponent(locale)}` : '';
      const res = await fetch(
        `/api/billing/invoices/${encodeURIComponent(invoiceNumber)}/export?format=${format}${localeParam}`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        previewWindow?.close();
        showToast(invoiceExportMessage(body?.error, invoiceNumber), 'error');
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      if (format === 'pdf') {
        if (previewWindow) {
          previewWindow.location.href = url;
        } else {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = `${invoiceNumber}_UBL_TR.xml`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
    } catch {
      previewWindow?.close();
      showToast(t('invoiceExportGenericError'), 'error');
    } finally {
      setDownloadingKey(null);
    }
  };

  // Anything that was not measured renders as a dash. `?? 0` would have been a
  // number the customer could read as their remaining balance.
  const dash = '—';
  const num = (value: number | null) => (value === null ? dash : String(value));
  const usedSeats = entitlements.usedSeats;
  const totalSeats = entitlements.seats;
  const usedWorkspaces = entitlements.usedWorkspaces;
  const totalWorkspaces = entitlements.workspaces;
  const remainingCredits = entitlements.aiCreditsRemaining;
  const totalCredits = entitlements.aiCreditsMonthly;
  // The bar is drawn only when both ends of the ratio were actually read.
  const creditPercent =
    remainingCredits === null || totalCredits === null
      ? null
      : Math.min(100, Math.round((remainingCredits / Math.max(1, totalCredits)) * 100));
  const invoiceDate = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    // The issue date is a calendar fact on the document, so it is rendered in
    // the timezone it was stored in rather than the reader's.
    timeZone: 'UTC',
  });

  const money = (amountMinor: number, currency: string) => formatMoney(amountMinor, currency, locale);
  const cycleLabel = billingCycle === 'yearly' ? t('cycleYearly') : t('cycleMonthly');
  const activePlan = currentPlanId.toLowerCase();

  const handleStripePortal = async () => {
    try {
      showToast(t('portalOpening'), 'info');
      const res = await fetch('/api/billing/portal', { method: 'POST' });
      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url;
      } else {
        showToast(t('portalDemo'), 'info');
      }
    } catch {
      showToast(t('portalUnreachable'), 'info');
    }
  };

  /**
   * The cards to draw. The cycle toggle picks between two sets of figures the
   * server already computed from this tenant's published plan versions; nothing
   * here discounts or rounds.
   */
  const cards = plans.map((card) => ({
    entry: card.plan,
    charged: card[billingCycle].charged,
    list: card[billingCycle].list,
    yearlyVsMonthly: card.yearlySavingPercent,
  }));

  const lifetimeEntry = findEntry('lifetime-ultra');
  const lifetime = lifetimeEntry ? priceLine({ sku: lifetimeEntry.sku }, activeTier) : null;

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-16">
      {/* Toast */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 animate-in slide-in-from-top-2">
          <div
            role="status"
            className={`px-4 py-3 rounded-xl shadow-lg border text-sm font-semibold flex items-center gap-2 ${
              toast.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : toast.type === 'error'
                ? 'bg-red-50 text-red-800 border-red-200'
                : 'bg-slate-900 text-white border-slate-800'
            }`}
          >
            <span>{toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : 'ℹ'}</span>
            <span>{toast.text}</span>
          </div>
        </div>
      )}

      {/* Header & Breadcrumbs */}
      <div className="bg-surface border rounded-2xl p-6 md:p-8 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-muted mb-2">
              <Link href={`/${locale}/${workspace}/dashboard`} className="hover:text-ink">
                {t('breadcrumbDashboard')}
              </Link>
              <span>/</span>
              <span className="text-ink-2">{t('breadcrumbSettings')}</span>
              <span>/</span>
              <span className="text-accent-ink font-semibold">{t('breadcrumbBilling')}</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold font-heading text-ink">{t('title')}</h1>
            <p className="text-xs md:text-sm text-ink-2 mt-1">{t('subtitle', { tenant: tenantName ?? workspace })}</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleStripePortal}
              className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xs transition flex items-center gap-2 cursor-pointer"
            >
              <span>💳</span>
              <span>{t('portalCta')}</span>
            </button>
          </div>
        </div>

        {/* ─── METRIC CARDS ROW ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8 pt-6 border-t border-border">
          <div className="p-4 bg-ground border border-border rounded-2xl space-y-1.5">
            <div className="text-xs text-muted font-medium">{t('metricPlan')}</div>
            <div className="text-xl font-bold text-ink uppercase tracking-tight flex items-center gap-2">
              <span>{activePlan}</span>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-mono font-bold">
                {t('metricPlanActive')}
              </span>
            </div>
            <div className="text-[11px] text-muted">{t('metricPlanTerm')}</div>
          </div>

          <div className="p-4 bg-ground border border-border rounded-2xl space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-muted font-medium">{t('metricCredits')}</span>
              <span className="font-bold text-ink font-mono" data-testid="settings-metric-credits">
                {num(remainingCredits)} / {num(totalCredits)}
              </span>
            </div>
            <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
              {creditPercent !== null && (
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-500"
                  style={{ width: `${creditPercent}%` }}
                />
              )}
            </div>
            <div className="text-[10px] text-muted">
              {creditPercent === null
                ? t('notMeasuredHint')
                : t('metricCreditsRemaining', { percent: creditPercent })}
            </div>
          </div>

          <div className="p-4 bg-ground border border-border rounded-2xl space-y-1.5">
            <div className="text-xs text-muted font-medium">{t('metricSeats')}</div>
            <div className="text-xl font-bold text-ink" data-testid="settings-metric-seats">
              {num(usedSeats)}{' '}
              <span className="text-sm font-normal text-muted" data-testid="settings-metric-seats-total">
                / {num(totalSeats)}
              </span>
            </div>
            <div className="text-[11px] text-muted">
              <Link href={`/${locale}/${workspace}/settings/members`} className="text-blue-600 hover:underline">
                {t('metricSeatsLink')}
              </Link>
            </div>
          </div>

          <div className="p-4 bg-ground border border-border rounded-2xl space-y-1.5">
            <div className="text-xs text-muted font-medium">{t('metricWorkspaces')}</div>
            <div className="text-xl font-bold text-ink" data-testid="settings-metric-workspaces">
              {num(usedWorkspaces)}{' '}
              <span className="text-sm font-normal text-muted" data-testid="settings-metric-workspaces-total">
                / {num(totalWorkspaces)}
              </span>
            </div>
            <div className="text-[11px] text-muted font-mono">{t('metricWorkspaceSlug', { slug: workspace })}</div>
          </div>
        </div>
      </div>

      {/* ─── ACTIVE MODULES ACCESS BAR ─── */}
      <div className="bg-surface border rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-4">
          <div>
            <h3 className="text-base font-bold text-ink font-heading">{t('modulesTitle')}</h3>
            <p className="text-xs text-muted">{t('modulesBody')}</p>
          </div>
          <Link
            href={`/${locale}/${workspace}/settings/modules`}
            className="text-xs font-bold text-accent-ink hover:underline bg-ground border px-3 py-1.5 rounded-lg transition self-start sm:self-auto"
          >
            {t('modulesLink')}
          </Link>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {entitlements.allowedModules === null && (
            <span className="text-xs text-muted font-mono">{t('notMeasuredHint')}</span>
          )}
          {(entitlements.allowedModules ?? []).map((m) => (
            <Link
              key={m}
              href={`/${locale}/${workspace}/settings/modules`}
              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-800 text-xs font-bold rounded-xl transition flex items-center gap-1.5 font-mono"
            >
              <span>✓</span>
              <span>{t('moduleChip', { module: m })}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* ─── SUBSCRIPTION PLANS GRID ─── */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold font-heading text-ink">{t('plansTitle')}</h2>
            <p className="text-xs text-muted">{t('plansBody')}</p>
            <p className="text-[11px] text-muted font-mono mt-1">
              {priceLocked
                ? t('lockedTierNote', { code: activeTier.code, percent: activeTier.percentOff })
                : t('activeTierNote', { code: activeTier.code, percent: activeTier.percentOff })}
            </p>
          </div>

          {/* Monthly / Yearly Toggle */}
          <div className="bg-ground p-1 rounded-full border border-border flex items-center self-start sm:self-auto">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition ${
                billingCycle === 'monthly' ? 'bg-accent text-white shadow-2xs' : 'text-muted hover:text-ink'
              }`}
            >
              {t('cycleMonthly')}
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5 ${
                billingCycle === 'yearly' ? 'bg-accent text-white shadow-2xs' : 'text-muted hover:text-ink'
              }`}
            >
              <span>{t('cycleYearly')}</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-extrabold ${
                  billingCycle === 'yearly' ? 'bg-white/20 text-white' : 'bg-accent/15 text-accent font-mono'
                }`}
              >
                {t('yearlyBadge')}
              </span>
            </button>
          </div>
        </div>

        {/*
          A plan list that could not be read says so. Falling back to the static
          three-plan array is what this panel used to do unconditionally, and it
          is how a price the studio has since changed keeps being offered.
        */}
        {!plansMeasured && (
          <div
            data-testid="settings-plans-unavailable"
            role="status"
            className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900"
          >
            {t('plansUnavailable')}
          </div>
        )}
        {plansMeasured && cards.length === 0 && (
          <div
            data-testid="settings-plans-empty"
            role="status"
            className="rounded-2xl border border-border bg-surface p-5 text-sm text-muted"
          >
            {t('plansEmpty')}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {cards.map(({ entry, charged, list, yearlyVsMonthly }) => {
            const isCurrent = activePlan === entry.planId;
            const recommended = entry.planId === 'pro';

            return (
              <div
                key={entry.planId}
                data-testid={`settings-plan-card-${entry.planId}`}
                className={`bg-surface border rounded-2xl p-6 shadow-xs flex flex-col justify-between transition-all relative ${
                  isCurrent ? 'border-accent ring-2 ring-accent/20' : 'border-border hover:border-border'
                }`}
              >
                {(isCurrent || recommended) && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-white text-[10px] font-bold uppercase tracking-wider py-0.5 px-2.5 rounded-full shadow-2xs">
                    {isCurrent ? t('badgeCurrent') : t('badgeRecommended')}
                  </span>
                )}

                <div className="space-y-4">
                  <div>
                    <h3 className="text-base font-bold text-ink">{entry.name}</h3>
                    <p className="text-[11px] text-muted mt-0.5">{t(`plans.${entry.planId}.desc`)}</p>
                  </div>

                  <div>
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <span
                        data-testid={`settings-plan-price-${entry.planId}`}
                        className="text-3xl font-extrabold text-ink"
                      >
                        {money(charged.monthlyEquivalentMinor, charged.currency)}
                      </span>
                      <span className="text-sm text-slate-400 line-through font-medium">
                        {money(list.monthlyEquivalentMinor, list.currency)}
                      </span>
                      <span className="text-xs bg-accent/15 text-accent font-extrabold px-1.5 py-0.5 rounded font-mono">
                        -{charged.percentOff}%
                      </span>
                      <span className="text-xs text-muted">{t('perMonth')}</span>
                    </div>
                    <div className="text-[10px] font-mono text-muted mt-1">
                      {billingCycle === 'yearly'
                        ? t('yearlyBillingNote', {
                            total: money(charged.amountMinor, charged.currency),
                            percent: yearlyVsMonthly,
                          })
                        : t('monthlyBillingNote')}
                    </div>
                    {/* See PricingClient: the price shown is net of VAT. */}
                    <div data-testid="vat-exclusive-note" className="text-[10px] font-mono text-muted mt-1">
                      {t('vatExclusiveNote')}
                    </div>
                  </div>

                  <ul className="space-y-2 text-xs text-ink-2 pt-2 border-t border-border">
                    <li className="flex items-center gap-1.5">
                      <span className="text-emerald-600 font-bold">✓</span>
                      {t(`plans.${entry.planId}.seats`)}
                    </li>
                    <li className="flex items-center gap-1.5 font-semibold text-ink">
                      <span className="text-emerald-600 font-bold">✓</span>
                      {t(`plans.${entry.planId}.credits`)}
                    </li>
                    <li className="flex items-center gap-1.5 text-muted text-[11px]">
                      <span>📦 {t(`plans.${entry.planId}.modules`)}</span>
                    </li>
                  </ul>
                </div>

                <div className="pt-6 mt-4 border-t border-border">
                  <button
                    onClick={() =>
                      addToCart({
                        sku: entry.sku,
                        type: 'plan',
                        name: `${entry.name} · ${cycleLabel}`,
                        subtitle: t(`plans.${entry.planId}.desc`),
                        billingCycle,
                        quantity: 1,
                      })
                    }
                    disabled={isCurrent}
                    className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition shadow-2xs flex items-center justify-center gap-1.5 ${
                      isCurrent
                        ? 'bg-emerald-500/20 text-emerald-700 border border-emerald-500/30 cursor-default'
                        : 'bg-accent hover:opacity-90 text-slate-950 font-extrabold cursor-pointer'
                    }`}
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span>{isCurrent ? t('badgeCurrent') : t('addToCart')}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── LIFETIME OFFER BANNER ─── */}
      {lifetime && (
        <div className="bg-[#0b1426] text-white border-2 border-cyan-400/80 rounded-2xl p-6 shadow-lg space-y-4 font-sans relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3 font-mono text-xs">
            <div className="flex items-center gap-2 font-bold text-cyan-400 uppercase tracking-widest">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              <span>{t('lifetimeKicker')}</span>
            </div>
            {/*
              Scarcity counters, counted rather than typed in: `LifetimeLicence`
              rows, read on the server and handed down as a state (CLAUDE.md
              rule 7). The same four states the pricing page renders, and for
              the same reasons — an unreadable count must not render as zero,
              and a full run must not promise a next licence.
            */}
            <div
              data-testid="settings-lifetime-scarcity"
              data-scarcity={lifetimeScarcity.kind}
              className="bg-slate-900 border border-slate-700 px-3 py-1 rounded-full text-[11px] text-slate-300 font-bold flex items-center gap-1.5 self-start sm:self-auto"
            >
              {lifetimeScarcity.kind === 'unknown' && (
                <span className="text-cyan-300">{t('lifetimeCapOnly', { cap: lifetimeScarcity.cap })}</span>
              )}
              {lifetimeScarcity.kind === 'none' && (
                <>
                  <span className="text-amber-400 font-extrabold">{t('lifetimeOwnersNone')}</span>
                  <span>·</span>
                  <span className="text-cyan-300">
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
                  <span className="text-cyan-300">
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

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1.5 max-w-2xl">
              <h3 className="text-xl font-bold font-heading text-white">{t('lifetimeTitle')}</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                {t('lifetimeBody', { amount: money(lifetime.amountMinor, lifetime.currency) })}
              </p>
            </div>

            <div className="flex flex-col items-start md:items-end gap-2 shrink-0">
              <div className="flex items-baseline gap-2 font-mono">
                <span data-testid="settings-lifetime-price" className="text-3xl font-extrabold text-white">
                  {money(lifetime.amountMinor, lifetime.currency)}
                </span>
                <span className="text-slate-400 line-through text-sm">
                  {money(lifetime.listAmountMinor, lifetime.currency)}
                </span>
                <span className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-bold px-1.5 py-0.5 rounded font-mono">
                  {t('lifetimeOneTimeOff', { percent: lifetime.percentOff })}
                </span>
              </div>
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
                className="bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-extrabold text-xs px-5 py-2.5 rounded-xl shadow-[0_0_20px_rgba(34,211,238,0.4)] transition flex items-center gap-1.5 cursor-pointer"
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>{t('lifetimeCta')}</span>
                <span>↗</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── ADD-ON PACKS (not in the catalogue — shown, not sellable) ─── */}
      <div className="bg-surface border rounded-2xl p-6 shadow-xs space-y-4">
        <div>
          <h3 className="text-base font-bold text-ink font-heading">{t('addonsTitle')}</h3>
          <p className="text-xs text-muted">{t('addonsBody')}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {UNPRICED_ADDONS.map((key) => (
            <div key={key} className="p-4 bg-ground border rounded-xl space-y-1">
              <div className="font-bold text-xs text-ink">{t(`addons.${key}.name`)}</div>
              <div className="text-[11px] text-muted">{t(`addons.${key}.kind`)}</div>
              <div className="text-[11px] text-amber-700 dark:text-amber-400 font-mono pt-1">
                {t('addonNotInCatalogue')}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── E-INVOICE & PAYMENT HISTORY ─── */}
      <div
        data-testid="billing-invoice-section"
        className="bg-surface border rounded-2xl p-6 shadow-xs space-y-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] bg-red-100 text-red-800 border border-red-200 px-2 py-0.5 rounded font-mono font-bold">
                {t('invoiceBadge')}
              </span>
              <h3 className="text-base font-bold text-ink font-heading">{t('invoiceTitle')}</h3>
            </div>
            <p className="text-xs text-muted mt-0.5">{t('invoiceBody')}</p>
          </div>
        </div>

        {!invoicesMeasured && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
            ⚠ {t('invoiceUnreadable')}
          </div>
        )}

        {/* Who the invoices were issued to — read off the newest document, or
            nothing. This block used to print a legal name and VKN 2840958172
            that belonged to no registered company. */}
        <div className="bg-ground border border-border rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <span className="text-[11px] text-muted block">{t('invoiceLegalName')}</span>
            <span className="font-bold text-ink block mt-0.5">
              {buyerIdentity ? buyerIdentity.name : <span className="text-muted font-normal">{t('notMeasured')}</span>}
            </span>
          </div>
          <div>
            <span className="text-[11px] text-muted block">{t('invoiceTaxOffice')}</span>
            <span className="font-bold text-ink block mt-0.5 font-mono">
              {buyerIdentity ? (
                `${buyerIdentity.taxOffice} / ${buyerIdentity.vknTckn}`
              ) : (
                <span className="text-muted font-normal font-sans">{t('notMeasured')}</span>
              )}
            </span>
          </div>
          <div>
            <span className="text-[11px] text-muted block">{t('invoiceStatus')}</span>
            <span className="font-bold text-ink block mt-0.5 font-mono">
              {invoices[0] ? (
                invoices[0].number
              ) : (
                <span className="text-muted font-normal font-sans">{t('notMeasured')}</span>
              )}
            </span>
          </div>
        </div>

        {invoices.length === 0 ? (
          <div
            data-testid="billing-invoices-empty"
            className="border border-dashed border-border rounded-xl p-6 text-center space-y-1"
          >
            <div className="text-sm font-bold text-ink">{t('invoiceEmptyTitle')}</div>
            <div className="text-xs text-muted">{t('invoiceEmptyBody')}</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse" data-testid="billing-invoices">
              <thead>
                <tr className="bg-ground text-muted border-b">
                  <th className="p-3 font-semibold">{t('invoiceColNo')}</th>
                  <th className="p-3 font-semibold">{t('invoiceColDate')}</th>
                  <th className="p-3 font-semibold">{t('invoiceColDesc')}</th>
                  <th className="p-3 font-semibold">{t('invoiceColBase')}</th>
                  <th className="p-3 font-semibold">{t('invoiceColTotal')}</th>
                  <th className="p-3 font-semibold">{t('invoiceColStatus')}</th>
                  <th className="p-3 font-semibold text-right">{t('invoiceColDownload')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-ground/50">
                    <td className="p-3 font-mono font-bold text-ink">{invoice.number}</td>
                    <td className="p-3 text-ink-2 font-mono">
                      {invoiceDate.format(new Date(invoice.issuedAt))}
                    </td>
                    <td className="p-3 text-ink font-medium">
                      {invoice.description || <span className="text-muted">{t('invoiceAmountUnreadable')}</span>}
                    </td>
                    <td className="p-3 font-mono text-ink-2">
                      {invoice.amounts
                        ? `${money(invoice.amounts.subtotalMinor, invoice.currency)} + ${money(
                            invoice.amounts.payableVatMinor,
                            invoice.currency
                          )}`
                        : t('invoiceAmountUnreadable')}
                    </td>
                    <td className="p-3 font-mono font-bold text-ink">
                      {invoice.amounts
                        ? money(invoice.amounts.totalMinor, invoice.currency)
                        : t('invoiceAmountUnreadable')}
                    </td>
                    <td className="p-3">
                      {/* Only an envelope id GİB returned may be reported as a
                          filing; everything else says it was not filed. */}
                      {invoice.filedWithGib ? (
                        <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full font-mono">
                          {t('invoiceFiled')}
                        </span>
                      ) : (
                        <span
                          title={t('invoiceUnfiledHint')}
                          className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full font-mono"
                        >
                          {t('invoiceUnfiled')}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right space-x-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleInvoiceDownload(invoice.number, 'xml')}
                        disabled={downloadingKey === `${invoice.number}:xml`}
                        className="text-[11px] font-bold text-blue-600 hover:underline disabled:opacity-50 disabled:cursor-wait cursor-pointer"
                      >
                        {downloadingKey === `${invoice.number}:xml` ? t('invoiceDownloading') : t('invoiceXml')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleInvoiceDownload(invoice.number, 'pdf')}
                        disabled={downloadingKey === `${invoice.number}:pdf`}
                        className="text-[11px] font-bold text-blue-600 hover:underline disabled:opacity-50 disabled:cursor-wait cursor-pointer"
                      >
                        {downloadingKey === `${invoice.number}:pdf` ? t('invoiceDownloading') : t('invoicePdf')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
