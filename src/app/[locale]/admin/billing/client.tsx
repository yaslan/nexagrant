'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  CreditCard,
  CheckCircle2,
  KeyRound,
  Check,
  ShoppingBag,
  ExternalLink,
  TriangleAlert,
} from 'lucide-react';
import { handleConfigureSso } from './actions';
import { useCart } from '@/components/cart/CartContext';
import {
  CATALOG,
  MONTHS_PER_YEAR,
  NO_DISCOUNT_TIER,
  priceLine,
  type BillingCycle,
  type DiscountTier,
  type PlanEntry,
} from '@/lib/billing/catalog';
import { formatMoney } from '@/lib/money';

interface BillingSsoClientProps {
  locale: string;
  tenantId: string;
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
}

const PLAN_ENTRIES = CATALOG.filter((entry): entry is PlanEntry => entry.kind === 'plan');

export function BillingSsoClient({
  locale,
  tenantId,
  tenantName,
  currentPlanId = 'pro',
  currentProvider = 'stripe',
  activeTier,
}: BillingSsoClientProps) {
  const t = useTranslations('billingPanels.admin');
  const { addToCart } = useCart();
  const [activeTab, setActiveTab] = useState<'billing' | 'sso'>('billing');
  const [billingCycle, setBillingCycle] = useState<Exclude<BillingCycle, 'one-time'>>('yearly');
  const [portalNotice, setPortalNotice] = useState<string | null>(null);

  // SSO form state. These start empty on purpose: the fields used to be
  // pre-filled with an invented İTÜ issuer and a placeholder x509 certificate,
  // which read as a real configuration that nobody had entered.
  const [ssoDomain, setSsoDomain] = useState('');
  const [idpEntityId, setIdpEntityId] = useState('');
  const [ssoAcsUrl, setSsoAcsUrl] = useState('');
  const [providerType, setProviderType] = useState('SAML_2_0');
  const [x509Cert, setX509Cert] = useState('');
  const [ssoSaved, setSsoSaved] = useState(false);
  const [ssoError, setSsoError] = useState<string | null>(null);
  const [isSavingSso, setIsSavingSso] = useState(false);

  const money = (amountMinor: number, currency: string) => formatMoney(amountMinor, currency, locale);
  const cycleLabel = billingCycle === 'yearly' ? t('cycleYearly') : t('cycleMonthly');

  // The success banner follows what the server reports. It used to be set
  // unconditionally, and `configureEnterpriseSso` returned `success: true` even
  // when the write had failed, so this screen confirmed saves that never
  // happened.
  const handleSaveSso = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSso(true);
    setSsoError(null);
    try {
      const result = await handleConfigureSso({
        tenantId,
        domain: ssoDomain,
        idpEntityId,
        ssoAcsUrl,
        x509Certificate: x509Cert,
        providerType,
        enabled: true,
      });
      if (result?.success) {
        setSsoSaved(true);
        setTimeout(() => setSsoSaved(false), 3000);
      } else {
        setSsoError(t('ssoSaveFailed'));
      }
    } catch {
      setSsoError(t('ssoSaveFailed'));
    } finally {
      setIsSavingSso(false);
    }
  };

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

  /** Same catalogue, same tier, same function as the public pricing cards. */
  const cards = PLAN_ENTRIES.map((entry) => {
    const charged = priceLine({ sku: entry.sku, billingCycle }, activeTier);
    const list = priceLine({ sku: entry.sku, billingCycle }, NO_DISCOUNT_TIER);
    const yearlyVsMonthly = Math.round(
      ((entry.monthlyListMinor * MONTHS_PER_YEAR - entry.yearlyListMinor) /
        (entry.monthlyListMinor * MONTHS_PER_YEAR)) *
        100
    );
    return { entry, charged, list, yearlyVsMonthly };
  });

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

      {/* ──────────────────────── NAVIGATION TABS ──────────────────────── */}
      <div className="flex border-b border-line gap-2">
        <button
          onClick={() => setActiveTab('billing')}
          className={`px-4 py-2.5 font-semibold text-xs rounded-t-xl transition flex items-center gap-2 border-b-2 -mb-px ${
            activeTab === 'billing'
              ? 'border-cyan-400 text-cyan-400 bg-cyan-500/10 font-bold'
              : 'border-transparent text-muted hover:text-ink hover:bg-surface-hover'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>{t('tabBilling')}</span>
        </button>

        <button
          onClick={() => setActiveTab('sso')}
          className={`px-4 py-2.5 font-semibold text-xs rounded-t-xl transition flex items-center gap-2 border-b-2 -mb-px ${
            activeTab === 'sso'
              ? 'border-cyan-400 text-cyan-400 bg-cyan-500/10 font-bold'
              : 'border-transparent text-muted hover:text-ink hover:bg-surface-hover'
          }`}
        >
          <KeyRound className="w-4 h-4" />
          <span>{t('tabSso')}</span>
        </button>
      </div>

      {/* ──────────────────────── TAB 1: STRIPE BILLING ──────────────────────── */}
      {activeTab === 'billing' && (
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
                  billingCycle === 'monthly' ? 'bg-accent text-slate-950 shadow-xs' : 'text-muted hover:text-ink'
                }`}
              >
                {t('cycleMonthly')}
              </button>
              <button
                onClick={() => setBillingCycle('yearly')}
                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition flex items-center gap-1 ${
                  billingCycle === 'yearly' ? 'bg-accent text-slate-950 shadow-xs' : 'text-muted hover:text-ink'
                }`}
              >
                <span>{t('cycleYearly')}</span>
                <span className="text-[9px] bg-slate-950 text-cyan-300 px-1.5 py-0.2 rounded font-mono font-extrabold">
                  {t('yearlyBadge')}
                </span>
              </button>
            </div>
          </div>

          {/* Pricing Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {cards.map(({ entry, charged, list, yearlyVsMonthly }) => {
              const isCurrent = currentPlanId.toLowerCase() === entry.planId;
              const recommended = entry.planId === 'pro';

              return (
                <div
                  key={entry.planId}
                  data-testid={`admin-plan-card-${entry.planId}`}
                  className={`bg-surface border rounded-2xl p-6 shadow-xs space-y-4 flex flex-col justify-between relative transition-all ${
                    recommended ? 'border-2 border-accent ring-1 ring-accent/30' : 'border-line hover:border-accent/40'
                  }`}
                >
                  {recommended && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-slate-950 text-[10px] font-bold font-mono px-3 py-0.5 rounded-full uppercase shadow-xs">
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
                    <p className="text-xs text-muted">{t(`plans.${entry.planId}.desc`)}</p>
                    <ul className="text-xs space-y-2 pt-2 border-t border-line text-ink-2">
                      {['f1', 'f2', 'f3', 'f4'].map((key) => (
                        <li key={key} className="flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
                          <span>{t(`plans.${entry.planId}.${key}`)}</span>
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
                        subtitle: t(`plans.${entry.planId}.desc`),
                        billingCycle,
                        quantity: 1,
                      })
                    }
                    className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer flex items-center justify-center gap-2 ${
                      isCurrent
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-accent hover:opacity-90 text-slate-950 font-extrabold'
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
      )}

      {/* ──────────────────────── TAB 2: ENTERPRISE SAML SSO ──────────────────────── */}
      {activeTab === 'sso' && (
        <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-6 max-w-3xl">
          <div>
            <h2 className="text-base font-bold text-ink flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-cyan-400" />
              <span>{t('ssoTitle')}</span>
            </h2>
            <p className="text-muted text-xs mt-1">{t('ssoBody')}</p>
          </div>

          <form onSubmit={handleSaveSso} className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="sso-domain" className="font-semibold text-ink block mb-1">
                  {t('ssoDomainLabel')}
                </label>
                <input
                  id="sso-domain"
                  type="text"
                  value={ssoDomain}
                  onChange={(e) => setSsoDomain(e.target.value)}
                  placeholder={t('ssoDomainPlaceholder')}
                  required
                  className="w-full border border-line rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-accent focus:outline-none bg-ground text-ink font-mono font-semibold"
                />
              </div>

              <div>
                <label htmlFor="sso-provider" className="font-semibold text-ink block mb-1">
                  {t('ssoProviderLabel')}
                </label>
                <select
                  id="sso-provider"
                  value={providerType}
                  onChange={(e) => setProviderType(e.target.value)}
                  className="w-full border border-line rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-accent focus:outline-none bg-ground text-ink"
                >
                  <option value="SAML_2_0">SAML 2.0 (Shibboleth)</option>
                  <option value="AZURE_AD">Microsoft Entra ID (Azure AD)</option>
                  <option value="OKTA">Okta Enterprise SSO</option>
                  <option value="KEYCLOAK">Keycloak Realm</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="sso-issuer" className="font-semibold text-ink block mb-1">
                {t('ssoIssuerLabel')}
              </label>
              <input
                id="sso-issuer"
                type="text"
                value={idpEntityId}
                onChange={(e) => setIdpEntityId(e.target.value)}
                placeholder={t('ssoIssuerPlaceholder')}
                required
                className="w-full border border-line rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-accent focus:outline-none bg-ground text-ink font-mono"
              />
            </div>

            <div>
              <label htmlFor="sso-acs" className="font-semibold text-ink block mb-1">
                {t('ssoAcsLabel')}
              </label>
              <input
                id="sso-acs"
                type="text"
                value={ssoAcsUrl}
                onChange={(e) => setSsoAcsUrl(e.target.value)}
                placeholder={t('ssoAcsPlaceholder')}
                required
                className="w-full border border-line rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-accent focus:outline-none bg-ground text-ink font-mono"
              />
            </div>

            <div>
              <label htmlFor="sso-cert" className="font-semibold text-ink block mb-1">
                {t('ssoCertLabel')}
              </label>
              <textarea
                id="sso-cert"
                rows={3}
                value={x509Cert}
                onChange={(e) => setX509Cert(e.target.value)}
                placeholder={t('ssoCertPlaceholder')}
                className="w-full border border-line rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-accent focus:outline-none bg-ground text-ink font-mono text-[11px]"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-line">
              {ssoError ? (
                <span role="alert" className="inline-flex items-center gap-1.5 text-rose-400 font-bold text-xs">
                  <TriangleAlert className="w-4 h-4 text-rose-400" />
                  {ssoError}
                </span>
              ) : ssoSaved ? (
                <span role="status" className="inline-flex items-center gap-1.5 text-emerald-400 font-bold text-xs">
                  <Check className="w-4 h-4 text-emerald-400" />
                  {t('ssoSaved')}
                </span>
              ) : (
                <span className="text-muted text-[11px]">{t('ssoHint')}</span>
              )}

              <button
                type="submit"
                disabled={isSavingSso}
                className="bg-accent text-slate-950 font-black px-5 py-2.5 rounded-xl transition text-xs shadow-xs cursor-pointer"
              >
                {isSavingSso ? t('ssoSaving') : t('ssoSave')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
