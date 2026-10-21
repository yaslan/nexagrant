'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Globe,
  RefreshCw,
  Database,
  Building2,
  Search,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Layers,
  MapPin,
  TrendingUp,
  FileText,
} from 'lucide-react';
import type { KeepEuMetrics, KeepEuSyncResult } from '@/lib/keep-eu-sync';
import {
  handleRunKeepEuSyncAction,
  handleGetKeepEuMetricsAction,
  handleTestInterregRagQuery,
} from './actions';

interface RetrievedChunk {
  documentId: string;
  text: string;
  score: number;
}

interface KeepEuAdminClientProps {
  initialMetrics: KeepEuMetrics;
}

export function KeepEuAdminClient({ initialMetrics }: KeepEuAdminClientProps) {
  const t = useTranslations('adminInterreg');
  const [metrics, setMetrics] = useState<KeepEuMetrics>(initialMetrics);
  const [activeTab, setActiveTab] = useState<'programmes' | 'countries' | 'rag'>('programmes');

  // Sync state
  const [customProgrammeIds, setCustomProgrammeIds] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncResult, setSyncResult] = useState<KeepEuSyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // RAG workbench state
  const [searchQuery, setSearchQuery] = useState<string>('Sürdürülebilir turizm ve kültürel miras');
  const [topK, setTopK] = useState<number>(3);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [retrievedChunks, setRetrievedChunks] = useState<RetrievedChunk[]>([]);

  const handleTriggerSync = async () => {
    setIsSyncing(true);
    setSyncError(null);
    setSyncResult(null);

    try {
      const res = await handleRunKeepEuSyncAction(customProgrammeIds || undefined);
      setSyncResult(res);
      const updatedMetrics = await handleGetKeepEuMetricsAction();
      setMetrics(updatedMetrics);
    } catch (err) {
      console.error('[admin/interreg] sync action failed', err);
      setSyncError(t('syncError'));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleTriggerRagSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const res = await handleTestInterregRagQuery(searchQuery, topK);
      setRetrievedChunks(res.chunks as unknown as RetrievedChunk[]);
    } catch (err) {
      console.error('[admin/interreg] rag query failed', err);
    } finally {
      setIsSearching(false);
    }
  };

  const formatEur = (amount: number): string => {
    return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* ───────────────────────── HEADER ───────────────────────── */}
      <div className="bg-surface border border-border rounded-2xl p-6 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start space-x-4">
          <div className="p-3 bg-blue-500/10 text-blue-600 rounded-xl border border-blue-500/20">
            <Globe className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-xl font-bold tracking-tight text-ink">{t('title')}</h1>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                {t('badge')}
              </span>
            </div>
            <p className="text-sm text-muted mt-1 max-w-2xl">{t('subtitle')}</p>
            <div className="text-xs text-muted mt-2 font-mono flex items-center gap-1.5">
              <span>{t('lastSync')}:</span>
              <span className="font-semibold text-ink">
                {metrics.lastSyncTimestamp ? new Date(metrics.lastSyncTimestamp).toLocaleString() : t('neverSynced')}
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={handleTriggerSync}
          disabled={isSyncing}
          className="inline-flex items-center justify-center space-x-2 px-5 py-2.5 rounded-xl font-medium text-sm bg-blue-600 text-white hover:bg-blue-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
        >
          <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>{isSyncing ? t('syncing') : t('syncNow')}</span>
        </button>
      </div>

      {/* ───────────────────────── KPI STATS CARDS ───────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Projects */}
        <div className="bg-surface border border-border rounded-2xl p-5 shadow-2xs">
          <div className="flex items-center justify-between text-muted text-xs font-medium">
            <span>{t('totalProjects')}</span>
            <Layers className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-ink mt-2">
            {metrics.totalProjectsCount.toLocaleString()}
          </div>
          <div className="text-xs text-muted mt-1 flex items-center gap-1">
            <span className="font-medium text-emerald-600">{t('interregAndNext')}</span>
          </div>
        </div>

        {/* Total EU / IPA Grant */}
        <div className="bg-surface border border-border rounded-2xl p-5 shadow-2xs">
          <div className="flex items-center justify-between text-muted text-xs font-medium">
            <span>{t('totalFunding')}</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-ink mt-2">
            €{formatEur(metrics.totalEuFundingEUR)}
          </div>
          <div className="text-xs text-muted mt-1 font-mono">
            {t('totalBudget')}: €{formatEur(metrics.totalBudgetEUR)}
          </div>
        </div>

        {/* Total Consortium Partners */}
        <div className="bg-surface border border-border rounded-2xl p-5 shadow-2xs">
          <div className="flex items-center justify-between text-muted text-xs font-medium">
            <span>{t('totalPartners')}</span>
            <Building2 className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-bold text-ink mt-2">
            {metrics.totalPartnersCount.toLocaleString()}
          </div>
          <div className="text-xs text-muted mt-1 flex items-center gap-1">
            <span className="text-purple-600 font-medium">{t('m8PartnerPool')}</span>
          </div>
        </div>

        {/* Turkish Beneficiaries */}
        <div className="bg-surface border border-border rounded-2xl p-5 shadow-2xs">
          <div className="flex items-center justify-between text-muted text-xs font-medium">
            <span>{t('turkishPartners')}</span>
            <MapPin className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-2">
            {metrics.turkishPartnersCount.toLocaleString()}
          </div>
          <div className="text-xs text-muted mt-1">
            <span className="font-semibold text-rose-600">TR</span> {t('turkishBeneficiariesDesc')}
          </div>
        </div>
      </div>

      {/* ───────────────────────── SYNC FEEDBACK BANNER ───────────────────────── */}
      {syncResult && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 flex items-start space-x-3 text-emerald-800 dark:text-emerald-300">
          <CheckCircle2 className="w-5 h-5 mt-0.5 text-emerald-600 shrink-0" />
          <div className="text-xs space-y-1">
            <div className="font-bold text-sm">{t('syncSuccess')}</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono">
              <span>{t('syncedProjectsCount', { count: syncResult.syncedProjectsCount })}</span>
              <span>•</span>
              <span>{t('syncedPartnersCount', { count: syncResult.syncedPartnersCount })}</span>
              <span>•</span>
              <span>{t('totalEuFundingEUR', { amount: formatEur(syncResult.totalEuFundingEUR) })}</span>
              {syncResult.skippedCount > 0 && (
                <>
                  <span>•</span>
                  <span className="text-amber-700 dark:text-amber-400">
                    {t('skippedCount', { count: syncResult.skippedCount })}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {syncError && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 flex items-center space-x-3 text-rose-800 dark:text-rose-300 text-xs">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span className="font-medium">{syncError}</span>
        </div>
      )}

      {/* ───────────────────────── NAVIGATION TABS ───────────────────────── */}
      <div className="border-b border-border flex items-center space-x-2">
        <button
          onClick={() => setActiveTab('programmes')}
          className={`flex items-center space-x-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
            activeTab === 'programmes'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>{t('tabProgrammes')}</span>
        </button>

        <button
          onClick={() => setActiveTab('countries')}
          className={`flex items-center space-x-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
            activeTab === 'countries'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          <MapPin className="w-4 h-4" />
          <span>{t('tabCountries')}</span>
        </button>

        <button
          onClick={() => setActiveTab('rag')}
          className={`flex items-center space-x-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
            activeTab === 'rag'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>{t('tabRag')}</span>
        </button>
      </div>

      {/* ───────────────────────── TAB 1: PROGRAMMES & SYNC ───────────────────────── */}
      {activeTab === 'programmes' && (
        <div className="space-y-6">
          {/* Sync Configuration Box */}
          <div className="bg-surface border border-border rounded-2xl p-6 shadow-2xs space-y-4">
            <h3 className="text-sm font-bold text-ink flex items-center space-x-2">
              <Layers className="w-4 h-4 text-blue-600" />
              <span>{t('selectProgrammes')}</span>
            </h3>
            <p className="text-xs text-muted">{t('defaultProgrammesHelp')}</p>

            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={customProgrammeIds}
                onChange={(e) => setCustomProgrammeIds(e.target.value)}
                placeholder={t('customIdsPlaceholder')}
                className="flex-1 px-3.5 py-2 rounded-xl text-sm bg-ground border border-border focus:outline-none focus:ring-2 focus:ring-blue-500/40 text-ink placeholder:text-muted"
              />
              <button
                onClick={handleTriggerSync}
                disabled={isSyncing}
                className="inline-flex items-center justify-center space-x-2 px-5 py-2 rounded-xl font-medium text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-all shadow-sm shrink-0"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? t('syncing') : t('syncNow')}</span>
              </button>
            </div>
          </div>

          {/* Programmes Breakdown Table */}
          <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-2xs">
            <div className="px-6 py-4 border-b border-border bg-surface-hover/30">
              <h3 className="text-sm font-bold text-ink">{t('programmeTitle')}</h3>
            </div>

            {metrics.topProgrammesBreakdown.length === 0 ? (
              <div className="p-8 text-center text-muted text-xs space-y-2">
                <div className="font-semibold text-sm text-ink">{t('emptyStateTitle')}</div>
                <p>{t('emptyStateDesc')}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-hover text-muted uppercase text-[10px] tracking-wider font-semibold border-b border-border">
                    <tr>
                      <th className="px-6 py-3">{t('programmeTitle')}</th>
                      <th className="px-6 py-3 text-center">{t('projectCount')}</th>
                      <th className="px-6 py-3 text-right">{t('grantAmount')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {metrics.topProgrammesBreakdown.map((prog, idx) => (
                      <tr key={idx} className="hover:bg-surface-hover/50 transition">
                        <td className="px-6 py-3.5 font-medium text-ink flex items-center space-x-2">
                          <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                          <span>{prog.programmeTitle}</span>
                        </td>
                        <td className="px-6 py-3.5 text-center font-mono font-semibold text-ink">
                          {prog.projectCount}
                        </td>
                        <td className="px-6 py-3.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          €{formatEur(prog.totalGrantEUR)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ───────────────────────── TAB 2: COUNTRIES BREAKDOWN ───────────────────────── */}
      {activeTab === 'countries' && (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-2xs">
          <div className="px-6 py-4 border-b border-border bg-surface-hover/30">
            <h3 className="text-sm font-bold text-ink">{t('tabCountries')}</h3>
          </div>

          {metrics.topCountriesBreakdown.length === 0 ? (
            <div className="p-8 text-center text-muted text-xs space-y-2">
              <div className="font-semibold text-sm text-ink">{t('emptyStateTitle')}</div>
              <p>{t('emptyStateDesc')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-hover text-muted uppercase text-[10px] tracking-wider font-semibold border-b border-border">
                  <tr>
                    <th className="px-6 py-3">{t('country')}</th>
                    <th className="px-6 py-3 text-center">{t('partnerCount')}</th>
                    <th className="px-6 py-3 text-right">{t('grantAmount')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {metrics.topCountriesBreakdown.map((c) => {
                    const isTr = c.country === 'TR';
                    return (
                      <tr
                        key={c.country}
                        className={`hover:bg-surface-hover/50 transition ${
                          isTr ? 'bg-rose-500/5 font-semibold' : ''
                        }`}
                      >
                        <td className="px-6 py-3.5 flex items-center space-x-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                              isTr
                                ? 'bg-rose-600 text-white'
                                : 'bg-surface-hover text-ink-2'
                            }`}
                          >
                            {c.country}
                          </span>
                          <span className={isTr ? 'text-rose-700 dark:text-rose-400 font-bold' : 'text-ink'}>
                            {c.name}
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-center font-mono text-ink">
                          {c.partnerCount}
                        </td>
                        <td className="px-6 py-3.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          €{formatEur(c.totalGrantEUR)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────── TAB 3: RAG WORKBENCH ───────────────────────── */}
      {activeTab === 'rag' && (
        <div className="space-y-6">
          <div className="bg-surface border border-border rounded-2xl p-6 shadow-2xs space-y-4">
            <div>
              <h3 className="text-sm font-bold text-ink flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-purple-600" />
                <span>{t('ragTitle')}</span>
              </h3>
              <p className="text-xs text-muted mt-1">{t('ragSubtitle')}</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('searchPlaceholder')}
                className="flex-1 px-3.5 py-2 rounded-xl text-sm bg-ground border border-border focus:outline-none focus:ring-2 focus:ring-purple-500/40 text-ink placeholder:text-muted"
              />
              <div className="flex items-center space-x-2 shrink-0">
                <select
                  value={topK}
                  onChange={(e) => setTopK(Number(e.target.value))}
                  className="px-3 py-2 rounded-xl text-sm bg-ground border border-border text-ink"
                >
                  <option value={3}>{t('topKOption', { count: 3 })}</option>
                  <option value={5}>{t('topKOption', { count: 5 })}</option>
                  <option value={10}>{t('topKOption', { count: 10 })}</option>
                </select>
                <button
                  onClick={handleTriggerRagSearch}
                  disabled={isSearching}
                  className="inline-flex items-center space-x-2 px-5 py-2 rounded-xl font-medium text-sm bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 transition-all shadow-sm"
                >
                  <Search className={`w-4 h-4 ${isSearching ? 'animate-spin' : ''}`} />
                  <span>{isSearching ? t('searching') : t('searchButton')}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Results List */}
          {retrievedChunks.length > 0 && (
            <div className="space-y-3">
              {retrievedChunks.map((chunk, idx) => (
                <div
                  key={idx}
                  className="bg-surface border border-border rounded-2xl p-5 shadow-2xs space-y-2 hover:border-purple-500/30 transition"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-muted">ID: {chunk.documentId}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-500/10 text-purple-600 border border-purple-500/20">
                      {t('similarityScore')}: {(chunk.score * 100).toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-xs text-ink leading-relaxed whitespace-pre-wrap font-sans bg-ground/50 p-3 rounded-xl border border-border/50">
                    {chunk.text}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
