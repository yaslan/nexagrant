'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useCart } from '@/components/cart/CartContext';
import { ShoppingBag, CreditCard, Sparkles, Check, Zap } from 'lucide-react';

interface BillingClientProps {
  workspace: string;
  locale: string;
  tenantId: string;
  tenantName: string;
  currentPlanId: string;
  entitlements: {
    allowedModules: string[];
    seats: number;
    usedSeats?: number;
    workspaces: number;
    usedWorkspaces?: number;
    aiCreditsMonthly: number;
    aiCreditsRemaining?: number;
  };
}

export function BillingClient({
  workspace,
  locale,
  tenantId,
  tenantName,
  currentPlanId = 'team',
  entitlements,
}: BillingClientProps) {
  const isTr = locale === 'tr';
  const { addToCart, applyCoupon } = useCart();
  const [activePlan, setActivePlan] = useState<string>(currentPlanId.toLowerCase());
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  };

  const usedSeats = entitlements.usedSeats || 3;
  const totalSeats = entitlements.seats || 6;
  const usedWorkspaces = entitlements.usedWorkspaces || 1;
  const totalWorkspaces = entitlements.workspaces || 5;
  const remainingCredits = entitlements.aiCreditsRemaining ?? 500;
  const totalCredits = entitlements.aiCreditsMonthly || 1000;
  const creditPercent = Math.min(100, Math.round((remainingCredits / Math.max(1, totalCredits)) * 100));

  const handleStripePortal = async () => {
    try {
      showToast(isTr ? 'Stripe Müşteri Portalı açılıyor...' : 'Opening customer portal...', 'info');
      const res = await fetch('/api/billing/portal', { method: 'POST' });
      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url;
      } else {
        showToast(isTr ? 'Demo modunda Stripe portal simülasyonu sağlandı.' : 'Stripe portal simulated in demo mode.', 'info');
      }
    } catch {
      showToast(isTr ? 'Stripe portalına bağlanılamadı (Demo modu).' : 'Could not reach Stripe portal.', 'info');
    }
  };

  const handlePlanSelect = (planKey: string, planName: string) => {
    startTransition(async () => {
      setActivePlan(planKey);
      showToast(
        isTr
          ? `${planName} paketine geçiş talebiniz başarıyla güncellendi!`
          : `Plan updated to ${planName} successfully!`,
        'success'
      );
    });
  };

  const handleBuyCredits = (amount: number, price: string) => {
    showToast(
      isTr
        ? `+${amount} AI Kredisi yükleme talebi alındı (${price}).`
        : `Added +${amount} AI credits (${price}).`,
      'success'
    );
  };

  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('yearly');
  const [activeTierId, setActiveTierId] = useState(1);

  const DISCOUNT_TIERS = [
    { id: 1, labelTr: 'İlk 5 Abone (%70)', labelEn: 'First 5 (%70)', discount: 70, code: 'ILK5' },
    { id: 2, labelTr: 'Sonraki 10 (%60)', labelEn: 'Next 10 (%60)', discount: 60, code: 'SONRAKI10' },
    { id: 3, labelTr: 'Sonraki 20 (%50)', labelEn: 'Next 20 (%50)', discount: 50, code: 'LANSMAN50' },
    { id: 4, labelTr: 'Sonraki 50 (%40)', labelEn: 'Next 50 (%40)', discount: 40, code: 'KURUCU40' },
    { id: 5, labelTr: 'Sonraki 100 (%30)', labelEn: 'Next 100 (%30)', discount: 30, code: 'GROWTH30' },
    { id: 6, labelTr: 'Sonraki 200 (%20)', labelEn: 'Next 200 (%20)', discount: 20, code: 'SCALE20' },
    { id: 7, labelTr: 'Sonraki 500 (%10)', labelEn: 'Next 500 (%10)', discount: 10, code: 'PROMO10' },
  ];

  const activeTier = DISCOUNT_TIERS.find((t) => t.id === activeTierId) || DISCOUNT_TIERS[0];
  const discountMultiplier = (100 - activeTier.discount) / 100;

  const plans = [
    {
      id: 'basic',
      name: isTr ? 'Basic (Solo)' : 'Basic (Solo)',
      priceDisplay: billingCycle === 'yearly' ? `$${(32.25 * discountMultiplier).toFixed(2)}` : `$${(45 * discountMultiplier).toFixed(2)}`,
      originalDisplay: billingCycle === 'yearly' ? '$32.25' : '$45.00',
      period: isTr ? '/ay' : '/mo',
      billingNote: billingCycle === 'yearly'
        ? (isTr ? `Yıllık $${(32.25 * discountMultiplier * 12).toFixed(2)} tek seferde` : `$${(32.25 * discountMultiplier * 12).toFixed(2)} billed yearly`)
        : (isTr ? 'Aylık faturalandırılır' : 'Billed monthly'),
      desc: isTr ? 'Solo başlangıç — ilk adım.' : 'Solo start — the first step.',
      seats: '1 Kullanıcı / 1 Workspace',
      credits: '500 YZ Kredisi / ay',
      modules: ['M3', 'M5'],
      badge: null,
    },
    {
      id: 'pro',
      name: isTr ? 'Pro (Profesyonel)' : 'Pro (Professional)',
      priceDisplay: billingCycle === 'yearly' ? `$${(62.25 * discountMultiplier).toFixed(2)}` : `$${(87 * discountMultiplier).toFixed(2)}`,
      originalDisplay: billingCycle === 'yearly' ? '$62.25' : '$87.00',
      period: isTr ? '/ay' : '/mo',
      billingNote: billingCycle === 'yearly'
        ? (isTr ? `Yıllık $${(62.25 * discountMultiplier * 12).toFixed(2)} tek seferde` : `$${(62.25 * discountMultiplier * 12).toFixed(2)} billed yearly`)
        : (isTr ? 'Aylık faturalandırılır' : 'Billed monthly'),
      desc: isTr ? 'Ciddi günlük kullanım & projeler.' : 'For serious daily use & projects.',
      seats: 'Sınırsız Workspace',
      credits: '3.000 YZ Kredisi / ay',
      modules: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M8'],
      badge: isTr ? 'ÖNERİLEN' : 'RECOMMENDED',
    },
    {
      id: 'team',
      name: isTr ? 'Ultra (Kurumsal)' : 'Ultra / Enterprise',
      priceDisplay: billingCycle === 'yearly' ? `$${(99.75 * discountMultiplier).toFixed(2)}` : `$${(147 * discountMultiplier).toFixed(2)}`,
      originalDisplay: billingCycle === 'yearly' ? '$99.75' : '$147.00',
      period: isTr ? '/ay' : '/mo',
      billingNote: billingCycle === 'yearly'
        ? (isTr ? `Yıllık $${(99.75 * discountMultiplier * 12).toFixed(2)} tek seferde` : `$${(99.75 * discountMultiplier * 12).toFixed(2)} billed yearly`)
        : (isTr ? 'Aylık faturalandırılır' : 'Billed monthly'),
      desc: isTr ? 'Tüm ekosistem & kurumsal konsorsiyumlar.' : 'The whole ecosystem & enterprise.',
      seats: 'Sınırsız Koltuk & Workspace',
      credits: 'Sınırsız YZ Kredisi (BYO Key)',
      modules: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11'],
      badge: isTr ? 'Mevcut Planınız' : 'Current Plan',
    },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-16">
      {/* Toast */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 animate-in slide-in-from-top-2">
          <div
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
                Dashboard
              </Link>
              <span>/</span>
              <span className="text-ink-2">Ayarlar</span>
              <span>/</span>
              <span className="text-accent-ink font-semibold">Abonelik & Faturalandırma</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold font-heading text-ink">
              Abonelik, Krediler & Faturalandırma
            </h1>
            <p className="text-xs md:text-sm text-ink-2 mt-1">
              Çalışma alanınızın ({tenantName}) aktif paketini, yapay zeka kredi bakiyesini ve kota kullanımını yönetin.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleStripePortal}
              className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xs transition flex items-center gap-2 cursor-pointer"
            >
              <span>💳</span>
              <span>Stripe Müşteri Portalı</span>
            </button>
          </div>
        </div>

        {/* ─── METRIC CARDS ROW ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8 pt-6 border-t border-border">
          {/* Card 1: Active Plan */}
          <div className="p-4 bg-ground border border-border rounded-2xl space-y-1.5">
            <div className="text-xs text-muted font-medium">Aktif Plan</div>
            <div className="text-xl font-bold text-ink uppercase tracking-tight flex items-center gap-2">
              <span>{activePlan}</span>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-mono font-bold">
                AKTİF
              </span>
            </div>
            <div className="text-[11px] text-muted">Dönem: Aylık Otomatik Yenileme</div>
          </div>

          {/* Card 2: AI Credits */}
          <div className="p-4 bg-ground border border-border rounded-2xl space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-muted font-medium">Yapay Zeka Kredisi</span>
              <span className="font-bold text-ink font-mono">
                {remainingCredits} / {totalCredits}
              </span>
            </div>
            <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-500"
                style={{ width: `${creditPercent}%` }}
              ></div>
            </div>
            <div className="flex justify-between items-center text-[10px] text-muted">
              <span>%{creditPercent} Kalan</span>
              <span className="text-blue-600 font-bold hover:underline cursor-pointer" onClick={() => handleBuyCredits(250, '€49')}>
                + Kredi Al
              </span>
            </div>
          </div>

          {/* Card 3: Seats */}
          <div className="p-4 bg-ground border border-border rounded-2xl space-y-1.5">
            <div className="text-xs text-muted font-medium">Kullanıcı Koltukları</div>
            <div className="text-xl font-bold text-ink">
              {usedSeats} <span className="text-sm font-normal text-muted">/ {totalSeats} Koltuk</span>
            </div>
            <div className="text-[11px] text-muted">
              <Link href={`/${locale}/${workspace}/settings/members`} className="text-blue-600 hover:underline">
                Ekip Üyelerini Yönet →
              </Link>
            </div>
          </div>

          {/* Card 4: Workspaces */}
          <div className="p-4 bg-ground border border-border rounded-2xl space-y-1.5">
            <div className="text-xs text-muted font-medium">Çalışma Alanları</div>
            <div className="text-xl font-bold text-ink">
              {usedWorkspaces} <span className="text-sm font-normal text-muted">/ {totalWorkspaces} Alan</span>
            </div>
            <div className="text-[11px] text-muted font-mono">Slug: {workspace}</div>
          </div>
        </div>
      </div>

      {/* ─── ACTIVE MODULES ACCESS BAR ─── */}
      <div className="bg-surface border rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-4">
          <div>
            <h3 className="text-base font-bold text-ink font-heading">
              Planınız Kapsamındaki Yetkili Modüller
            </h3>
            <p className="text-xs text-muted">
              Mevcut aboneliğiniz dahilinde kullanabileceğiniz açık AB proje modülleri.
            </p>
          </div>
          <Link
            href={`/${locale}/${workspace}/settings/modules`}
            className="text-xs font-bold text-accent-ink hover:underline bg-ground border px-3 py-1.5 rounded-lg transition self-start sm:self-auto"
          >
            Modülleri Yönet (M1-M11) →
          </Link>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {entitlements.allowedModules.map((m) => (
            <Link
              key={m}
              href={`/${locale}/${workspace}/settings/modules`}
              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-800 text-xs font-bold rounded-xl transition flex items-center gap-1.5 font-mono"
            >
              <span>✓</span>
              <span>Modül {m}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* ─── SUBSCRIPTION PLANS GRID ─── */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold font-heading text-ink">Abonelik Planları & Yükseltme</h2>
            <p className="text-xs text-muted">
              Ar-Ge operasyonlarınıza ve ekip büyüklüğünüze en uygun planı seçin.
            </p>
          </div>

          {/* Monthly / Yearly Toggle */}
          <div className="bg-ground p-1 rounded-full border border-border flex items-center self-start sm:self-auto">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition ${
                billingCycle === 'monthly'
                  ? 'bg-accent text-white shadow-2xs'
                  : 'text-muted hover:text-ink'
              }`}
            >
              {isTr ? 'Aylık' : 'Monthly'}
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5 ${
                billingCycle === 'yearly'
                  ? 'bg-accent text-white shadow-2xs'
                  : 'text-muted hover:text-ink'
              }`}
            >
              <span>{isTr ? 'Yıllık' : 'Yearly'}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-extrabold ${
                billingCycle === 'yearly' ? 'bg-white/20 text-white' : 'bg-accent/15 text-accent font-mono'
              }`}>
                {isTr ? '3 Ay Ücretsiz' : '3 months free'}
              </span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {plans.map((p) => {
            const isCurrent = activePlan === p.id;

            return (
              <div
                key={p.id}
                className={`bg-surface border rounded-2xl p-6 shadow-xs flex flex-col justify-between transition-all relative ${
                  isCurrent ? 'border-accent ring-2 ring-accent/20' : 'border-border hover:border-border'
                }`}
              >
                {p.badge && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-white text-[10px] font-bold uppercase tracking-wider py-0.5 px-2.5 rounded-full shadow-2xs">
                    {p.badge}
                  </span>
                )}

                <div className="space-y-4">
                  <div>
                    <h3 className="text-base font-bold text-ink">{p.name}</h3>
                    <p className="text-[11px] text-muted mt-0.5">{p.desc}</p>
                  </div>

                  <div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl font-extrabold text-ink">{p.priceDisplay}</span>
                      <span className="text-sm text-slate-400 line-through font-medium">{p.originalDisplay}</span>
                      <span className="text-xs bg-accent/15 text-accent font-extrabold px-1.5 py-0.5 rounded font-mono">-50%</span>
                      <span className="text-xs text-muted">{p.period}</span>
                    </div>
                    <div className="text-[10px] font-mono text-muted mt-1">{p.billingNote}</div>
                  </div>

                  <ul className="space-y-2 text-xs text-ink-2 pt-2 border-t border-border">
                    <li className="flex items-center gap-1.5">
                      <span className="text-emerald-600 font-bold">✓</span> {p.seats}
                    </li>
                    <li className="flex items-center gap-1.5 font-semibold text-ink">
                      <span className="text-emerald-600 font-bold">✓</span> {p.credits}
                    </li>
                    <li className="flex items-center gap-1.5 text-muted text-[11px]">
                      <span>📦 Modüller:</span> {p.modules.join(', ')}
                    </li>
                  </ul>
                </div>

                <div className="pt-6 mt-4 border-t border-border">
                  <button
                    onClick={() => {
                      const numPrice = p.id === 'basic' ? (billingCycle === 'yearly' ? 32.25 : 45) : p.id === 'pro' ? (billingCycle === 'yearly' ? 62.25 : 87) : (billingCycle === 'yearly' ? 99.75 : 147);
                      const discountRate = activeTier.discount;
                      applyCoupon(activeTier.code, discountRate);
                      addToCart({
                        id: `plan-${p.id}`,
                        type: 'plan',
                        name: `${p.name} (${billingCycle === 'yearly' ? 'Yıllık' : 'Aylık'})`,
                        subtitle: p.desc,
                        price: numPrice * ((100 - discountRate) / 100),
                        originalPrice: numPrice,
                        billingCycle: billingCycle,
                        quantity: 1,
                        promoCode: activeTier.code,
                        discountPercent: discountRate,
                      });
                    }}
                    disabled={isCurrent}
                    className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition shadow-2xs cursor-pointer flex items-center justify-center gap-1.5 ${
                      isCurrent
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 cursor-default'
                        : 'bg-accent hover:opacity-90 text-slate-950 font-extrabold'
                    }`}
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span>{isCurrent ? '✓ Mevcut Planınız' : 'Sepete Ekle & Satın Al'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── EXCLUSIVE LIFETIME OFFER BANNER (FIRST 20 ENTITIES) ─── */}
      <div className="bg-[#0b1426] text-white border-2 border-cyan-400/80 rounded-2xl p-6 shadow-lg space-y-4 font-sans relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3 font-mono text-xs">
          <div className="flex items-center gap-2 font-bold text-cyan-400 uppercase tracking-widest">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            <span>● LIFETIME · PAY ONCE</span>
          </div>
          <div className="bg-slate-900 border border-slate-700 px-3 py-1 rounded-full text-[11px] text-slate-300 font-bold flex items-center gap-1.5 self-start sm:self-auto">
            <span className="text-amber-400 font-extrabold">5 Lisans Sahibi</span>
            <span>·</span>
            <span className="text-cyan-300">Sıradaki Lisans #6 (İlk 20 Firma ile Sınırlı)</span>
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1.5 max-w-2xl">
            <h3 className="text-xl font-bold font-heading text-white">
              Tek ödeme — Ömür boyu sizin.
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Abonelik yok, yenileme yok, sürpriz yok. Tek bir ödeme ($1,288) ile Ultra paket özelliklerinin tamamı hesabınızda ömür boyu kalır. Yalnızca ilk 20 firma faydalanabilir.
            </p>
          </div>

          <div className="flex flex-col items-start md:items-end gap-2 shrink-0">
            <div className="flex items-baseline gap-2 font-mono">
              <span className="text-3xl font-extrabold text-white">$1,288</span>
              <span className="text-slate-400 line-through text-sm">$2,576</span>
              <span className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-bold px-1.5 py-0.5 rounded font-mono">-50% tek seferlik</span>
            </div>
            <button
              onClick={() => {
                addToCart({
                  id: 'lifetime-ultra',
                  type: 'lifetime',
                  name: 'Ultra Ömür Boyu Lisans (Lifetime)',
                  subtitle: 'İlk 20 Firma — Tek ödeme, ömür boyu erişim',
                  price: 1288,
                  originalPrice: 2576,
                  billingCycle: 'one-time',
                  quantity: 1,
                  promoCode: 'OMURBOYU20',
                  discountPercent: 50,
                });
              }}
              className="bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-extrabold text-xs px-5 py-2.5 rounded-xl shadow-[0_0_20px_rgba(34,211,238,0.4)] transition flex items-center gap-1.5 cursor-pointer"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Ömür Boyu Lisans Al — Lisans #6</span>
              <span>↗</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── AI CREDIT ADD-ON PACKS ─── */}
      <div className="bg-surface border rounded-2xl p-6 shadow-xs space-y-4">
        <div>
          <h3 className="text-base font-bold text-ink font-heading">
            ⚡ Ekstra Yapay Zeka Kredisi & Eklenti Paketleri
          </h3>
          <p className="text-xs text-muted">
            Abonelik paketinizi değiştirmeden anlık kredi veya modül eklentisi tanımlayın.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 bg-ground border rounded-xl flex items-center justify-between">
            <div>
              <div className="font-bold text-xs text-ink">+500 AI Kredisi</div>
              <div className="text-[11px] text-muted mt-0.5">Tek Seferlik Yükleme</div>
              <div className="text-sm font-extrabold text-cyan-400 mt-1">$49</div>
            </div>
            <button
              onClick={() => {
                addToCart({
                  id: 'credits-500',
                  type: 'credits',
                  name: '+500 Yapay Zeka Kredisi Paket Yüklemesi',
                  subtitle: 'Anlık jeton bakiyesi tanımlama',
                  price: 49,
                  billingCycle: 'one-time',
                  quantity: 1,
                  discountPercent: 0,
                });
              }}
              className="text-xs font-bold bg-accent text-slate-950 hover:bg-cyan-300 px-3.5 py-2 rounded-xl transition shadow-2xs cursor-pointer flex items-center gap-1 font-extrabold"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Satın Al</span>
            </button>
          </div>

          <div className="p-4 bg-ground border rounded-xl flex items-center justify-between">
            <div>
              <div className="font-bold text-xs text-ink">+1.500 AI Kredisi</div>
              <div className="text-[11px] text-muted mt-0.5">Tek Seferlik Yükleme</div>
              <div className="text-sm font-extrabold text-cyan-400 mt-1">$119</div>
            </div>
            <button
              onClick={() => {
                addToCart({
                  id: 'credits-1500',
                  type: 'credits',
                  name: '+1.500 Yapay Zeka Kredisi Paket Yüklemesi',
                  subtitle: 'Anlık jeton bakiyesi tanımlama',
                  price: 119,
                  billingCycle: 'one-time',
                  quantity: 1,
                  discountPercent: 0,
                });
              }}
              className="text-xs font-bold bg-accent text-slate-950 hover:bg-cyan-300 px-3.5 py-2 rounded-xl transition shadow-2xs cursor-pointer flex items-center gap-1 font-extrabold"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Satın Al</span>
            </button>
          </div>

          <div className="p-4 bg-ground border rounded-xl flex items-center justify-between">
            <div>
              <div className="font-bold text-xs text-ink">M6 Evaluator Lens</div>
              <div className="text-[11px] text-muted mt-0.5">Hakem Simülatörü Eklentisi</div>
              <div className="text-sm font-extrabold text-cyan-400 mt-1">$79 / ay</div>
            </div>
            <button
              onClick={() => {
                addToCart({
                  id: 'addon-m6',
                  type: 'addon',
                  name: 'M6 Evaluator Lens Eklentisi',
                  subtitle: 'AB Hakem Simülatörü modül erişimi',
                  price: 79,
                  billingCycle: 'monthly',
                  quantity: 1,
                  discountPercent: 0,
                });
              }}
              className="text-xs font-bold bg-accent text-slate-950 hover:bg-cyan-300 px-3.5 py-2 rounded-xl transition shadow-2xs cursor-pointer flex items-center gap-1 font-extrabold"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Satın Al</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── TURKISH E-INVOICE & PAYMENT HISTORY (GİB / UBL-TR) ─── */}
      <div className="bg-surface border rounded-2xl p-6 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] bg-red-100 text-red-800 border border-red-200 px-2 py-0.5 rounded font-mono font-bold">
                GİB E-FATURA & E-ARŞİV
              </span>
              <h3 className="text-base font-bold text-ink font-heading">
                {isTr ? 'Resmî E-Fatura & Ödeme Geçmişi' : 'Official E-Invoices & Payment History'}
              </h3>
            </div>
            <p className="text-xs text-muted mt-0.5">
              {isTr
                ? 'GİB ve UBL-TR 1.2.1 standartlarına uygun elektronik faturalarınız ve XML/PDF dışa aktarımları.'
                : 'Electronic invoices compliant with Turkish Tax Administration (GİB) UBL-TR 1.2.1 standards.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-ink-2 bg-surface-hover px-3 py-1 rounded-xl">
              VKN: 2840958172
            </span>
          </div>
        </div>

        {/* Tax Info Box */}
        <div className="bg-ground border border-border rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <span className="text-[11px] text-muted block">Kayıtlı Fatura Unvanı</span>
            <span className="font-bold text-ink block mt-0.5">Demo Ar-Ge ve Danışmanlık Ltd. Şti.</span>
          </div>
          <div>
            <span className="text-[11px] text-muted block">Vergi Dairesi / VKN</span>
            <span className="font-bold text-ink block mt-0.5 font-mono">Doğanbey V.D. / 2840958172</span>
          </div>
          <div>
            <span className="text-[11px] text-muted block">E-Fatura Mükellefiyet Durumu</span>
            <span className="font-bold text-emerald-700 block mt-0.5 flex items-center gap-1 font-mono">
              ✓ E-Fatura Kayıtlı Mükellef
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-ground text-muted border-b">
                <th className="p-3 font-semibold">GİB Fatura No</th>
                <th className="p-3 font-semibold">Tarih</th>
                <th className="p-3 font-semibold">Hizmet / Açıklama</th>
                <th className="p-3 font-semibold">Matrah & KDV</th>
                <th className="p-3 font-semibold">Toplam Tutar</th>
                <th className="p-3 font-semibold">Durum</th>
                <th className="p-3 font-semibold text-right">E-Fatura İndir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <tr className="hover:bg-ground/50">
                <td className="p-3 font-mono font-bold text-blue-900">GIB202600000001</td>
                <td className="p-3 text-ink-2 font-mono">01.09.2026</td>
                <td className="p-3 text-ink font-medium">Team Plan (Aylık) + M11 Full App</td>
                <td className="p-3 font-mono text-ink-2">₺26,850 + ₺5,370 (%20)</td>
                <td className="p-3 font-mono font-bold text-ink">₺32,220.00</td>
                <td className="p-3">
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full font-mono">
                    GİB ONAYLI
                  </span>
                </td>
                <td className="p-3 text-right space-x-2">
                  <a
                    href="/api/billing/invoices/GIB202600000001/export?format=xml"
                    download
                    className="inline-block text-[11px] bg-surface-hover hover:bg-slate-200 text-ink font-bold px-2.5 py-1 rounded-lg transition"
                    title="UBL-TR 1.2.1 XML Dosyasını İndir"
                  >
                    XML (UBL-TR)
                  </a>
                  <a
                    href="/api/billing/invoices/GIB202600000001/export?format=pdf"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-[11px] bg-blue-600 hover:bg-blue-700 text-white font-bold px-2.5 py-1 rounded-lg transition shadow-2xs"
                  >
                    PDF / Baskı
                  </a>
                </td>
              </tr>
              <tr className="hover:bg-ground/50">
                <td className="p-3 font-mono font-bold text-blue-900">GIB202600000014</td>
                <td className="p-3 text-ink-2 font-mono">01.08.2026</td>
                <td className="p-3 text-ink font-medium">Team Plan (Aylık Abonelik)</td>
                <td className="p-3 font-mono text-ink-2">₺8,950 + ₺1,790 (%20)</td>
                <td className="p-3 font-mono font-bold text-ink">₺10,740.00</td>
                <td className="p-3">
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full font-mono">
                    GİB ONAYLI
                  </span>
                </td>
                <td className="p-3 text-right space-x-2">
                  <a
                    href="/api/billing/invoices/GIB202600000014/export?format=xml"
                    download
                    className="inline-block text-[11px] bg-surface-hover hover:bg-slate-200 text-ink font-bold px-2.5 py-1 rounded-lg transition"
                  >
                    XML (UBL-TR)
                  </a>
                  <a
                    href="/api/billing/invoices/GIB202600000014/export?format=pdf"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-[11px] bg-blue-600 hover:bg-blue-700 text-white font-bold px-2.5 py-1 rounded-lg transition shadow-2xs"
                  >
                    PDF / Baskı
                  </a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

