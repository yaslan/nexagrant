'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Database,
  Search,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  Zap,
  Radio,
  Code2,
  AlertCircle,
  Play,
  FileCheck,
  FolderGit2,
} from 'lucide-react';
import { handleRunCordisSync, handleRunCordisLiveDelta, handleTestRagQuery, handleRunCordisImportAction, handleGetK2Status } from './actions';
import { cordisImportFailureCode, type CordisImportFailureCode } from '@/lib/k2-cordis/failure-codes';

interface CordisMetrics {
  totalProjectsCount: number;
  totalEcContributionEUR: number;
  topCountriesBreakdown: { country: string; name: string; projectCount: number; totalGrantEUR: number }[];
  averageGrantPerProjectEUR: number;
  lastSyncTimestamp: string;
}

/** Row counts from the last CORDIS import run, as the status cards read them. */
interface K2RowCounts {
  projects?: number;
  organizations?: number;
  participations?: number;
  profiles?: number;
  topics?: number;
  scivocs?: number;
}

/** `model CordisImportRun` — one import attempt. */
interface K2ImportRun {
  runId: string;
  dataset: string;
  startedAt: Date | string;
  finishedAt: Date | string | null;
  status: string;
  fileHash: string | null;
  /** Json column; the importer writes K2RowCounts, or a `{ message }` note. */
  rowCounts: K2RowCounts | unknown | null;
}

/** The K2 ingestion status header: current table counts plus the last run. */
export interface K2Status {
  lastRun?: K2ImportRun | null;
  rowCounts?: K2RowCounts;
}

/** The result of a full CORDIS import. */
interface K2ImportResult {
  success: boolean;
  skipped?: boolean;
  errorCode?: CordisImportFailureCode;
  importDurationMs?: number;
  rowCounts?: K2RowCounts;
}

/** The result of an incremental sync. */
interface K2SyncResult {
  syncedProjectsCount: number;
  totalEcContributionEUR: number;
}

/** The result of a delta ingestion, with the projects it brought in. */
interface K2DeltaResult {
  deltaCount: number;
  ingestedProjects: Array<{
    acronym: string | null;
    title: string;
    topicCode: string | null;
    coordinatorName: string | null;
    coordinatorCountry: string | null;
    ecContributionEUR: number | null;
  }>;
}

/** One chunk returned by the RAG workbench query. */
interface RetrievedChunk {
  documentId: string;
  text: string;
  score: number;
}

interface CordisRagAdminClientProps {
  metrics: CordisMetrics;
  initialK2Status?: K2Status;
}

