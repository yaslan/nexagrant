'use client';
import { PRODUCT_NAME } from '@/lib/brand';

import React, { useState, useTransition, useMemo } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { getAllManifests, getManifest } from '@/lib/modules/registry';
import { canEnableEntitled, getDisableCascade } from '@/lib/modules/state-machine';
import { ModuleId, PlanTier } from '@/lib/modules/types';
import type { ModulesPlanView } from './plan-view';
import { toggleModuleState } from './actions';
import { errorMessage } from '@/lib/errors';

interface ModulesClientProps {
  /** `null` when the plan could not be read — nothing is shown as active or offered. */
  plan: ModulesPlanView | null;
  tenantName?: string;
  workspace?: string;
  locale?: string;
}

interface ToastMessage {
  id: number;
  type: 'success' | 'error' | 'info';
  text: string;
}

// Module descriptive Turkish explanations and categories
const MODULE_METADATA: Record<ModuleId, { descriptionTr: string; category: 'core' | 'ai' | 'tools'; icon: string }> = {
  M1: {
    descriptionTr: 'CORDIS veritabanı entegrasyonu, geçmiş AB projeleri, organizasyon profilleri ve ağ merkezilik analitiği.',
    category: 'core',
    icon: '🌐',
  },
  M2: {
    descriptionTr: 'Horizon Europe, Eurostars ve ikili işbirlikleri için şablonlu ve yapay zeka destekli konsept notu oluşturucu.',
    category: 'core',
    icon: '📝',
  },
  M3: {
    descriptionTr: 'Teklif gerekçelendirmeleri için AB politika hedefleri, etki göstergeleri ve istatistiki kanıt deposu.',
    category: 'core',
    icon: '📊',
  },
  M4: {
    descriptionTr: 'Konsorsiyum ortakları ve irtibat kişileri için kurumsal ilişki yönetimi (CRM) ve iletişim geçmişi.',
    category: 'core',
    icon: '👥',
  },
  M5: {
    descriptionTr: 'G0-G4 aşama-kapı teklif üretim döngüsü, görev dağılımı, zaman çizelgesi ve onay mekanizmaları.',
    category: 'core',
    icon: '🚦',
  },
  M6: {
    descriptionTr: 'AB hakem perspektifiyle Mükemmeliyet, Etki ve Uygulama bölümlerini denetleyen derin yapay zeka puanlama simülasyonu.',
    category: 'ai',
    icon: '🔬',
  },
  M7: {
    descriptionTr: 'Üniversite ve araştırma merkezleri için patent/teknoloji portföyünden AB çağrılarına otomatik eşleştirme motoru.',
    category: 'tools',
    icon: '🚀',
  },
  M8: {
    descriptionTr: 'Çağrı gereksinimlerine göre en yüksek kazanma olasılığına sahip ortak ve koordinatörleri öneren akıllı eşleştirici.',
    category: 'ai',
    icon: '🎯',
  },
  M9: {
    descriptionTr: 'Konsorsiyum hazırlık toplantıları için çağrı özeti, partner analizleri ve tartışma gündemi üreten brifing modülü.',
    category: 'tools',
    icon: '📋',
  },
  M10: {
    descriptionTr: 'Toplantı notlarından otomatik aksiyon planları, mutabakat zabıtları (MoM) ve görev takip belgeleri üretir.',
    category: 'tools',
    icon: '📄',
  },
  M11: {
    descriptionTr: 'Part A ve Part B başvuru formlarını resmi AB standartlarına uygun formatta tam taslak olarak üreten üst düzey üretim motoru.',
    category: 'ai',
    icon: '⚡',
  },
};

const PLAN_BADGES: Record<PlanTier, { label: string; bg: string; text: string }> = {
  basic: { label: 'Basic', bg: 'bg-accent/15 text-accent-ink border border-accent/20', text: 'text-accent-ink' },
  pro: { label: 'Pro', bg: 'bg-ok/15 text-ok border border-ok/20', text: 'text-ok' },
  ultra: { label: 'Ultra', bg: 'bg-amber/15 text-amber border border-amber/20', text: 'text-amber' },
};

/**
 * Identity for a toast, so its dismiss timer can tell it apart from a later
 * one. A counter rather than `Date.now()`: the clock is impure during render,
 * and two toasts raised in the same millisecond would have collided.
 */
