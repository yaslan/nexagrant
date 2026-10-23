'use client';
import { PRODUCT_NAME } from '@/lib/brand';

import React, { useState, useTransition, useMemo } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { getAllManifests, getManifest } from '@/lib/modules/registry';
import {
  canEnableEntitled,
  getDisableCascade,
  moduleStatus,
  requirementChain,
  type ModuleCardStatus,
} from '@/lib/modules/state-machine';
import { MODULE_CATEGORIES, categorySummary, pipelineCoverage } from '@/lib/modules/catalog';
import { displayPlansForModule, grantsFor } from '@/lib/billing/catalog';
import type { ModuleCategory, ModuleId, PlanTier } from '@/lib/modules/types';
import type { ModulesPlanView } from './plan-view';
import { toggleModuleState } from './actions';
import { errorMessage } from '@/lib/errors';
import { useActionErrorText } from '@/lib/hooks/use-action-error-text';

interface ModulesClientProps {
  /** `null` when the plan could not be read — nothing is shown as active or offered. */
  plan: ModulesPlanView | null;
  /** Module id → English name, shown under the Turkish name on a Turkish page. */
  englishNames?: Partial<Record<ModuleId, string>>;
  tenantName?: string;
  workspace?: string;
  locale?: string;
}

interface ToastMessage {
  id: number;
  type: 'success' | 'error' | 'info';
  text: string;
}

const PLAN_BADGES: Record<PlanTier, string> = {
  basic: 'bg-accent/15 text-accent-ink border border-accent/20',
  pro: 'bg-ok/15 text-ok border border-ok/20',
  ultra: 'bg-amber/15 text-amber border border-amber/20',
};

/** Badge colour per card status — one distinct colour each. */
const STATUS_STYLES: Record<ModuleCardStatus | 'UNKNOWN', { badge: string; icon: string }> = {
  ACTIVE: { badge: 'bg-ok/15 text-ok border border-ok/30', icon: '●' },
  AVAILABLE: { badge: 'bg-accent/15 text-accent-ink border border-accent/30', icon: '○' },
  LOCKED: { badge: 'bg-ground text-muted border border-border', icon: '🔒' },
  ORPHANED: { badge: 'bg-bad/15 text-bad border border-bad/30', icon: '⚠' },
  SOON: { badge: 'bg-ground text-muted border border-border', icon: '⏳' },
  UNKNOWN: { badge: 'bg-ground text-muted border border-border', icon: '?' },
};