export function CordisRagAdminClient({ metrics: initialMetrics, initialK2Status }: CordisRagAdminClientProps) {
  const t = useTranslations('adminCordis');
  // Server-rendered figures; no client path updates them, so the setter was dead.
  const [metrics] = useState<CordisMetrics>(initialMetrics);
  const [k2Status, setK2Status] = useState<K2Status | undefined>(initialK2Status);
  const [activeTab, setActiveTab] = useState<'k2_ingestion' | 'sync' | 'delta' | 'workbench'>('k2_ingestion');

  // K2 Import State
  const [selectedDataset, setSelectedDataset] = useState<'HORIZON' | 'H2020'>('HORIZON');
  const [limitInput, setLimitInput] = useState<string>('5000');
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<K2ImportResult | null>(null);

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<K2SyncResult | null>(null);

  // Delta Sync state
  const [isDeltaSyncing, setIsDeltaSyncing] = useState(false);
  const [deltaResult, setDeltaResult] = useState<K2DeltaResult | null>(null);

  // RAG Workbench state
  const [searchQuery, setSearchQuery] = useState('Zero-emission battery thermal management');
  const [topK, setTopK] = useState(3);
  const [isSearching, setIsSearching] = useState(false);
  const [retrievedChunks, setRetrievedChunks] = useState<RetrievedChunk[]>([]);
  // null: no search yet. '': the search ran and matched nothing.
  const [ragPrompt, setRagPrompt] = useState<string | null>(null);

  const handleRunK2Import = async () => {
    setIsImporting(true);
    setImportResult(null);
    try {
      const limit = limitInput ? parseInt(limitInput, 10) : undefined;
      const res = await handleRunCordisImportAction(selectedDataset, limit);
      setImportResult(res);
      const updatedStatus = await handleGetK2Status();
      setK2Status(updatedStatus as unknown as K2Status);
    } catch (err) {
      // A thrown action (network, a server error digest) carries no text worth
      // showing; the server log has the cause.
      console.error('[admin/cordis] import action failed', err);
      setImportResult({ success: false, errorCode: 'IMPORT_FAILED' });
    } finally {
      setIsImporting(false);
    }
  };

  const handleTriggerSync = async () => {
    setIsSyncing(true);
    try {
      const res = await handleRunCordisSync();
      setSyncResult(res);
    } catch (err) {
      console.error('Error running CORDIS sync:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleTriggerLiveDelta = async () => {
    setIsDeltaSyncing(true);
    try {
      const res = await handleRunCordisLiveDelta(7);
      setDeltaResult(res);
    } catch (err) {
      console.error('Error running CORDIS Live Delta:', err);
    } finally {
      setIsDeltaSyncing(false);
    }
  };

  const handleExecuteRagSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const res = await handleTestRagQuery(searchQuery.trim(), topK);
      setRetrievedChunks(res.chunks || []);
      setRagPrompt(res.ragPrompt);
    } catch (err) {
      console.error('Error testing RAG query:', err);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ──────────────────────── HEADER BANNER ──────────────────────── */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 font-semibold tracking-wider uppercase mb-1">
              <Database className="w-4 h-4 text-cyan-400" />
              <span>{t('header.kicker')}</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight font-heading text-white">
              {t('header.title')}
            </h1>
            <p className="text-muted text-xs md:text-sm mt-1 max-w-2xl">
              {t('header.description')}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs bg-slate-800 border border-slate-700 text-cyan-300 px-3.5 py-1.5 rounded-full font-mono font-bold flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-cyan-400" />
              <span>{t('header.license')}</span>
            </span>
          </div>
        </div>

        {/* Metric Cards Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-slate-800 text-xs">
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5">
            <span className="text-muted block text-[11px]">{t('header.k2Projects')}</span>
            <span className="text-xl font-bold text-white font-mono mt-0.5 block">
              {k2Status?.rowCounts?.projects?.toLocaleString() || '0'}
            </span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5">
            <span className="text-muted block text-[11px]">{t('header.k2Organizations')}</span>
            <span className="text-xl font-bold text-cyan-300 font-mono mt-0.5 block">
              {k2Status?.rowCounts?.organizations?.toLocaleString() || '0'}
            </span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5">
            <span className="text-muted block text-[11px]">{t('header.k2Participations')}</span>
            <span className="text-xl font-bold text-emerald-400 font-mono mt-0.5 block">
              {k2Status?.rowCounts?.participations?.toLocaleString() || '0'}
            </span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5">
            <span className="text-muted block text-[11px]">{t('header.m1Profiles')}</span>
            <span className="text-xl font-bold text-purple-300 font-mono mt-0.5 block">
              {k2Status?.rowCounts?.profiles?.toLocaleString() || '0'}
            </span>
          </div>
        </div>
      </div>

      {/* ──────────────────────── NAVIGATION TABS ──────────────────────── */}
      {/* Scrolls sideways on narrow screens instead of widening <main>. The baseline is an
          inset shadow, not border-b + -mb-px: a scroll box would clip the tabs' overlap.
          Chrome does not scroll a half-visible element into view on keyboard focus, so the
          strip does it: a Tab-key user would otherwise stop on a tab cut off at the edge. */}
      <div
        className="flex gap-2 overflow-x-auto shadow-[inset_0_-1px_0_var(--color-border)]"
        onFocus={(e) => e.target.scrollIntoView({ block: 'nearest', inline: 'nearest' })}
      >
        <button
          onClick={() => setActiveTab('k2_ingestion')}
          className={`px-4 py-2.5 font-semibold text-xs rounded-t-xl transition flex items-center gap-2 border-b-2 shrink-0 whitespace-nowrap ${
            activeTab === 'k2_ingestion'
              ? 'border-blue-600 text-blue-600 bg-blue-50/50'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          <FolderGit2 className="w-4 h-4" />
          <span>{t('tabs.k2Ingestion')}</span>
        </button>

        <button
          onClick={() => setActiveTab('sync')}
          className={`px-4 py-2.5 font-semibold text-xs rounded-t-xl transition flex items-center gap-2 border-b-2 shrink-0 whitespace-nowrap ${
            activeTab === 'sync'
              ? 'border-blue-600 text-blue-600 bg-blue-50/50'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>{t('tabs.sync')}</span>
        </button>

        <button
          onClick={() => setActiveTab('delta')}
          className={`px-4 py-2.5 font-semibold text-xs rounded-t-xl transition flex items-center gap-2 border-b-2 shrink-0 whitespace-nowrap ${
            activeTab === 'delta'
              ? 'border-purple-600 text-purple-600 bg-purple-50/50'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          <Radio className="w-4 h-4 text-purple-600 animate-pulse" />
          <span>{t('tabs.delta')}</span>
        </button>

        <button
          onClick={() => setActiveTab('workbench')}
          className={`px-4 py-2.5 font-semibold text-xs rounded-t-xl transition flex items-center gap-2 border-b-2 shrink-0 whitespace-nowrap ${
            activeTab === 'workbench'
              ? 'border-blue-600 text-blue-600 bg-blue-50/50'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          <Search className="w-4 h-4" />
          <span>{t('tabs.workbench')}</span>
        </button>
      </div>

      {/* ──────────────────────── TAB 0: K2 INGESTION & STATUS CARD ──────────────────────── */}
      {activeTab === 'k2_ingestion' && (
        <div className="space-y-6">
          {/* Status Card */}
          <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <h3 className="font-bold text-sm text-ink flex items-center gap-2">
                  <FileCheck className="w-4.5 h-4.5 text-blue-600" />
                  <span>{t('k2.statusTitle')}</span>
                </h3>
                <p className="text-muted text-xs mt-0.5">
                  {t('k2.statusBody')}
                </p>
              </div>

              {k2Status?.lastRun ? (
                <span
                  className={`text-xs font-mono font-bold px-3 py-1 rounded-full ${
                    k2Status.lastRun.status === 'SUCCESS'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : k2Status.lastRun.status === 'FAILED'
                      ? 'bg-red-100 text-red-800 border border-red-300'
                      : 'bg-amber-100 text-amber-800 border border-amber-300 animate-pulse'
                  }`}
                >
                  {t('k2.lastRunBadge', { status: k2Status.lastRun.status, dataset: k2Status.lastRun.dataset })}
                </span>
              ) : (
                <span className="text-xs text-muted font-mono bg-ground px-3 py-1 rounded-full border border-border">
                  {t('k2.noRunYet')}
                </span>
              )}
            </div>

            {k2Status?.lastRun && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono bg-ground p-4 rounded-xl border border-border">
                <div>
                  <span className="text-muted block text-[11px]">{t('k2.lastStarted')}</span>
                  <span className="font-bold text-ink">
                    {new Date(k2Status.lastRun.startedAt).toLocaleString('tr-TR')}
                  </span>
                </div>

                <div>
                  <span className="text-muted block text-[11px]">{t('k2.fileHash')}</span>
                  <span className="font-bold text-ink truncate block">
                    {k2Status.lastRun.fileHash ? k2Status.lastRun.fileHash.slice(0, 16) + '...' : 'N/A'}
                  </span>
                </div>

                <div>
                  <span className="text-muted block text-[11px]">{t('k2.lastRows')}</span>
                  <span className="font-bold text-ink">
                    {t('k2.lastRowsValue', {
                      projects: (k2Status.lastRun.rowCounts as K2RowCounts | null)?.projects || 0,
                      organizations: (k2Status.lastRun.rowCounts as K2RowCounts | null)?.organizations || 0,
                    })}
                  </span>
                </div>
              </div>
            )}

            {/* Run Controls */}
            <div className="pt-2 flex flex-col md:flex-row items-center justify-between gap-4 border-t border-border">
              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                <div>
                  <label className="text-xs font-bold text-ink-2 block mb-1">{t('k2.dataset')}</label>
                  <select
                    value={selectedDataset}
                    onChange={(e) => setSelectedDataset(e.target.value as 'HORIZON' | 'H2020')}
                    className="border border-border rounded-xl px-3 py-2 text-xs font-semibold bg-ground text-ink"
                  >
                    <option value="HORIZON">{t('k2.datasetHorizon')}</option>
                    <option value="H2020">{t('k2.datasetH2020')}</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-ink-2 block mb-1">{t('k2.rowLimit')}</label>
                  <input
                    type="number"
                    value={limitInput}
                    onChange={(e) => setLimitInput(e.target.value)}
                    placeholder={t('k2.rowLimitPlaceholder')}
                    className="border border-border rounded-xl px-3 py-2 text-xs font-semibold bg-ground text-ink w-28"
                  />
                </div>
              </div>

              <button
                onClick={handleRunK2Import}
                disabled={isImporting}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-2.5 rounded-xl transition text-xs shadow-md flex items-center gap-2 w-full md:w-auto justify-center"
              >
                <Play className={`w-4 h-4 ${isImporting ? 'animate-spin' : ''}`} />
                <span>{isImporting ? t('k2.runImportBusy') : t('k2.runImport')}</span>
              </button>
            </div>

            {importResult && (
              <div
                className={`p-4 rounded-xl text-xs space-y-1 ${
                  importResult.success
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                    : 'bg-red-50 border border-red-200 text-red-900'
                }`}
              >
                <div className="font-bold flex items-center gap-2">
                  {importResult.success ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>{t('k2.importSuccess')}</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4 h-4 text-red-600" />
                      <span role="alert">{t(`importErrors.${cordisImportFailureCode(importResult.errorCode)}`)}</span>
                    </>
                  )}
                </div>

                {importResult.success && (
                  <div className="font-mono text-[11px] pt-1">
                    {importResult.skipped ? (
                      <p>{t('k2.importSkipped')}</p>
                    ) : (
                      <p>
                        {t('k2.importCounts', {
                          projects: importResult.rowCounts?.projects ?? 0,
                          organizations: importResult.rowCounts?.organizations ?? 0,
                          participations: importResult.rowCounts?.participations ?? 0,
                          durationMs: importResult.importDurationMs ?? 0,
                        })}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Module Dependency Notice */}
          <div className="bg-amber-50 border border-amber-200 text-amber-900 p-4 rounded-xl text-xs flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block">{t('k2.m1DependencyTitle')}</span>
              <p className="mt-0.5 text-amber-800">
                {t.rich('k2.m1DependencyBody', {
                  code: (chunks) => <code className="font-mono font-bold bg-amber-100 px-1 rounded">{chunks}</code>,
                })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────── TAB 1: CORDIS SYNC & OLAP METRICS ──────────────────────── */}
      {activeTab === 'sync' && (
        <div className="space-y-6">
          <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-sm text-ink flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-blue-600" />
                <span>{t('sync.title')}</span>
              </h3>
              <p className="text-muted text-xs mt-1">
                {t('sync.body')}
              </p>
            </div>

            <button
              onClick={handleTriggerSync}
              disabled={isSyncing}
              className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-5 py-2.5 rounded-xl transition text-xs shadow-md shrink-0 flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? t('sync.busy') : t('sync.run')}</span>
            </button>
          </div>

          {syncResult && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-950 p-4 rounded-xl text-xs space-y-1">
              <span className="font-bold block">{t('sync.done')}</span>
              <p className="font-mono text-[11px]">
                {t('sync.totals', {
                  count: syncResult.syncedProjectsCount,
                  total: syncResult.totalEcContributionEUR?.toLocaleString() ?? '',
                })}
              </p>
            </div>
          )}

          <div className="space-y-3">
            <h3 className="font-bold text-sm text-ink">{t('sync.olapTitle')}</h3>
            <div className="bg-surface border border-border rounded-2xl shadow-2xs overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-ground border-b border-border text-ink-2 font-bold uppercase tracking-wider text-[11px]">
                    <th className="p-3.5">{t('sync.colCountry')}</th>
                    <th className="p-3.5">{t('sync.colProjects')}</th>
                    <th className="p-3.5">{t('sync.colTotalFunding')}</th>
                    <th className="p-3.5 text-right">{t('sync.colAverage')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {metrics.topCountriesBreakdown.map((c, idx) => (
                    <tr key={idx} className="hover:bg-ground transition-colors">
                      <td className="p-3.5 font-bold text-ink flex items-center gap-2">
                        <span className="bg-surface-hover text-ink font-mono px-2 py-0.5 rounded text-[10px] font-bold">
                          {c.country}
                        </span>
                        <span>{c.name}</span>
                      </td>
                      <td className="p-3.5 font-mono text-ink-2 font-bold">{c.projectCount.toLocaleString()}</td>
                      <td className="p-3.5 font-mono text-emerald-700 font-bold">€{c.totalGrantEUR.toLocaleString()}</td>
                      <td className="p-3.5 text-right font-mono text-ink-2">
                        €{Math.round(c.totalGrantEUR / c.projectCount).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────── TAB 2: CANLI CORDIS DELTA API AKIŞI ──────────────────────── */}
      {activeTab === 'delta' && (
        <div className="space-y-6">
          <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-sm text-ink flex items-center gap-2">
                <Radio className="w-4 h-4 text-purple-600 animate-pulse" />
                <span>{t('delta.title')}</span>
              </h3>
              <p className="text-muted text-xs mt-1">
                {t('delta.body')}
              </p>
            </div>

            <button
              onClick={handleTriggerLiveDelta}
              disabled={isDeltaSyncing}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-5 py-2.5 rounded-xl transition text-xs shadow-md shrink-0 flex items-center gap-2"
            >
              <Radio className={`w-4 h-4 ${isDeltaSyncing ? 'animate-spin' : ''}`} />
              <span>{isDeltaSyncing ? t('delta.busy') : t('delta.run')}</span>
            </button>
          </div>

          {deltaResult && (
            <div className="bg-purple-50 border border-purple-200 text-purple-950 p-5 rounded-2xl text-xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-purple-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4.5 h-4.5 text-purple-700" />
                  {t('delta.done')}
                </span>
                <span className="font-mono text-[11px] text-purple-700 bg-purple-100 px-2.5 py-0.5 rounded-full font-bold">
                  {t('delta.indexed', { count: deltaResult.deltaCount })}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                {deltaResult.ingestedProjects.map((p, idx: number) => (
                  <div key={idx} className="bg-surface border border-purple-100 p-4 rounded-xl space-y-2 shadow-2xs">
                    <div className="flex justify-between items-start">
                      <span className="font-bold text-ink font-mono text-xs">{p.acronym}</span>
                      <span className="font-mono text-xs text-emerald-700 font-bold">€{p.ecContributionEUR?.toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-ink-2 font-semibold">{p.title}</p>
                    <div className="flex items-center justify-between text-[11px] text-muted font-mono pt-1">
                      <span>
                        {t('delta.coordinator', {
                          name: p.coordinatorName ?? '',
                          country: p.coordinatorCountry ?? '',
                        })}
                      </span>
                      <span className="bg-surface-hover px-1.5 py-0.5 rounded text-[10px] font-bold text-ink-2">{p.topicCode}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ──────────────────────── TAB 3: LIVE VECTOR RAG WORKBENCH ──────────────────────── */}
      {activeTab === 'workbench' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm space-y-4">
              <h3 className="font-bold text-sm text-ink flex items-center gap-2 border-b pb-3">
                <Search className="w-4 h-4 text-blue-600" />
                <span>{t('rag.title')}</span>
              </h3>

              <form onSubmit={handleExecuteRagSearch} className="space-y-3 text-xs">
                <div>
                  <label className="font-semibold text-ink-2 block mb-1">{t('rag.queryLabel')}</label>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('rag.queryPlaceholder')}
                    required
                    className="w-full border border-border rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none bg-ground font-semibold"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <label className="font-semibold text-ink-2">{t('rag.topKLabel')}</label>
                    <select
                      value={topK}
                      onChange={(e) => setTopK(parseInt(e.target.value, 10))}
                      className="border border-border rounded-lg p-1.5 text-xs font-mono font-bold bg-ground"
                    >
                      <option value={3}>{t('rag.topK', { count: 3 })}</option>
                      <option value={5}>{t('rag.topK', { count: 5 })}</option>
                      <option value={10}>{t('rag.topK', { count: 10 })}</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={isSearching}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-xl transition text-xs shadow-xs flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{isSearching ? t('rag.searching') : t('rag.search')}</span>
                  </button>
                </div>
              </form>
            </div>

            <div className="space-y-4">
              <h4 className="font-bold text-xs text-ink-2 uppercase tracking-wider">
                {t('rag.resultsHeading', { count: retrievedChunks.length })}
              </h4>

              {retrievedChunks.map((chunk, idx) => (
                <div key={idx} className="bg-surface border border-border rounded-2xl p-5 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <span className="font-mono font-bold text-xs text-blue-900 bg-blue-50 px-2 py-0.5 rounded">
                      {t('rag.sourceLabel', { index: idx + 1, documentId: chunk.documentId })}
                    </span>
                    <span className="font-mono font-bold text-xs text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                      {t('rag.scoreLabel', { score: (chunk.score * 100).toFixed(1) })}
                    </span>
                  </div>

                  <p className="text-xs text-ink-2 font-mono leading-relaxed bg-ground p-3 rounded-xl border border-border whitespace-pre-wrap">
                    {chunk.text}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-5 space-y-4">
            <h3 className="font-bold text-sm text-ink flex items-center gap-2">
              <Code2 className="w-4 h-4 text-purple-600" />
              <span>{t('rag.promptTitle')}</span>
            </h3>

            <div className="bg-slate-950 text-slate-200 p-4 rounded-2xl border border-slate-800 shadow-sm space-y-3 font-mono text-[11px]">
              <span className="text-purple-400 font-bold block text-xs border-b border-slate-800 pb-2">
                {t('rag.payloadComment')}
              </span>

              {ragPrompt ? (
                <pre className="whitespace-pre-wrap leading-relaxed text-slate-300 max-h-[500px] overflow-y-auto">
                  {ragPrompt}
                </pre>
              ) : ragPrompt === '' ? (
                <p className="text-muted text-xs italic">{t('ragPreview.noMatches')}</p>
              ) : (
                <p className="text-muted text-xs italic">
                  {t('ragPreview.idle')}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