let toastSequence = 0;
const nextToastId = () => (toastSequence += 1);

export function ModulesClient({
  plan,
  tenantName,
  workspace = 'default',
  locale = 'tr',
}: ModulesClientProps) {
  const manifests = getAllManifests();

  const [activeModules, setActiveModules] = useState<ModuleId[]>(plan?.activeModules ?? []);
  // Switched on in ModuleState but outside the plan (left by a downgrade): the
  // gate refuses them, so the only offer is to switch them off.
  const [outsidePlanOn, setOutsidePlanOn] = useState<ModuleId[]>(plan?.switchedOnOutsidePlan ?? []);
  const entitledModules = plan?.entitledModules ?? [];
  const badgeTier = plan?.badgeTier ?? null;
  // An unread plan offers nothing; an ended pilot is read-only
  // (requireTenantAction refuses the write anyway — this just says so first).
  const readOnly = !plan || plan.pilot?.expired === true;
  const [cascadeWarning, setCascadeWarning] = useState<{ target: ModuleId; cascading: ModuleId[] } | null>(null);
  const [isPending, startTransition] = useTransition();
  const t = useTranslations('settings.modules');

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'core' | 'ai' | 'tools' | 'active'>('all');

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = nextToastId();
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  // Filtered Manifests
  const filteredManifests = useMemo(() => {
    return manifests.filter((mod) => {
      const meta = MODULE_METADATA[mod.id];
      const isActive = activeModules.includes(mod.id);

      // Search matching
      const matchesSearch =
        mod.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        mod.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (meta && meta.descriptionTr.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchesSearch) return false;

      // Category matching
      if (selectedCategory === 'active') return isActive;
      if (selectedCategory === 'core') return meta?.category === 'core';
      if (selectedCategory === 'ai') return meta?.category === 'ai';
      if (selectedCategory === 'tools') return meta?.category === 'tools';

      return true;
    });
  }, [manifests, searchQuery, selectedCategory, activeModules]);

  const activeCount = activeModules.length;
  const totalCount = manifests.length;
  const activePercentage = Math.round((activeCount / totalCount) * 100);

  const handleToggle = (id: ModuleId) => {
    const isActive = activeModules.includes(id);

    if (isActive) {
      // Trying to disable
      const cascade = getDisableCascade(id, activeModules);
      if (cascade.length > 0) {
        setCascadeWarning({ target: id, cascading: cascade });
      } else {
        startTransition(async () => {
          setActiveModules((prev) => prev.filter((m) => m !== id));
          try {
            await toggleModuleState(id, 'OFF');
            showToast(`${id} modülü başarıyla devre dışı bırakıldı.`, 'info');
          } catch (e) {
            showToast(errorMessage(e, 'Modül kapatılırken hata oluştu.'), 'error');
            setActiveModules((prev) => [...prev, id]); // rollback
          }
        });
      }
    } else {
      // Trying to enable
      const check = canEnableEntitled(id, activeModules, entitledModules);
      if (check.allowed) {
        startTransition(async () => {
          setActiveModules((prev) => [...prev, id]);
          try {
            await toggleModuleState(id, 'ON');
            showToast(`${id} modülü başarıyla aktifleştirildi!`, 'success');
          } catch (e) {
            showToast(errorMessage(e, 'Modül etkinleştirilirken hata oluştu.'), 'error');
            setActiveModules((prev) => prev.filter((m) => m !== id)); // rollback
          }
        });
      } else {
        const missing = check.missingDependencies?.length
          ? `Gerekli modüller eksik: ${check.missingDependencies.join(', ')}`
          : check.reason || 'Etkinleştirme kuralı karşılanmadı.';
        showToast(`${id} açılamadı: ${missing}`, 'error');
      }
    }
  };

  const disableOutsidePlan = (id: ModuleId) => {
    startTransition(async () => {
      setOutsidePlanOn((prev) => prev.filter((m) => m !== id));
      try {
        await toggleModuleState(id, 'OFF');
        showToast(`${id} plan dışında açık kalmıştı; kapatıldı.`, 'info');
      } catch (e) {
        showToast(errorMessage(e, 'Modül kapatılırken hata oluştu.'), 'error');
        setOutsidePlanOn((prev) => [...prev, id]); // rollback
      }
    });
  };

  const confirmDisable = () => {
    if (!cascadeWarning) return;
    const toDisable = [cascadeWarning.target, ...cascadeWarning.cascading];

    startTransition(async () => {
      setActiveModules((prev) => prev.filter((m) => !toDisable.includes(m)));
      const target = cascadeWarning.target;
      const count = toDisable.length;
      setCascadeWarning(null);

      try {
        await toggleModuleState(target, 'OFF');
        showToast(`${target} ve bağlı ${count - 1} alt modül kapatıldı.`, 'info');
      } catch (e) {
        showToast(errorMessage(e, 'Modüller kapatılırken hata oluştu.'), 'error');
        // Rollback
        setActiveModules((prev) => Array.from(new Set([...prev, ...toDisable])));
      }
    });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-16">
      {/* Toast Overlay */}
      <div className="fixed top-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto px-4 py-3 rounded-xl shadow-lg border text-sm font-semibold flex items-center gap-2 transition-all transform animate-in slide-in-from-top-2 ${
              toast.type === 'success'
                ? 'bg-ok/15 text-ok border-ok/30'
                : toast.type === 'error'
                ? 'bg-bad/15 text-bad border-bad/30'
                : 'bg-surface text-ink border-border shadow-xl'
            }`}
          >
            <span>{toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : 'ℹ'}</span>
            <span>{toast.text}</span>
          </div>
        ))}
      </div>

      {/* Header & Breadcrumb */}
      <div className="bg-surface border border-border rounded-2xl p-6 md:p-8 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-muted mb-2">
              <Link href={`/${locale}/${workspace}/dashboard`} className="hover:text-ink transition-colors">
                Dashboard
              </Link>
              <span>/</span>
              <span className="text-ink-2">Ayarlar</span>
              <span>/</span>
              <span className="text-accent-ink font-semibold">Modül Yönetimi</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold font-heading text-ink">Modül ve Özellik Yönetimi</h1>
            <p className="text-xs md:text-sm text-muted mt-1 max-w-2xl">
              Çalışma alanınızda ({tenantName}) aktif olan AB Ar-Ge ve fonlama modüllerini yönetin, bağımlılıkları kontrol edin ve yeni yetenekleri devreye alın.
            </p>
          </div>

          <div className="flex items-center gap-4 bg-ground border border-border p-4 rounded-xl">
            <div>
              <div className="text-xs text-muted font-medium">Mevcut Abonelik Paketi</div>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span
                  className={`text-xs font-bold tracking-wide whitespace-nowrap px-2.5 py-1 rounded-md ${
                    (badgeTier && PLAN_BADGES[badgeTier]?.bg) || 'bg-surface text-ink border border-border'
                  }`}
                >
                  {plan ? plan.planName : 'Okunamadı'}
                </span>
                {plan?.pilot && (
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider whitespace-nowrap px-2 py-0.5 rounded-full border ${
                      plan.pilot.expired ? 'bg-bad/15 text-bad border-bad/30' : 'bg-amber/15 text-amber border-amber/20'
                    }`}
                  >
                    {plan.pilot.expired ? 'Pilot bitti' : 'Pilot'}
                  </span>
                )}
              </div>
              {plan?.pilot && (
                <div className="text-[11px] text-muted mt-1">
                  Son gün: {plan.pilot.lastDay} · yenilenmez
                </div>
              )}
              {plan && !plan.pilot && plan.planId === 'free' && (
                <div className="text-[11px] text-muted mt-1">{t('noSubscription')}</div>
              )}
            </div>
            <Link
              href={`/${locale}/${workspace}/settings/billing`}
              className="text-xs font-bold text-accent hover:underline bg-surface border border-border px-3 py-2 rounded-lg shadow-2xs hover:bg-surface-hover transition"
            >
              Planı Değiştir →
            </Link>
          </div>
        </div>

        {readOnly && (
          <div role="status" className="mt-6 rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-xs text-ink">
            {plan
              ? `Ücretsiz pilot ${plan.pilot?.lastDay} tarihinde sona erdi. Çalışma alanı salt okunur; modüller değiştirilemez.`
              : 'Plan ve modül durumu şu anda okunamadı. Hiçbir modül açık gösterilmiyor; sayfayı yenileyip tekrar deneyin.'}
          </div>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-border">
          <div className="p-3 bg-ground rounded-xl border border-border">
            <div className="text-xs text-muted font-medium">Aktif Modüller</div>
            <div className="text-2xl font-bold text-ink mt-0.5">
              {activeCount} <span className="text-sm font-normal text-muted">/ {totalCount}</span>
            </div>
          </div>
          <div className="p-3 bg-ground rounded-xl border border-border">
            <div className="text-xs text-muted font-medium">Kapsam Oranı</div>
            <div className="text-2xl font-bold text-ok mt-0.5">%{activePercentage}</div>
          </div>
          <div className="p-3 bg-ground rounded-xl border border-border">
            <div className="text-xs text-muted font-medium">Çekirdek Pipeline</div>
            <div className="text-2xl font-bold text-ink mt-0.5">M1 - M5</div>
          </div>
          <div className="p-3 bg-ground rounded-xl border border-border">
            <div className="text-xs text-muted font-medium">Gelişmiş AI & Eklentiler</div>
            <div className="text-2xl font-bold text-accent mt-0.5">M6, M8, M11</div>
          </div>
        </div>
      </div>

      {/* Control Bar: Search & Category Tabs */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        {/* Tabs */}
        <div className="flex items-center gap-1.5 bg-ground p-1 rounded-xl border border-border text-xs font-semibold overflow-x-auto">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
              selectedCategory === 'all' ? 'bg-surface text-ink shadow-xs border border-border/80' : 'text-muted hover:text-ink'
            }`}
          >
            Tüm Modüller ({totalCount})
          </button>
          <button
            onClick={() => setSelectedCategory('core')}
            className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
              selectedCategory === 'core' ? 'bg-surface text-ink shadow-xs border border-border/80' : 'text-muted hover:text-ink'
            }`}
          >
            Çekirdek İş Akışı (M1-M5)
          </button>
          <button
            onClick={() => setSelectedCategory('ai')}
            className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
              selectedCategory === 'ai' ? 'bg-surface text-ink shadow-xs border border-border/80' : 'text-muted hover:text-ink'
            }`}
          >
            Yapay Zeka & Puanlama
          </button>
          <button
            onClick={() => setSelectedCategory('tools')}
            className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
              selectedCategory === 'tools' ? 'bg-surface text-ink shadow-xs border border-border/80' : 'text-muted hover:text-ink'
            }`}
          >
            Araçlar & TTO
          </button>
          <button
            onClick={() => setSelectedCategory('active')}
            className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
              selectedCategory === 'active' ? 'bg-surface text-ink shadow-xs border border-border/80' : 'text-muted hover:text-ink'
            }`}
          >
            Sadece Açık Olanlar ({activeCount})
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <input
            type="text"
            placeholder="Modül ara (örn: M6, Ortak, AI)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs bg-surface border border-border rounded-xl px-3 py-2 pl-8 text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <span className="absolute left-2.5 top-2.5 text-muted text-xs">🔍</span>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2 text-muted hover:text-ink text-xs font-bold"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Module Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {filteredManifests.map((mod) => {
          const isActive = activeModules.includes(mod.id);
          const meta = MODULE_METADATA[mod.id];
          const check = canEnableEntitled(mod.id, activeModules, entitledModules);
          const isPlanLocked = plan !== null && !entitledModules.includes(mod.id);
          const isOutsidePlanOn = isPlanLocked && outsidePlanOn.includes(mod.id);

          return (
            <div
              key={mod.id}
              className={`bg-surface border rounded-2xl p-6 shadow-xs flex flex-col justify-between transition-all hover:shadow-md ${
                isActive ? 'border-accent/40 ring-1 ring-accent/20' : 'border-border'
              } ${isPending ? 'opacity-70' : ''}`}
            >
              <div className="space-y-4">
                {/* Card Top: ID Badge, Status Tag, Toggle */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl p-2 bg-ground border border-border rounded-xl">{meta?.icon || '📦'}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs bg-ground text-ink-2 px-2 py-0.5 rounded border border-border">
                          {mod.id}
                        </span>
                        <h2 className="text-base font-bold text-ink">{mod.name}</h2>
                      </div>
                      <div className="text-[11px] text-muted font-mono mt-0.5">
                        Key: {mod.key} {mod.version ? `• v${mod.version}` : ''}
                      </div>
                    </div>
                  </div>

                  {/* Status & Switch */}
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        isActive
                          ? 'bg-ok/15 text-ok border border-ok/20'
                          : isPlanLocked
                          ? 'bg-amber/15 text-amber border border-amber/20'
                          : 'bg-ground text-muted border border-border'
                      }`}
                    >
                      {isActive ? '● Aktif' : isPlanLocked ? '🔒 Kilitli' : '○ Pasif'}
                    </span>
                  </div>
                </div>

                {/* Description */}
                <p className="text-xs text-ink-2 leading-relaxed">
                  {meta?.descriptionTr || 'Modül fonksiyonu ve otomasyon araçları.'}
                </p>

                {/* Dependencies & Plan Requirements */}
                <div className="space-y-2 pt-2 border-t border-border text-xs">
                  {/* Requires */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-muted font-medium">Gereksinim:</span>
                    {mod.requires.length > 0 ? (
                      mod.requires.map((reqId) => {
                        const isReqActive = activeModules.includes(reqId);
                        return (
                          <span
                            key={reqId}
                            className={`font-mono text-[11px] px-2 py-0.5 rounded border font-semibold flex items-center gap-1 ${
                              isReqActive
                                ? 'bg-ok/15 border-ok/30 text-ok'
                                : 'bg-bad/15 border-bad/30 text-bad'
                            }`}
                            title={isReqActive ? `${reqId} Aktif` : `${reqId} Eksik! Önce bu modül açılmalı.`}
                          >
                            <span>{isReqActive ? '✓' : '✕'}</span>
                            <span>{reqId}</span>
                          </span>
                        );
                      })
                    ) : (
                      <span className="text-muted text-[11px]">Bağımsız (Gereksinim Yok)</span>
                    )}
                  </div>

                  {/* Recommends */}
                  {mod.recommends.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-muted font-medium">Önerilen:</span>
                      {mod.recommends.map((recId) => (
                        <span
                          key={recId}
                          className="font-mono text-[11px] bg-ground border border-border text-ink-2 px-1.5 py-0.5 rounded"
                        >
                          {recId}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Plans & Addons */}
                  <div className="flex items-center gap-2 flex-wrap pt-1">
                    <span className="text-muted font-medium">Planlar:</span>
                    <div className="flex items-center gap-1">
                      {mod.planTiers.map((tier) => (
                        <span
                          key={tier}
                          className={`text-[10px] uppercase font-mono px-1.5 py-0.5 rounded border border-border ${
                            badgeTier === tier
                              ? 'bg-accent/15 text-accent-ink font-bold border-accent/30'
                              : 'bg-ground text-muted'
                          }`}
                        >
                          {tier}
                        </span>
                      ))}
                    </div>
                    {mod.addOnSku && (
                      <span className="text-[10px] bg-purple-500/15 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded font-mono font-semibold">
                        SKU: {mod.addOnSku}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Card Footer: Action Buttons */}
              <div className="mt-5 pt-4 border-t border-border flex items-center justify-between gap-3">
                <div className="text-xs">
                  {!isActive && !check.allowed && (
                    <span className="text-bad font-medium">
                      {isOutsidePlanOn
                        ? 'Plan dışında açık kalmış — kullanılamaz'
                        : isPlanLocked
                        ? 'Plan yükseltmesi gerektirir'
                        : `Eksik bağımlılık: ${check.missingDependencies?.join(', ')}`}
                    </span>
                  )}
                  {isActive && <span className="text-ok font-medium">Kullanıma hazır</span>}
                </div>

                <div className="flex items-center gap-2">
                  {isOutsidePlanOn && (
                    <button
                      onClick={() => disableOutsidePlan(mod.id)}
                      disabled={readOnly || isPending}
                      className={`text-xs font-bold px-4 py-2 rounded-lg transition-all shadow-2xs ${
                        readOnly
                          ? 'bg-ground text-muted border border-border cursor-not-allowed'
                          : 'bg-bad/15 text-bad hover:bg-bad/25 border border-bad/30'
                      }`}
                    >
                      Kapat
                    </button>
                  )}
                  {isPlanLocked && !isActive ? (
                    <Link
                      href={`/${locale}/${workspace}/settings/billing`}
                      className="text-xs font-bold bg-amber hover:opacity-90 text-white px-3 py-1.5 rounded-lg transition shadow-2xs"
                    >
                      Planı Yükselt
                    </Link>
                  ) : (
                    <button
                      onClick={() => handleToggle(mod.id)}
                      disabled={readOnly || (!isActive && !check.allowed)}
                      className={`text-xs font-bold px-4 py-2 rounded-lg transition-all shadow-2xs flex items-center gap-1.5 ${
                        readOnly
                          ? 'bg-ground text-muted border border-border cursor-not-allowed'
                          : isActive
                          ? 'bg-bad/15 text-bad hover:bg-bad/25 border border-bad/30'
                          : check.allowed
                          ? 'bg-accent hover:opacity-90 text-white'
                          : 'bg-ground text-muted border border-border cursor-not-allowed'
                      }`}
                    >
                      {isActive ? (
                        <>
                          <span>Kapat</span>
                        </>
                      ) : (
                        <>
                          <span>Etkinleştir</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredManifests.length === 0 && (
        <div className="bg-surface border border-border rounded-2xl p-12 text-center text-muted">
          <div className="text-3xl mb-2">🔍</div>
          <h3 className="text-base font-bold text-ink">Aramanızla eşleşen modül bulunamadı</h3>
          <p className="text-xs text-muted mt-1">Filtreleri veya arama kriterinizi temizlemeyi deneyin.</p>
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('all');
            }}
            className="mt-4 text-xs font-semibold text-accent hover:underline"
          >
            Filtreleri Sıfırla
          </button>
        </div>
      )}

      {/* Cascade Disable Confirmation Modal */}
      {cascadeWarning && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-surface rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 border border-border">
            <div className="flex items-center gap-3 text-bad">
              <div className="w-10 h-10 rounded-full bg-bad/15 flex items-center justify-center text-xl font-bold">
                ⚠️
              </div>
              <div>
                <h2 className="text-lg font-bold text-ink font-heading">
                  Bağlantılı Modül Kapatma Uyarısı
                </h2>
                <div className="text-xs text-muted">Bu modüle bağlı çalışan diğer modüller etkilenecektir.</div>
              </div>
            </div>

            <p className="text-xs text-ink-2 leading-relaxed">
              <strong className="text-ink">
                {getManifest(cascadeWarning.target)?.name} ({cascadeWarning.target})
              </strong>{' '}
              modülünü kapattığınızda, bu modüle bağımlı çalışan aşağıdaki{' '}
              <strong>{cascadeWarning.cascading.length}</strong> modül de otomatik olarak <strong>devre dışı</strong>{' '}
              bırakılacaktır:
            </p>

            <div className="bg-amber/10 border border-amber/20 rounded-xl p-3 space-y-1.5 max-h-48 overflow-y-auto">
              {cascadeWarning.cascading.map((id) => (
                <div key={id} className="text-xs font-semibold text-amber flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber shrink-0"></span>
                  <span className="font-mono bg-surface px-1.5 py-0.5 rounded border border-border text-[10px]">
                    {id}
                  </span>
                  <span>{getManifest(id)?.name}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setCascadeWarning(null)}
                className="px-4 py-2 text-xs font-semibold border border-border rounded-xl hover:bg-surface-hover text-ink-2 transition"
              >
                Vazgeç
              </button>
              <button
                onClick={confirmDisable}
                className="px-4 py-2 text-xs font-bold bg-bad text-white rounded-xl shadow-xs hover:opacity-90 transition"
              >
                Tümünü Kapatmayı Onayla
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Informative Footer Box */}
      <div className="bg-surface border border-border rounded-2xl p-6 text-xs text-ink-2 space-y-3">
        <h4 className="font-bold text-ink text-sm flex items-center gap-2">
          <span>💡</span>
          <span>Modül Mimarisi ve Bağımlılık Hiyerarşisi</span>
        </h4>
        <p className="leading-relaxed">
          {PRODUCT_NAME} SaaS modülleri birbirleriyle entegre çalışır. Örneğin <strong>M4 (Focal Point CRM)</strong> modülü{' '}
          <strong>M1 (Partner Intelligence)</strong> veritabanını kullanır; <strong>M11 (Full Application Production)</strong>{' '}
          modülü ise Konsept Notu (M2), Kanıt Paketi (M3), Teklif İş Akışı (M5) ve Konsorsiyum Eşleştirme (M8)
          modüllerinin aktif olmasını gerektirir.
        </p>
      </div>
    </div>
  );
}