const MODULE_BADGE_STYLES: Record<string, string> = {
  ga: 'bg-ok/10 text-ok border-ok/20',
  beta: 'bg-amber/10 text-amber border-amber/20',
  soon: 'bg-ground text-muted border-border',
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
  englishNames = {},
  tenantName,
  workspace = 'default',
  locale = 'tr',
}: ModulesClientProps) {
  const manifests = getAllManifests();

  const [activeModules, setActiveModules] = useState<ModuleId[]>(plan?.activeModules ?? []);
  // Switched on in ModuleState but outside the plan (left by a downgrade): the
  // gate refuses them, so the only offers are to upgrade or switch them off.
  const [outsidePlanOn, setOutsidePlanOn] = useState<ModuleId[]>(plan?.switchedOnOutsidePlan ?? []);
  const entitledModules = plan?.entitledModules ?? [];
  const badgeTier = plan?.badgeTier ?? null;
  // An unread plan offers nothing; an ended pilot is read-only
  // (requireTenantAction refuses the write anyway — this just says so first).
  const readOnly = !plan || plan.pilot?.expired === true;
  const [cascadeWarning, setCascadeWarning] = useState<{ target: ModuleId; cascading: ModuleId[] } | null>(null);
  const [isPending, startTransition] = useTransition();
  const errorText = useActionErrorText();
  const t = useTranslations('settings.modules');
  const tModules = useTranslations('modules');

  const moduleName = (id: ModuleId) => {
    const key = getManifest(id)?.key;
    return key ? tModules(`${key}.name`) : id;
  };

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | ModuleCategory | 'active'>('all');

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = nextToastId();
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const statusView = { entitledModules, activeModules, switchedOnOutsidePlan: outsidePlanOn };
  const summary = categorySummary(activeModules);
  const coverage = pipelineCoverage(activeModules);

  // Filtered Manifests
  const filteredManifests = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return manifests.filter((mod) => {
      const matchesSearch = [mod.id, mod.name, tModules(`${mod.key}.name`), tModules(`${mod.key}.tagline`)].some(
        (text) => text.toLowerCase().includes(query)
      );
      if (!matchesSearch) return false;

      if (selectedCategory === 'active') return activeModules.includes(mod.id);
      if (selectedCategory === 'all') return true;
      return mod.category === selectedCategory;
    });
  }, [manifests, searchQuery, selectedCategory, activeModules, tModules]);

  const activeCount = activeModules.length;
  const totalCount = manifests.length;

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
            showToast(t('toastDisabled', { id }), 'info');
          } catch (e) {
            showToast(errorText(e, () => errorMessage(e, t('toastDisableFailed'))), 'error');
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
            showToast(t('toastEnabled', { id }), 'success');
          } catch (e) {
            showToast(errorText(e, () => errorMessage(e, t('toastEnableFailed'))), 'error');
            setActiveModules((prev) => prev.filter((m) => m !== id)); // rollback
          }
        });
      } else {
        showToast(
          check.missingDependencies?.length
            ? t('toastEnableBlockedDeps', { id, ids: check.missingDependencies.join(', ') })
            : check.reason || t('toastEnableBlocked', { id }),
          'error'
        );
      }
    }
  };

  const disableOutsidePlan = (id: ModuleId) => {
    startTransition(async () => {
      setOutsidePlanOn((prev) => prev.filter((m) => m !== id));
      try {
        await toggleModuleState(id, 'OFF');
        showToast(t('toastOrphanDisabled', { id }), 'info');
      } catch (e) {
        showToast(errorText(e, () => errorMessage(e, t('toastDisableFailed'))), 'error');
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
        showToast(t('toastCascadeDisabled', { id: target, count: count - 1 }), 'info');
      } catch (e) {
        showToast(errorText(e, () => errorMessage(e, t('toastCascadeFailed'))), 'error');
        // Rollback
        setActiveModules((prev) => Array.from(new Set([...prev, ...toDisable])));
      }
    });
  };

  const tabClass = (selected: boolean) =>
    `px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
      selected ? 'bg-surface text-ink shadow-xs border border-border/80' : 'text-muted hover:text-ink'
    }`;

  const disableButtonClass = (disabled: boolean) =>
    `text-xs font-bold px-4 py-2 rounded-lg transition-all shadow-2xs ${
      disabled
        ? 'bg-ground text-muted border border-border cursor-not-allowed'
        : 'bg-bad/15 text-bad hover:bg-bad/25 border border-bad/30'
    }`;

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-16">
      {/* Toast Overlay */}
      <div className="fixed top-5 right-5 z-50 flex flex-col gap-2 pointer-events-none" aria-live="polite">
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
            <span aria-hidden="true">{toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : 'ℹ'}</span>
            <span>{toast.text}</span>
          </div>
        ))}
      </div>

      {/* Header & Breadcrumb */}
      <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 md:p-8 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-medium text-muted mb-2">
              <Link href={`/${locale}/${workspace}/dashboard`} className="hover:text-ink transition-colors">
                {t('breadcrumbDashboard')}
              </Link>
              <span aria-hidden="true">/</span>
              <span className="text-ink-2">{t('breadcrumbSettings')}</span>
              <span aria-hidden="true">/</span>
              <span className="text-accent-ink font-semibold">{t('breadcrumbCurrent')}</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold font-heading text-ink">{t('title')}</h1>
            <p className="text-xs md:text-sm text-muted mt-1 max-w-2xl">{t('subtitle', { tenant: tenantName ?? '' })}</p>
          </div>

          <div className="flex flex-wrap items-center gap-4 bg-ground border border-border p-4 rounded-xl">
            <div>
              <div className="text-xs text-muted font-medium">{t('currentPlan')}</div>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span
                  className={`text-xs font-bold tracking-wide whitespace-nowrap px-2.5 py-1 rounded-md ${
                    (badgeTier && PLAN_BADGES[badgeTier]) || 'bg-surface text-ink border border-border'
                  }`}
                >
                  {plan ? plan.planName : t('planUnread')}
                </span>
                {plan?.pilot && (
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider whitespace-nowrap px-2 py-0.5 rounded-full border ${
                      plan.pilot.expired ? 'bg-bad/15 text-bad border-bad/30' : 'bg-amber/15 text-amber border-amber/20'
                    }`}
                  >
                    {plan.pilot.expired ? t('pilotEndedBadge') : t('pilotBadge')}
                  </span>
                )}
              </div>
              {plan?.pilot && (
                <div className="text-[11px] text-muted mt-1">{t('pilotLastDay', { date: plan.pilot.lastDay })}</div>
              )}
              {plan && !plan.pilot && plan.planId === 'free' && (
                <div className="text-[11px] text-muted mt-1">{t('noSubscription')}</div>
              )}
            </div>
            <Link
              href={`/${locale}/${workspace}/settings/billing`}
              className="text-xs font-bold text-accent hover:underline bg-surface border border-border px-3 py-2 rounded-lg shadow-2xs hover:bg-surface-hover transition"
            >
              {t('changePlan')}
            </Link>
          </div>
        </div>

        {readOnly && (
          <div role="status" className="mt-6 rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-xs text-ink">
            {plan ? t('pilotExpiredNotice', { date: plan.pilot?.lastDay ?? '' }) : t('planUnreadNotice')}
          </div>
        )}

        {/* Stats Row: active total, pipeline coverage, one card per category */}
        <div
          className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 mt-6 pt-6 border-t border-border"
          data-testid="modules-summary"
        >
          <div className="p-3 bg-ground rounded-xl border border-border">
            <div className="text-xs text-muted font-medium">{t('activeModules')}</div>
            <div className="text-2xl font-bold text-ink mt-0.5">
              {activeCount} <span className="text-sm font-normal text-muted">/ {totalCount}</span>
            </div>
          </div>
          <div className="p-3 bg-ground rounded-xl border border-border" data-testid="pipeline-coverage">
            <div className="text-xs text-muted font-medium">{t('pipelineCoverage')}</div>
            <div className="text-2xl font-bold text-ok mt-0.5">
              {t('pipelineCoverageValue', { covered: coverage.covered.length, total: coverage.total })}
            </div>
            <div className="text-[11px] text-muted mt-0.5">
              {coverage.covered.length > 0
                ? t('pipelineCoverageStages', { stages: coverage.covered.join(', ') })
                : t('pipelineCoverageNone')}
            </div>
          </div>
          {MODULE_CATEGORIES.map((category) => (
            <div
              key={category}
              className="p-3 bg-ground rounded-xl border border-border"
              data-testid={`category-summary-${category}`}
            >
              <div className="text-xs text-muted font-medium">{t(`category.${category}`)}</div>
              <div className="text-2xl font-bold text-ink mt-0.5">
                {summary[category].active}{' '}
                <span className="text-sm font-normal text-muted">/ {summary[category].total}</span>
              </div>
              <div className="sr-only">
                {t('categoryCount', { active: summary[category].active, total: summary[category].total })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Control Bar: Search & Category Tabs */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        {/* Tabs */}
        <div
          role="group"
          aria-label={t('categoryTabsLabel')}
          className="flex items-center gap-1.5 bg-ground p-1 rounded-xl border border-border text-xs font-semibold overflow-x-auto"
        >
          <button
            type="button"
            aria-pressed={selectedCategory === 'all'}
            onClick={() => setSelectedCategory('all')}
            className={tabClass(selectedCategory === 'all')}
          >
            {t('tabAll', { count: totalCount })}
          </button>
          {MODULE_CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              aria-pressed={selectedCategory === category}
              onClick={() => setSelectedCategory(category)}
              className={tabClass(selectedCategory === category)}
            >
              {t('tabCategory', { label: t(`category.${category}`), count: summary[category].total })}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={selectedCategory === 'active'}
            onClick={() => setSelectedCategory('active')}
            className={tabClass(selectedCategory === 'active')}
          >
            {t('tabActive', { count: activeCount })}
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72 shrink-0">
          <input
            type="search"
            aria-label={t('searchLabel')}
            placeholder={t('searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs bg-surface border border-border rounded-xl px-3 py-2 pl-8 text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <span className="absolute left-2.5 top-2.5 text-muted text-xs" aria-hidden="true">
            🔍
          </span>
          {searchQuery && (
            <button
              type="button"
              aria-label={t('clearSearch')}
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
          const status = plan ? moduleStatus(mod.id, statusView) : null;
          const statusStyle = STATUS_STYLES[status ?? 'UNKNOWN'];
          const check = canEnableEntitled(mod.id, activeModules, entitledModules);
          const chain = requirementChain(mod.id);
          const plans = displayPlansForModule(mod.id);
          const currentPlanId = badgeTier ?? plan?.planId ?? null;
          const englishName = englishNames[mod.id];
          const quotaParts = mod.quota
            ? [
                mod.quota.aiCallsMonthly !== null ? t('quotaAiCalls', { count: mod.quota.aiCallsMonthly }) : null,
                mod.quota.recordLimit !== null ? t('quotaRecords', { count: mod.quota.recordLimit }) : null,
              ].filter((part): part is string => part !== null)
            : [];
          // A "Yakında" module is not sold yet, so a locked card offers no upgrade (FO-40).
          const upgradeOffer =
            mod.statusBadge !== 'soon' && (status === 'LOCKED' || status === 'ORPHANED') ? (
              plan?.pilot ? (
                // A pilot cannot change plan (billing says so), so no upgrade offer here.
                <span className="text-xs font-medium text-muted text-right">{t('pilotLocked')}</span>
              ) : (
                <Link
                  href={`/${locale}/${workspace}/settings/billing`}
                  className="text-xs font-bold bg-amber hover:opacity-90 text-white px-3 py-2 rounded-lg transition shadow-2xs"
                >
                  {t('upgradeCta')}
                </Link>
              )
            ) : null;

          return (
            <div
              key={mod.id}
              data-testid={`module-card-${mod.id}`}
              data-status={status ?? 'UNKNOWN'}
              className={`min-w-0 bg-surface border rounded-2xl p-4 sm:p-6 shadow-xs flex flex-col justify-between transition-all hover:shadow-md ${
                status === 'ACTIVE'
                  ? 'border-accent/40 ring-1 ring-accent/20'
                  : status === 'ORPHANED'
                  ? 'border-bad/40'
                  : 'border-border'
              } ${isPending ? 'opacity-70' : ''}`}
            >
              <div className="space-y-4">
                {/* Card Top: id, names, status */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 basis-48">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-xs bg-ground text-ink-2 px-2 py-0.5 rounded border border-border">
                        {mod.id}
                      </span>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                          MODULE_BADGE_STYLES[mod.statusBadge] ?? MODULE_BADGE_STYLES.soon
                        }`}
                      >
                        {t(`statusBadge.${mod.statusBadge}`)}
                      </span>
                    </div>
                    <h2 className="text-base font-bold text-ink mt-1.5">{tModules(`${mod.key}.name`)}</h2>
                    {locale !== 'en' && englishName && (
                      <div className="text-[11px] text-muted" lang="en">
                        {englishName}
                      </div>
                    )}
                    <div className="text-[11px] text-muted font-mono mt-0.5">
                      {t('keyLabel', { key: mod.key })}
                      {mod.version ? ` • ${t('versionLabel', { version: mod.version })}` : ''}
                    </div>
                  </div>

                  <span
                    data-testid="module-status"
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full text-right ${statusStyle.badge}`}
                  >
                    <span aria-hidden="true">{statusStyle.icon} </span>
                    {t(`status.${status ?? 'UNKNOWN'}`)}
                  </span>
                </div>

                {/* Tagline */}
                <p className="text-xs text-ink-2 leading-relaxed">{tModules(`${mod.key}.tagline`)}</p>

                {/* Requirement chain, recommendations, plans */}
                <div className="space-y-2 pt-2 border-t border-border text-xs">
                  <div className="flex items-center gap-2 flex-wrap" data-testid="requirement-chain">
                    <span className="text-muted font-medium">{t('chainLabel')}</span>
                    {chain.length > 0 ? (
                      chain.map((reqId, index) => {
                        const isReqActive = activeModules.includes(reqId);
                        return (
                          <React.Fragment key={reqId}>
                            {index > 0 && (
                              <span className="text-muted" aria-hidden="true">
                                →
                              </span>
                            )}
                            <span
                              className={`font-mono text-[11px] px-2 py-0.5 rounded border font-semibold flex items-center gap-1 ${
                                isReqActive ? 'bg-ok/15 border-ok/30 text-ok' : 'bg-bad/15 border-bad/30 text-bad'
                              }`}
                              title={isReqActive ? t('chainActive', { id: reqId }) : t('chainMissing', { id: reqId })}
                            >
                              <span aria-hidden="true">{isReqActive ? '✓' : '✕'}</span>
                              <span>{reqId}</span>
                              <span className="sr-only">
                                {isReqActive ? t('chainActive', { id: reqId }) : t('chainMissing', { id: reqId })}
                              </span>
                            </span>
                          </React.Fragment>
                        );
                      })
                    ) : (
                      <span className="text-muted text-[11px]">{t('chainNone')}</span>
                    )}
                  </div>

                  {mod.recommends.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-muted font-medium">{t('recommendsLabel')}</span>
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

                  <div className="flex items-center gap-2 flex-wrap pt-1" data-testid="module-plans">
                    <span className="text-muted font-medium">{t('plansLabel')}</span>
                    {plans.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-1">
                        {plans.map((planId) => (
                          <span
                            key={planId}
                            className={`text-[10px] uppercase font-mono px-1.5 py-0.5 rounded border border-border ${
                              currentPlanId === planId
                                ? 'bg-accent/15 text-accent-ink font-bold border-accent/30'
                                : 'bg-ground text-muted'
                            }`}
                          >
                            {grantsFor(planId)?.name ?? planId}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted text-[11px]">{t('plansNone')}</span>
                    )}
                    {mod.addOnSku && (
                      <span className="text-[10px] bg-purple-500/15 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded font-mono font-semibold break-all">
                        {t('addOnSku', { sku: mod.addOnSku })}
                      </span>
                    )}
                  </div>

                  {quotaParts.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap" data-testid="module-quota">
                      <span className="text-muted font-medium">{t('quotaLabel')}</span>
                      <span className="text-ink-2">{quotaParts.join(' · ')}</span>
                    </div>
                  )}

                  {mod.docsUrl && (
                    <a
                      href={mod.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block text-accent font-semibold hover:underline"
                    >
                      {t('docsLink')}
                    </a>
                  )}
                </div>
              </div>

              {/* Card Footer: Action Buttons */}
              <div className="mt-5 pt-4 border-t border-border flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs min-w-0">
                  {status === 'AVAILABLE' && !check.allowed && (
                    <span className="text-bad font-medium">
                      {t('missingDependencies', { ids: check.missingDependencies?.join(', ') ?? '' })}
                    </span>
                  )}
                  {status === 'SOON' && (
                    <span className="text-muted" data-testid="module-soon-notice">
                      {t('soonNotice')}
                    </span>
                  )}
                </div>

                {/* A "Yakında" card has no switch, only its placeholder page (FO-40). */}
                {status === 'SOON' && mod.routes[0] && (
                  <Link
                    href={`/${locale}/${workspace}/${mod.routes[0].path}`}
                    className="text-xs font-semibold text-accent hover:underline"
                  >
                    {t('soonLink')}
                  </Link>
                )}

                {plan && (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {status === 'ORPHANED' && (
                      <button
                        type="button"
                        onClick={() => disableOutsidePlan(mod.id)}
                        disabled={readOnly || isPending}
                        className={disableButtonClass(readOnly)}
                      >
                        {t('disable')}
                      </button>
                    )}
                    {upgradeOffer}
                    {(status === 'ACTIVE' || status === 'AVAILABLE') && (
                      <button
                        type="button"
                        onClick={() => handleToggle(mod.id)}
                        disabled={readOnly || (!isActive && !check.allowed)}
                        className={
                          isActive
                            ? disableButtonClass(readOnly)
                            : `text-xs font-bold px-4 py-2 rounded-lg transition-all shadow-2xs ${
                                !readOnly && check.allowed
                                  ? 'bg-accent hover:opacity-90 text-white'
                                  : 'bg-ground text-muted border border-border cursor-not-allowed'
                              }`
                        }
                      >
                        {isActive ? t('disable') : t('enable')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filteredManifests.length === 0 && (
        <div className="bg-surface border border-border rounded-2xl p-12 text-center text-muted">
          <div className="text-3xl mb-2" aria-hidden="true">
            🔍
          </div>
          <h3 className="text-base font-bold text-ink">{t('emptyTitle')}</h3>
          <p className="text-xs text-muted mt-1">{t('emptyBody')}</p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('all');
            }}
            className="mt-4 text-xs font-semibold text-accent hover:underline"
          >
            {t('emptyReset')}
          </button>
        </div>
      )}

      {/* Cascade Disable Confirmation Modal */}
      {cascadeWarning && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cascade-title"
            className="bg-surface rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 border border-border"
          >
            <div className="flex items-center gap-3 text-bad">
              <div
                className="w-10 h-10 shrink-0 rounded-full bg-bad/15 flex items-center justify-center text-xl font-bold"
                aria-hidden="true"
              >
                ⚠️
              </div>
              <div>
                <h2 id="cascade-title" className="text-lg font-bold text-ink font-heading">
                  {t('cascadeTitle')}
                </h2>
                <div className="text-xs text-muted">{t('cascadeSubtitle')}</div>
              </div>
            </div>

            <p className="text-xs text-ink-2 leading-relaxed">
              {t.rich('cascadeBody', {
                name: moduleName(cascadeWarning.target),
                id: cascadeWarning.target,
                count: cascadeWarning.cascading.length,
                strong: (chunks) => <strong className="text-ink">{chunks}</strong>,
              })}
            </p>

            <div className="bg-amber/10 border border-amber/20 rounded-xl p-3 space-y-1.5 max-h-48 overflow-y-auto">
              {cascadeWarning.cascading.map((id) => (
                <div key={id} className="text-xs font-semibold text-amber flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber shrink-0"></span>
                  <span className="font-mono bg-surface px-1.5 py-0.5 rounded border border-border text-[10px]">
                    {id}
                  </span>
                  <span>{moduleName(id)}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCascadeWarning(null)}
                className="px-4 py-2 text-xs font-semibold border border-border rounded-xl hover:bg-surface-hover text-ink-2 transition"
              >
                {t('cascadeCancel')}
              </button>
              <button
                type="button"
                onClick={confirmDisable}
                className="px-4 py-2 text-xs font-bold bg-bad text-white rounded-xl shadow-xs hover:opacity-90 transition"
              >
                {t('cascadeConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Informative Footer Box */}
      <div className="bg-surface border border-border rounded-2xl p-6 text-xs text-ink-2 space-y-3">
        <h4 className="font-bold text-ink text-sm flex items-center gap-2">
          <span aria-hidden="true">💡</span>
          <span>{t('footerTitle')}</span>
        </h4>
        <p className="leading-relaxed">{t('footerBody', { product: PRODUCT_NAME })}</p>
      </div>
    </div>
  );
}
