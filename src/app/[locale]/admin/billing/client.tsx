'use client';

import React, { useState } from 'react';
import { 
  CreditCard, 
  ShieldCheck, 
  CheckCircle2, 
  KeyRound, 
  Check, 
  ShoppingBag,
  ExternalLink,
  Zap,
  Sparkles
} from 'lucide-react';
import { handleConfigureSso } from './actions';
import { useCart } from '@/components/cart/CartContext';

interface BillingSsoClientProps {
  tenantId: string;
  tenantName: string;
  currentPlanId: string;
  currentProvider: string;
}

export function BillingSsoClient({
  tenantId,
  tenantName,
  currentPlanId = 'pro',
  currentProvider = 'stripe',
}: BillingSsoClientProps) {
  const { addToCart, applyCoupon } = useCart();
  const [activeTab, setActiveTab] = useState<'billing' | 'sso'>('billing');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('yearly');

  // SSO Form state
  const [ssoDomain, setSsoDomain] = useState('itu.edu.tr');
  const [idpEntityId, setIdpEntityId] = useState('https://sso.itu.edu.tr/idp/shibboleth');
  const [ssoAcsUrl, setSsoAcsUrl] = useState('https://fabrika.app/api/auth/saml/acs');
  const [providerType, setProviderType] = useState('SAML_2_0');
  const [x509Cert, setX509Cert] = useState('-----BEGIN CERTIFICATE-----\nMIIDdDCCAigCCQ... (İTÜ SAML Certificate)\n-----END CERTIFICATE-----');
  const [ssoSaved, setSsoSaved] = useState(false);
  const [isSavingSso, setIsSavingSso] = useState(false);

  const handleSaveSso = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSso(true);
    try {
      await handleConfigureSso({
        tenantId,
        domain: ssoDomain,
        idpEntityId,
        ssoAcsUrl,
        x509Certificate: x509Cert,
        providerType,
        enabled: true,
      });
      setSsoSaved(true);
      setTimeout(() => setSsoSaved(false), 3000);
    } catch (err) {
      console.error('Error saving SSO config:', err);
    } finally {
      setIsSavingSso(false);
    }
  };

  const handleStripePortal = async () => {
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' });
      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url;
      } else {
        alert('Stripe portal simülasyonu çalıştırıldı (Demo modu).');
      }
    } catch {
      alert('Stripe portalına bağlanılamadı.');
    }
  };

  const plans = [
    {
      id: 'basic',
      name: 'Basic',
      monthlyPrice: 45,
      yearlyPrice: 32.25,
      desc: 'Solo başlangıç — İlk adım',
      features: ['1 Çalışma Alanı', '500 YZ Kredisi / ay', 'Açık Çağrı Arama (SEDIA Live)', 'G0-G4 Pipeline & Kanban'],
      recommended: false,
    },
    {
      id: 'pro',
      name: 'Pro',
      monthlyPrice: 87,
      yearlyPrice: 62.25,
      desc: 'Ciddi günlük kullanım & projeler için',
      features: ['Sınırsız Çalışma Alanı', '3.000 YZ Kredisi / ay', 'M1 CORDIS Graf Haritası', 'Evaluator Lens AB Hakem Simülatörü'],
      recommended: true,
    },
    {
      id: 'ultra',
      name: 'Ultra / Kurumsal',
      monthlyPrice: 147,
      yearlyPrice: 99.75,
      desc: 'Tüm ekosistem & kurumsal konsorsiyumlar',
      features: ['Pro Özelliklerinin Tamamı', 'Sınırsız YZ Kredisi (BYO Key)', '150.000+ CORDIS Dışa Aktarımı', 'GİB E-Fatura & Kurumsal SLA'],
      recommended: false,
    },
  ];

  return (
    <div className="space-y-6 font-sans">
      {/* ──────────────────────── HEADER BANNER ──────────────────────── */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 font-semibold tracking-wider uppercase mb-1">
              <CreditCard className="w-4 h-4 text-cyan-400" />
              <span>Faturalama & Kurumsal Kimlik</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight font-heading text-white">
              Stripe Ödeme Altyapısı & Kurumsal SSO Entegrasyonu
            </h1>
            <p className="text-slate-300 text-xs md:text-sm mt-1 max-w-2xl">
              Kuruluş: <strong className="text-white font-semibold">{tenantName}</strong> — Aktif Sağlayıcı:{' '}
              <span className="font-mono text-cyan-400 font-bold uppercase">STRIPE (Tek Ödeme Altyapısı)</span>
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handleStripePortal}
              className="bg-[#22d3ee] hover:bg-[#67e8f9] text-[#080d1a] px-4 py-2.5 rounded-xl font-extrabold text-xs shadow-md transition flex items-center gap-2 cursor-pointer font-mono"
            >
              <CreditCard className="w-4 h-4 text-[#080d1a]" />
              <span>Stripe Müşteri Portalı</span>
              <ExternalLink className="w-3.5 h-3.5 text-[#080d1a]" />
            </button>
          </div>
        </div>
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
          <span>Stripe Global Abonelik Planları (3D Secure 2.0)</span>
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
          <span>Kurumsal SSO (SAML 2.0 / Okta / Entra ID)</span>
        </button>
      </div>

      {/* ──────────────────────── TAB 1: STRIPE BILLING ──────────────────────── */}
      {activeTab === 'billing' && (
        <div className="space-y-6">
          {/* Header Controls */}
          <div className="bg-surface border border-line rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-sm text-ink">Stripe Güvenli Ödeme Altyapısı</h3>
              <p className="text-muted text-xs mt-0.5">
                Tüm abonelik ve eklenti paketleri tek bir Stripe altyapısı üzerinden 256-bit SSL korumasıyla işlenir.
              </p>
            </div>

            <div className="bg-ground p-1 rounded-xl border border-line flex items-center shrink-0">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition ${
                  billingCycle === 'monthly' ? 'bg-accent text-slate-950 shadow-xs' : 'text-muted hover:text-ink'
                }`}
              >
                Aylık Faturalama
              </button>
              <button
                onClick={() => setBillingCycle('yearly')}
                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition flex items-center gap-1 ${
                  billingCycle === 'yearly' ? 'bg-accent text-slate-950 shadow-xs' : 'text-muted hover:text-ink'
                }`}
              >
                <span>Yıllık Faturalama</span>
                <span className="text-[9px] bg-slate-950 text-cyan-300 px-1.5 py-0.2 rounded font-mono font-extrabold">
                  3 Ay Ücretsiz
                </span>
              </button>
            </div>
          </div>

          {/* Pricing Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((p) => {
              const price = billingCycle === 'yearly' ? p.yearlyPrice : p.monthlyPrice;
              const isCurrent = currentPlanId.toLowerCase() === p.id;

              return (
                <div
                  key={p.id}
                  className={`bg-surface border rounded-2xl p-6 shadow-xs space-y-4 flex flex-col justify-between relative transition-all ${
                    p.recommended ? 'border-2 border-accent ring-1 ring-accent/30' : 'border-line hover:border-accent/40'
                  }`}
                >
                  {p.recommended && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-slate-950 text-[10px] font-bold font-mono px-3 py-0.5 rounded-full uppercase shadow-xs">
                      En Popüler Plan
                    </span>
                  )}

                  <div className="space-y-3">
                    <span className="text-xs font-mono font-bold text-muted uppercase tracking-wider">{p.name}</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold text-ink font-mono">${price.toFixed(2)}</span>
                      <span className="text-xs text-muted font-semibold">/ ay</span>
                    </div>
                    <p className="text-xs text-muted">{p.desc}</p>
                    <ul className="text-xs space-y-2 pt-2 border-t border-line text-ink-2">
                      {p.features.map((f, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button
                    onClick={() => {
                      addToCart({
                        id: `plan-${p.id}`,
                        type: 'plan',
                        name: `${p.name} Plan (${billingCycle === 'yearly' ? 'Yıllık' : 'Aylık'})`,
                        subtitle: p.desc,
                        price: price * 0.3, // Apply active 70% discount
                        originalPrice: price,
                        billingCycle: billingCycle,
                        quantity: 1,
                        discountPercent: 70,
                      });
                    }}
                    className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer flex items-center justify-center gap-2 ${
                      isCurrent
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-accent hover:opacity-90 text-slate-950 font-extrabold'
                    }`}
                  >
                    <ShoppingBag className="w-4 h-4" />
                    <span>{isCurrent ? '✓ Aktif Planınız' : 'Stripe İle Sepete Ekle'}</span>
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
              <span>Kurumsal SAML 2.0 Single Sign-On (SSO) Yapılandırması</span>
            </h2>
            <p className="text-muted text-xs mt-1">
              Üniversite ve kurumsal Identity Provider (İTÜ, METU, Okta, Azure AD) SSO entegrasyonu.
            </p>
          </div>

          <form onSubmit={handleSaveSso} className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="font-semibold text-ink block mb-1">Kurumsal E-posta Alan Adı (Domain)</label>
                <input
                  type="text"
                  value={ssoDomain}
                  onChange={(e) => setSsoDomain(e.target.value)}
                  placeholder="Örn: itu.edu.tr"
                  required
                  className="w-full border border-line rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-accent focus:outline-none bg-ground text-ink font-mono font-semibold"
                />
              </div>

              <div>
                <label className="font-semibold text-ink block mb-1">Kimlik Sağlayıcı (IdP Protocol)</label>
                <select
                  value={providerType}
                  onChange={(e) => setProviderType(e.target.value)}
                  className="w-full border border-line rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-accent focus:outline-none bg-ground text-ink"
                >
                  <option value="SAML_2_0">SAML 2.0 (Shibboleth / General IdP)</option>
                  <option value="AZURE_AD">Microsoft Entra ID (Azure AD)</option>
                  <option value="OKTA">Okta Enterprise SSO</option>
                  <option value="KEYCLOAK">Keycloak Realm</option>
                </select>
              </div>
            </div>

            <div>
              <label className="font-semibold text-ink block mb-1">IdP Entity ID / Issuer URL</label>
              <input
                type="text"
                value={idpEntityId}
                onChange={(e) => setIdpEntityId(e.target.value)}
                required
                className="w-full border border-line rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-accent focus:outline-none bg-ground text-ink font-mono"
              />
            </div>

            <div>
              <label className="font-semibold text-ink block mb-1">Assertion Consumer Service (ACS) URL</label>
              <input
                type="text"
                value={ssoAcsUrl}
                onChange={(e) => setSsoAcsUrl(e.target.value)}
                required
                className="w-full border border-line rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-accent focus:outline-none bg-ground text-ink font-mono"
              />
            </div>

            <div>
              <label className="font-semibold text-ink block mb-1">x509 Güvenlik Sertifikası (PEM Public Key)</label>
              <textarea
                rows={3}
                value={x509Cert}
                onChange={(e) => setX509Cert(e.target.value)}
                className="w-full border border-line rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-accent focus:outline-none bg-ground text-ink font-mono text-[11px]"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-line">
              {ssoSaved ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-400 font-bold text-xs">
                  <Check className="w-4 h-4 text-emerald-400" />
                  SAML SSO Ayarları Başarıyla Kaydedildi!
                </span>
              ) : (
                <span className="text-muted text-[11px]">Domain kullanıcıları oturum açarken doğrudan IdP&apos;ye yönlendirilir.</span>
              )}

              <button
                type="submit"
                disabled={isSavingSso}
                className="bg-accent text-slate-950 font-black px-5 py-2.5 rounded-xl transition text-xs shadow-xs cursor-pointer"
              >
                {isSavingSso ? 'Kaydediliyor...' : 'SSO Yapılandırmasını Kaydet'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
