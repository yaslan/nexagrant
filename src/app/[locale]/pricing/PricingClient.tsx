'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import PublicNavbar from '@/components/PublicNavbar';
import PublicFooter from '@/components/PublicFooter';
import { Sparkles, Check, ArrowRight, Zap, Shield, Gift, Copy, CheckCircle, Flame, Layers, Award, ShoppingBag } from 'lucide-react';
import { useCart } from '@/components/cart/CartContext';

interface PricingClientProps {
  locale: string;
}

export default function PricingClient({ locale }: PricingClientProps) {
  const isTr = locale === 'tr';
  const { addToCart, applyCoupon } = useCart();
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('yearly');

  // Tiered Early-Bird Pricing Policy Tiers
  const DISCOUNT_TIERS = [
    { id: 1, labelTr: 'İlk 5 Abone', labelEn: 'First 5 Subs', discount: 70, code: 'ILK5', statusTr: '🔥 AKTİF DÖNEM (Son 2 Koltuk)', statusEn: 'ACTIVE TIER (2 seats left)', isCurrent: true },
    { id: 2, labelTr: 'Sonraki 10 Abone', labelEn: 'Next 10 Subs', discount: 60, code: 'SONRAKI10', statusTr: 'Sırada (Yakında)', statusEn: 'Upcoming', isCurrent: false },
    { id: 3, labelTr: 'Sonraki 20 Abone', labelEn: 'Next 20 Subs', discount: 50, code: 'LANSMAN50', statusTr: 'Sırada', statusEn: 'Upcoming', isCurrent: false },
    { id: 4, labelTr: 'Sonraki 50 Abone', labelEn: 'Next 50 Subs', discount: 40, code: 'KURUCU40', statusTr: 'Sırada', statusEn: 'Upcoming', isCurrent: false },
    { id: 5, labelTr: 'Sonraki 100 Abone', labelEn: 'Next 100 Subs', discount: 30, code: 'GROWTH30', statusTr: 'Sırada', statusEn: 'Upcoming', isCurrent: false },
    { id: 6, labelTr: 'Sonraki 200 Abone', labelEn: 'Next 200 Subs', discount: 20, code: 'SCALE20', statusTr: 'Sırada', statusEn: 'Upcoming', isCurrent: false },
    { id: 7, labelTr: 'Sonraki 500 Abone', labelEn: 'Next 500 Subs', discount: 10, code: 'PROMO10', statusTr: 'Sırada', statusEn: 'Upcoming', isCurrent: false },
  ];

  const [selectedTierId, setSelectedTierId] = useState(1);
  const [copiedCoupon, setCopiedCoupon] = useState(false);

  const activeTier = DISCOUNT_TIERS.find((t) => t.id === selectedTierId) || DISCOUNT_TIERS[0];
  const discountRate = activeTier.discount;
  const discountMultiplier = (100 - discountRate) / 100;

  const handleCopyCoupon = (code: string) => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(code);
      setCopiedCoupon(true);
      setTimeout(() => setCopiedCoupon(false), 2500);
    }
  };

  // Base Prices (Tripled)
  const plans = [
    {
      id: 'basic',
      name: 'Basic',
      subtitle: isTr ? 'Solo başlangıç — İlk adım' : 'Solo start — the first step',
      recommended: false,
      monthly: {
        original: 45,
        discounted: 45 * discountMultiplier,
        billingNote: isTr ? 'Aylık faturalandırılır · İstediğin zaman iptal et' : 'Billed monthly · cancel any time',
      },
      yearly: {
        original: 32.25,
        discounted: 32.25 * discountMultiplier,
        totalYearly: 32.25 * discountMultiplier * 12,
        originalYearly: 387,
        billingNote: isTr ? `Yıllık $${(32.25 * discountMultiplier * 12).toFixed(2)} tek seferde ödenir (~%28 daha ucuz)` : `$${(32.25 * discountMultiplier * 12).toFixed(2)} billed once for the first year · ~28% cheaper yearly`,
      },
      features: [
        isTr ? '1 Çalışma Alanı (Workspace)' : '1 Workspace',
        isTr ? '500 YZ Kredisi / ay' : '500 AI credits / month',
        isTr ? 'Açık Çağrı Arama & Filtreleme (SEDIA Live)' : 'Open Call Search & Filtering (SEDIA Live)',
        isTr ? 'G0-G4 Opportunity Pipeline & Kanban' : 'G0-G4 Opportunity Pipeline & Kanban',
        isTr ? 'Temel CORDIS Ortak Arama' : 'Basic CORDIS Partner Search',
        isTr ? 'Topluluk & Discord Destek Erişimi' : 'Community & Discord Support Access',
      ],
      cta: isTr ? 'Basic ile Başla' : 'Start with Basic',
      ctaHref: `/${locale}/default/dashboard`,
    },
    {
      id: 'pro',
      name: 'Pro',
      subtitle: isTr ? 'Ciddi günlük kullanım & projeler için' : 'For serious daily use & projects',
      recommended: true,
      badgeText: isTr ? 'ÖNERİLEN' : 'RECOMMENDED',
      monthly: {
        original: 87,
        discounted: 87 * discountMultiplier,
        billingNote: isTr ? 'Aylık faturalandırılır · İstediğin zaman iptal et' : 'Billed monthly · cancel any time',
      },
      yearly: {
        original: 62.25,
        discounted: 62.25 * discountMultiplier,
        totalYearly: 62.25 * discountMultiplier * 12,
        originalYearly: 747,
        billingNote: isTr ? `Yıllık $${(62.25 * discountMultiplier * 12).toFixed(2)} tek seferde ödenir (~%28 daha ucuz)` : `$${(62.25 * discountMultiplier * 12).toFixed(2)} billed once for the first year · ~28% cheaper yearly`,
      },
      features: [
        isTr ? 'Sınırsız Çalışma Alanı (Unlimited Workspaces)' : 'Unlimited Workspaces',
        isTr ? '3.000 YZ Kredisi / ay' : '3,000 AI credits / month',
        isTr ? 'M1 CORDIS Ağ Analitiği & Graf Haritası' : 'M1 CORDIS Network & Graph Analytics',
        isTr ? 'M2 Konsept Notu & M3 Kanıt Paketi Deposu' : 'M2 Concept Notes & M3 Evidence Vault',
        isTr ? 'Evaluator Lens (AB Hakem Simülatörü - 15 Puan)' : 'Evaluator Lens (EU Review Simulator)',
        isTr ? 'TTO Hızlandırıcı & Tam Part A/B Üretici' : 'TTO Accelerator & Full Part A/B Generator',
        isTr ? 'Öncelikli E-posta & Canlı Destek' : 'Priority Email & Live Support',
      ],
      cta: isTr ? 'Pro ile Başla' : 'Start with Pro',
      ctaHref: `/${locale}/default/dashboard`,
    },
    {
      id: 'ultra',
      name: 'Ultra / Kurumsal',
      subtitle: isTr ? 'Tüm ekosistem & kurumsal konsorsiyumlar' : 'The whole ecosystem & enterprise',
      recommended: false,
      monthly: {
        original: 147,
        discounted: 147 * discountMultiplier,
        billingNote: isTr ? 'Aylık faturalandırılır · İstediğin zaman iptal et' : 'Billed monthly · cancel any time',
      },
      yearly: {
        original: 99.75,
        discounted: 99.75 * discountMultiplier,
        totalYearly: 99.75 * discountMultiplier * 12,
        originalYearly: 1197,
        billingNote: isTr ? `Yıllık $${(99.75 * discountMultiplier * 12).toFixed(2)} tek seferde ödenir (~%32 daha ucuz)` : `$${(99.75 * discountMultiplier * 12).toFixed(2)} billed once for the first year · ~28% cheaper yearly`,
      },
      lifetime: {
        discounted: 897 * discountMultiplier,
        original: 897,
      },
      features: [
        isTr ? 'Pro paketindeki tüm özellikler +' : 'Everything in Pro, plus:',
        isTr ? 'Sınırsız YZ Kredisi / Kendi Modellerini Bağla (BYO AI)' : 'Unlimited AI Credits / Bring your own LLM keys',
        isTr ? '150.000+ CORDIS Tam Veri Dışa Aktarımı (UBL-TR/JSON/CSV)' : 'Full 150k+ CORDIS Data Exports',
        isTr ? 'Öncelikli Kurucu Onboarding & VIP Danışmanlık' : 'Priority Founder Onboarding & VIP Consulting',
        isTr ? 'Çoklu Ekip Üyesi Koltukları (Team Seats)' : 'Team Seats & Organization Role Management',
        isTr ? 'GİB E-Fatura & Resmi Kurumsal Sözleşme (SLA)' : 'Official GİB E-Invoice & Dedicated SLA',
      ],
      cta: isTr ? 'Ultra ile Başla' : 'Start with Ultra',
      ctaHref: `/${locale}/default/dashboard`,
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#080d1a] text-slate-100 font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      <PublicNavbar locale={locale} />

      <main className="flex-1 max-w-6xl mx-auto py-12 px-4 sm:px-6 w-full">
        {/* Header Section */}
        <div className="text-center max-w-3xl mx-auto mb-10 space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-semibold uppercase tracking-wider shadow-[0_0_15px_rgba(34,211,238,0.15)]">
            <Flame className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            <span>{isTr ? 'Kademeli Erken Kayıt İndirim Politikası' : 'Tiered Early-Bird Discount Policy'}</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white font-heading">
            {isTr ? 'Erken Gelen Kazansın: Kademeli Abonelik Sistemi' : 'First Come, Highest Savings: Tiered Pricing'}
          </h1>
          <p className="text-slate-400 text-sm sm:text-base leading-relaxed max-w-2xl mx-auto">
            {isTr
              ? 'İlk abonelerimize özel %70’ten başlayan indirimler. Abone sayısı arttıkça indirim oranı kademeli olarak güncellenir. Katıldığınız fiyat sabit kalır.'
              : 'Discounts starting at 70% off for early supporters. As subscriber count grows, discount rates step down tier by tier.'}
          </p>
        </div>

        {/* ─── DYNAMIC TIERED DISCOUNT SELECTOR BANNER ─── */}
        <div className="bg-[#0e1628]/90 border border-cyan-500/30 rounded-2xl p-6 shadow-xl mb-10 relative overflow-hidden backdrop-blur-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-5">
            <div>
              <div className="text-[11px] font-bold text-cyan-400 font-mono uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                <span>{isTr ? 'KADEMELİ İNDİRİM KATMANLARI' : 'EARLY BIRD TIER SCHEDULE'}</span>
              </div>
              <h2 className="text-lg font-bold text-white mt-0.5">
                {isTr ? 'Mevcut İndirim Katmanını Seçin & Fiyatları Canlı İnceleyin' : 'Select a Discount Tier to Preview Prices'}
              </h2>
            </div>

            <div className="bg-slate-900 border border-slate-700 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold text-cyan-300 flex items-center gap-2 self-start sm:self-auto">
              <span>{isTr ? 'Aktif Kupon:' : 'Active Code:'}</span>
              <span className="text-amber-300 font-extrabold">{activeTier.code}</span>
              <button
                onClick={() => handleCopyCoupon(activeTier.code)}
                className="hover:text-white transition"
                title={isTr ? 'Kodu Kopyala' : 'Copy Code'}
              >
                {copiedCoupon ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Tier Buttons Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {DISCOUNT_TIERS.map((tier) => {
              const isSelected = selectedTierId === tier.id;
              return (
                <button
                  key={tier.id}
                  onClick={() => setSelectedTierId(tier.id)}
                  className={`p-3 rounded-xl border text-left transition-all relative flex flex-col justify-between cursor-pointer ${
                    isSelected
                      ? 'bg-cyan-500/15 border-cyan-400 text-white shadow-[0_0_15px_rgba(34,211,238,0.25)] ring-1 ring-cyan-400'
                      : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  {tier.isCurrent && (
                    <span className="absolute -top-2 left-2 bg-amber-500 text-slate-950 text-[9px] font-black uppercase px-1.5 py-0.2 rounded font-mono">
                      {isTr ? 'AKTİF' : 'LIVE'}
                    </span>
                  )}
                  <div>
                    <div className="text-[10px] font-bold font-mono text-slate-400">
                      {isTr ? tier.labelTr : tier.labelEn}
                    </div>
                    <div className="text-lg font-extrabold text-cyan-300 font-heading mt-0.5">
                      -%{tier.discount}
                    </div>
                  </div>
                  <div className="text-[9px] font-mono text-slate-400 mt-2">
                    {tier.code}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row justify-between items-center text-xs font-mono text-slate-400 gap-2">
            <div>
              <span className="text-amber-400 font-bold">▶ {isTr ? activeTier.labelTr : activeTier.labelEn}:</span>{' '}
              <span>%{activeTier.discount} {isTr ? 'İndirim uygulanıyor' : 'discount active'} ({activeTier.code})</span>
            </div>
            <div className="text-cyan-400 text-[11px] font-bold">
              {isTr ? activeTier.statusTr : activeTier.statusEn}
            </div>
          </div>
        </div>

        {/* Top Billing Toggle Pill (Monthly vs Yearly) */}
        <div className="flex justify-center mb-10">
          <div className="bg-[#0f172a] p-1.5 rounded-full border border-slate-800 flex items-center shadow-xl relative">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-6 py-2 rounded-full text-xs font-bold transition-all duration-200 relative z-10 ${
                billingCycle === 'monthly'
                  ? 'bg-cyan-400 text-slate-950 shadow-[0_0_20px_rgba(34,211,238,0.4)]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {isTr ? 'Aylık' : 'Monthly'}
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-6 py-2 rounded-full text-xs font-bold transition-all duration-200 relative z-10 flex items-center gap-1.5 ${
                billingCycle === 'yearly'
                  ? 'bg-cyan-400 text-slate-950 shadow-[0_0_20px_rgba(34,211,238,0.4)]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>{isTr ? 'Yıllık' : 'Yearly'}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold tracking-tight ${
                billingCycle === 'yearly' ? 'bg-slate-950 text-cyan-300' : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
              }`}>
                {isTr ? '3 Ay Ücretsiz' : '3 months free'}
              </span>
            </button>
          </div>
        </div>

        {/* ─── THREE PRICING CARDS GRID ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-16 items-stretch">
          {plans.map((plan) => {
            const pricingData = billingCycle === 'yearly' ? plan.yearly : plan.monthly;
            const originalPrice = pricingData.original;
            const discountedPrice = pricingData.discounted;

            return (
              <div
                key={plan.id}
                className={`rounded-2xl p-6 sm:p-7 flex flex-col justify-between relative transition-all duration-300 ${
                  plan.recommended
                    ? 'bg-[#0f192e] border-2 border-cyan-400 shadow-[0_0_35px_rgba(34,211,238,0.2)] ring-1 ring-cyan-400/50'
                    : 'bg-[#0b1324] border border-slate-800 hover:border-slate-700 shadow-xl'
                }`}
              >
                {/* Recommended Badge */}
                {plan.recommended && (
                  <div className="absolute -top-3.5 right-6 bg-cyan-400 text-slate-950 text-[10px] font-black uppercase tracking-wider py-1 px-3 rounded-full shadow-[0_0_15px_rgba(34,211,238,0.5)]">
                    {plan.badgeText}
                  </div>
                )}

                <div>
                  {/* Title & Subtitle */}
                  <h3 className="text-2xl font-bold text-white mb-1 font-heading">{plan.name}</h3>
                  <p className="text-slate-400 text-xs mb-6 min-h-[32px]">{plan.subtitle}</p>

                  {/* Price Header */}
                  <div className="mb-4">
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl sm:text-5xl font-extrabold text-white font-heading tracking-tight">
                        ${discountedPrice.toFixed(2)}
                      </span>
                      <span className="text-lg text-slate-500 line-through font-semibold">
                        ${originalPrice.toFixed(2)}
                      </span>
                      <span className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[11px] font-extrabold px-2 py-0.5 rounded font-mono">
                        -%{discountRate}
                      </span>
                      <span className="text-slate-400 text-xs">/ay</span>
                    </div>

                    <div className="text-[11px] text-slate-400 mt-2 font-mono leading-relaxed">
                      {pricingData.billingNote}
                    </div>

                    {/* Promo Coupon Line */}
                    <div className="mt-2 text-[10px] font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-500/30 rounded-lg p-2 flex items-center justify-between">
                      <span>Kupon: {activeTier.code}</span>
                      <span>{isTr ? `%${discountRate} İndirimli Yenileme` : `${discountRate}% Off Rate`}</span>
                    </div>
                  </div>

                  {/* Lifetime option for Ultra */}
                  {plan.lifetime && (
                    <div className="mb-6 bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-300">{isTr ? 'Ömür Boyu · Tek Ödeme ↓' : 'Lifetime · one payment ↓'}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-cyan-300">${plan.lifetime.discounted.toFixed(2)}</span>
                        <span className="line-through text-slate-500 text-[10px]">${plan.lifetime.original}</span>
                        <span className="bg-cyan-500/20 text-cyan-300 text-[9px] px-1 rounded">-%{discountRate}</span>
                      </div>
                    </div>
                  )}

                  {/* CTA Button */}
                  <div className="mb-8">
                    <button
                      onClick={() => {
                        applyCoupon(activeTier.code, discountRate);
                        addToCart({
                          id: `plan-${plan.id}`,
                          type: 'plan',
                          name: `${plan.name} Plan (${billingCycle === 'yearly' ? (isTr ? 'Yıllık' : 'Yearly') : (isTr ? 'Aylık' : 'Monthly')})`,
                          subtitle: plan.subtitle,
                          price: discountedPrice,
                          originalPrice: originalPrice,
                          billingCycle: billingCycle,
                          quantity: 1,
                          promoCode: activeTier.code,
                          discountPercent: discountRate,
                        });
                      }}
                      className={`w-full py-3.5 rounded-xl font-extrabold text-xs transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
                        plan.recommended
                          ? 'bg-cyan-400 hover:bg-cyan-300 text-slate-950 shadow-[0_0_25px_rgba(34,211,238,0.4)] hover:shadow-[0_0_35px_rgba(34,211,238,0.6)]'
                          : 'bg-slate-900 hover:bg-slate-800 text-white border border-slate-700 hover:border-slate-600'
                      }`}
                    >
                      <ShoppingBag className="w-4 h-4" />
                      <span>{isTr ? `${plan.name} Paketini Sepete Ekle` : `Add ${plan.name} to Cart`}</span>
                      <span>↗</span>
                    </button>
                  </div>

                  {/* Feature Checklist */}
                  <div className="space-y-3 pt-4 border-t border-slate-800/80">
                    {plan.features.map((feature, idx) => (
                      <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-300 leading-snug">
                        <Check className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ─── EXCLUSIVE LIFETIME OFFER BANNER (FIRST 20 ENTITIES) ─── */}
        <div className="bg-[#0b1426] border-2 border-cyan-400/80 rounded-3xl p-6 sm:p-8 shadow-[0_0_40px_rgba(34,211,238,0.2)] mb-12 relative overflow-hidden backdrop-blur-xl">
          {/* Header Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-800 font-mono">
            <div className="flex items-center gap-2 text-xs font-bold text-cyan-400 tracking-widest uppercase">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
              <span>● LIFETIME · PAY ONCE</span>
            </div>
            <div className="bg-slate-900 border border-slate-700 px-3.5 py-1.5 rounded-full text-xs text-slate-300 font-bold flex items-center gap-2 self-start sm:self-auto shadow-inner">
              <span className="text-amber-400 font-extrabold">5 {isTr ? 'Lisans Sahibi' : 'owners'}</span>
              <span>·</span>
              <span className="text-cyan-300">{isTr ? 'Sıradaki Lisans #6 (İlk 20 Firma ile Sınırlı)' : 'next license #6 (Limited to First 20 Entities)'}</span>
            </div>
          </div>

          {/* Banner Title & Description */}
          <div className="max-w-3xl mb-8">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white tracking-tight mb-2 font-heading">
              {isTr ? 'Tek ödeme — ömür boyu sizin.' : 'Pay once — yours forever.'}
            </h2>
            <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
              {isTr
                ? 'Abonelik yok, yenileme yok, sürpriz yok. Tek bir ödeme; plan hesabınızda ömür boyu kalır. Yalnızca ilk 20 kişi/firma bu avantajdan yararlanabilir.'
                : 'No subscription, no renewal, no surprises. One payment; the plan stays on your account forever. Limited to the first 20 entities.'}
            </p>
          </div>

          {/* Grid: Purchase Card vs Comparison Matrix */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Left Purchase Card (5 cols) */}
            <div className="lg:col-span-5 bg-[#0e182e] border border-cyan-400/50 rounded-2xl p-6 flex flex-col justify-between shadow-xl relative">
              <div>
                <div className="text-xs font-bold text-slate-400 font-mono uppercase tracking-wider mb-1">
                  Ultra · Lifetime
                </div>
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-4xl sm:text-5xl font-extrabold text-white font-heading">
                    $1,288
                  </span>
                  <span className="text-lg text-slate-500 line-through font-semibold">$2,576</span>
                  <span className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-extrabold px-2.5 py-0.5 rounded font-mono">
                    -50%
                  </span>
                  <span className="text-xs text-slate-400 font-mono">one-time</span>
                </div>

                <div className="inline-flex items-center gap-1.5 text-[11px] font-mono text-cyan-300 bg-cyan-950/80 border border-cyan-500/30 px-2.5 py-1 rounded-lg mb-6">
                  <span>OMURBOYU20</span>
                  <span>·</span>
                  <span>{isTr ? 'Tek seferlik %50 indirim' : '50% off the one-time payment'}</span>
                </div>
              </div>

              <div>
                <button
                  onClick={() => {
                    addToCart({
                      id: 'lifetime-ultra',
                      type: 'lifetime',
                      name: 'Ultra Ömür Boyu Lisans (Lifetime)',
                      subtitle: isTr ? 'İlk 20 Firma — Tek ödeme, ömür boyu erişim' : 'First 20 Entities — Pay once, access forever',
                      price: 1288,
                      originalPrice: 2576,
                      billingCycle: 'one-time',
                      quantity: 1,
                      promoCode: 'OMURBOYU20',
                      discountPercent: 50,
                    });
                  }}
                  className="w-full py-3.5 rounded-xl font-extrabold text-xs bg-cyan-400 hover:bg-cyan-300 text-slate-950 shadow-[0_0_25px_rgba(34,211,238,0.4)] hover:shadow-[0_0_35px_rgba(34,211,238,0.6)] transition-all flex items-center justify-center gap-2 cursor-pointer mb-3"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>{isTr ? 'Ömür Boyu Lisans Al — Lisans #6' : 'Buy lifetime — License #6'}</span>
                  <span>↗</span>
                </button>
                <div className="text-[10px] text-slate-400 font-mono text-center">
                  {isTr
                    ? '14 gün para iade garantisi — kupon ve ömür boyu satın alımlar dahildir.'
                    : '14-day refund guarantee — coupon and lifetime purchases included.'}
                </div>
              </div>
            </div>

            {/* Right Comparison Box (7 cols) */}
            <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between font-mono text-xs shadow-xl">
              <div>
                <h3 className="font-bold text-white mb-4 text-sm font-heading">
                  {isTr ? 'Ultra Yıllık Plan ile Karşılaştırma' : 'Against the Ultra yearly plan'}
                </h3>

                <div className="space-y-3">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                    <span className="text-slate-400">{isTr ? 'Bugün Ödenen Tutar' : 'You pay today'}</span>
                    <div className="space-x-4">
                      <span className="text-slate-400">{isTr ? 'YIL: $598.50' : 'YEARLY $598.50'}</span>
                      <span className="font-bold text-cyan-300">{isTr ? 'ÖMÜR BOYU: $1,288' : 'LIFETIME $1,288'}</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                    <span className="text-slate-400">{isTr ? 'Sonraki Her Yıl' : 'Every year after'}</span>
                    <div className="space-x-4">
                      <span className="text-slate-400">$1,197.00</span>
                      <span className="font-bold text-emerald-400">$0</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-1 font-bold">
                    <span className="text-white">{isTr ? '3 Yıldaki Toplam Maliyet' : 'Total over 3 years'}</span>
                    <div className="space-x-4">
                      <span className="text-slate-400 line-through">$2,992.50</span>
                      <span className="text-cyan-300 text-sm">$1,288</span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 bg-cyan-950/40 border border-cyan-500/30 rounded-xl p-3 text-cyan-300 text-xs font-semibold leading-relaxed">
                  {isTr
                    ? '3 yılda tam $1,704.50 daha az ödersiniz — ömür boyu lisans kendini 13 ayda amorti eder.'
                    : 'You pay $1,704.50 less over 3 years — lifetime pays for itself in 13 months.'}
                </div>
              </div>

              <div className="mt-6 pt-3 border-t border-slate-800 text-[11px] text-slate-400">
                {isTr
                  ? 'AB proje modülleri, CORDIS analitiği, hakem simülatörü ve tüm 1.x güncellemeleri — sonsuza kadar.'
                  : 'Desktop app, agents, memory, skills and every 1.x update — forever. Cloud sync and mobile stay on subscription.'}
              </div>
            </div>
          </div>
        </div>

        {/* ─── FULL DISCOUNTS TIER SCHEDULE TABLE ─── */}
        <div className="bg-[#0b1324] border border-slate-800 rounded-2xl p-6 shadow-xl mb-12">
          <h3 className="text-lg font-bold text-white mb-2 font-heading">
            {isTr ? '📋 Kademeli İndirim Politikası Detay Tablosu' : '📋 Tiered Discount Schedule Details'}
          </h3>
          <p className="text-xs text-slate-400 mb-6">
            {isTr
              ? 'Erken abonelik sıranıza göre uygulanan indirim oranları ve kupon kodları tablosu.'
              : 'Complete breakdown of discount rates and coupon codes based on subscription order.'}
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead>
                <tr className="bg-slate-900 text-cyan-400 border-b border-slate-800">
                  <th className="p-3 font-bold">{isTr ? 'Katman (Abone Sırası)' : 'Tier (Subscriber Count)'}</th>
                  <th className="p-3 font-bold">{isTr ? 'İndirim Oranı' : 'Discount Rate'}</th>
                  <th className="p-3 font-bold">{isTr ? 'Kupon Kodu' : 'Promo Code'}</th>
                  <th className="p-3 font-bold">{isTr ? 'Basic Aylık' : 'Basic Monthly'}</th>
                  <th className="p-3 font-bold">{isTr ? 'Pro Aylık' : 'Pro Monthly'}</th>
                  <th className="p-3 font-bold">{isTr ? 'Ultra Aylık' : 'Ultra Monthly'}</th>
                  <th className="p-3 font-bold text-right">{isTr ? 'Durum' : 'Status'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-300">
                {DISCOUNT_TIERS.map((tier) => (
                  <tr
                    key={tier.id}
                    className={`hover:bg-slate-900/50 transition ${selectedTierId === tier.id ? 'bg-cyan-950/40 text-white font-bold' : ''}`}
                  >
                    <td className="p-3">{isTr ? tier.labelTr : tier.labelEn}</td>
                    <td className="p-3 text-cyan-300 font-extrabold">-%{tier.discount}</td>
                    <td className="p-3 font-bold text-amber-300">{tier.code}</td>
                    <td className="p-3">${(45 * (100 - tier.discount) / 100).toFixed(2)}</td>
                    <td className="p-3 font-bold text-white">${(87 * (100 - tier.discount) / 100).toFixed(2)}</td>
                    <td className="p-3">${(147 * (100 - tier.discount) / 100).toFixed(2)}</td>
                    <td className="p-3 text-right">
                      {tier.isCurrent ? (
                        <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded text-[10px]">
                          {isTr ? '🔥 AKTİF KATMAN' : 'ACTIVE TIER'}
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[10px]">
                          {isTr ? 'SIRADA' : 'UPCOMING'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bottom Guarantee & SLA Note */}
        <div className="text-center text-xs text-slate-400 font-mono space-y-2 max-w-2xl mx-auto border-t border-slate-800 pt-8">
          <p>
            {isTr
              ? 'Hesabınızla giriş yapın — seçtiğiniz katman ve indirim kuponu ödeme adımında otomatik uygulanır.'
              : 'Sign in with your account — the tier and coupon code apply automatically at checkout.'}
          </p>
          <div className="flex justify-center items-center gap-6 text-[11px] text-slate-400 pt-2">
            <span className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-cyan-400" />
              {isTr ? '14 Gün Para İade Garantisi' : '14-day Money Back Guarantee'}
            </span>
            <span className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-cyan-400" />
              {isTr ? 'İstediğin Zaman İptal Et' : 'Cancel Any Time'}
            </span>
            <span className="flex items-center gap-1.5">
              <Gift className="w-3.5 h-3.5 text-cyan-400" />
              {isTr ? 'GİB E-Fatura Uyumlu' : 'GİB E-Invoice Compliant'}
            </span>
          </div>
        </div>
      </main>

      <PublicFooter locale={locale} />
    </div>
  );
}
