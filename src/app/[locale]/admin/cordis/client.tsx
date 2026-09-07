'use client';

import React, { useState } from 'react';
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
  Building2,
  Users,
  FolderGit2
} from 'lucide-react';
import { handleRunCordisSync, handleRunCordisLiveDelta, handleTestRagQuery, handleRunCordisImportAction, handleGetK2Status } from './actions';
import { errorMessage } from '@/lib/errors';

interface CordisMetrics {
  totalProjectsCount: number;
  totalEcContributionEUR: number;
  topCountriesBreakdown: { country: string; name: string; projectCount: number; totalGrantEUR: number }[];
  averageGrantPerProjectEUR: number;
  lastSyncTimestamp: string;
}

interface CordisRagAdminClientProps {
  metrics: CordisMetrics;
  initialK2Status?: any;
}

export function CordisRagAdminClient({ metrics: initialMetrics, initialK2Status }: CordisRagAdminClientProps) {
  const [metrics, setMetrics] = useState<CordisMetrics>(initialMetrics);
  const [k2Status, setK2Status] = useState<any>(initialK2Status);
  const [activeTab, setActiveTab] = useState<'k2_ingestion' | 'sync' | 'delta' | 'workbench'>('k2_ingestion');

  // K2 Import State
  const [selectedDataset, setSelectedDataset] = useState<'HORIZON' | 'H2020'>('HORIZON');
  const [limitInput, setLimitInput] = useState<string>('5000');
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<any | null>(null);

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any | null>(null);

  // Delta Sync state
  const [isDeltaSyncing, setIsDeltaSyncing] = useState(false);
  const [deltaResult, setDeltaResult] = useState<any | null>(null);

  // RAG Workbench state
  const [searchQuery, setSearchQuery] = useState('Zero-emission battery thermal management');
  const [topK, setTopK] = useState(3);
  const [isSearching, setIsSearching] = useState(false);
  const [retrievedChunks, setRetrievedChunks] = useState<any[]>([]);
  const [ragPrompt, setRagPrompt] = useState<string | null>(null);

  const handleRunK2Import = async () => {
    setIsImporting(true);
    setImportResult(null);
    try {
      const limit = limitInput ? parseInt(limitInput, 10) : undefined;
      const res = await handleRunCordisImportAction(selectedDataset, limit);
      setImportResult(res);
      const updatedStatus = await handleGetK2Status();
      setK2Status(updatedStatus);
    } catch (err) {
      setImportResult({ success: false, error: errorMessage(err, 'Import failed')});
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
      setRagPrompt(res.ragPrompt || null);
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
              <span>K2 CORDIS Ingestion & M1 Partner Intelligence Console</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight font-heading text-white">
              K2 CORDIS Katmanı Yönetim Paneli
            </h1>
            <p className="text-muted text-xs md:text-sm mt-1 max-w-2xl">
              Horizon Europe ve H2020 fonlanmış proje/ortaklık sonuç verilerini çeker, M1 Partner Intelligence modülünü besler.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs bg-slate-800 border border-slate-700 text-cyan-300 px-3.5 py-1.5 rounded-full font-mono font-bold flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-cyan-400" />
              <span>CORDIS CC BY 4.0</span>
            </span>
          </div>
        </div>

        {/* Metric Cards Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-slate-800 text-xs">
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5">
            <span className="text-muted block text-[11px]">K2 Proje Satırı</span>
            <span className="text-xl font-bold text-white font-mono mt-0.5 block">
              {k2Status?.rowCounts?.projects?.toLocaleString() || '0'}
            </span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5">
            <span className="text-muted block text-[11px]">K2 Kuruluş Satırı</span>
            <span className="text-xl font-bold text-cyan-300 font-mono mt-0.5 block">
              {k2Status?.rowCounts?.organizations?.toLocaleString() || '0'}
            </span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5">
            <span className="text-muted block text-[11px]">K2 Katılım Satırı</span>
            <span className="text-xl font-bold text-emerald-400 font-mono mt-0.5 block">
              {k2Status?.rowCounts?.participations?.toLocaleString() || '0'}
            </span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5">
            <span className="text-muted block text-[11px]">M1 Partner Profili</span>
            <span className="text-xl font-bold text-purple-300 font-mono mt-0.5 block">
              {k2Status?.rowCounts?.profiles?.toLocaleString() || '0'}
            </span>
          </div>
        </div>
      </div>

      {/* ──────────────────────── NAVIGATION TABS ──────────────────────── */}
      <div className="flex border-b border-border gap-2">
        <button
          onClick={() => setActiveTab('k2_ingestion')}
          className={`px-4 py-2.5 font-semibold text-xs rounded-t-xl transition flex items-center gap-2 border-b-2 -mb-px ${
            activeTab === 'k2_ingestion'
              ? 'border-blue-600 text-blue-600 bg-blue-50/50'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          <FolderGit2 className="w-4 h-4" />
          <span>K2 Ingestion & Durum Kartı</span>
        </button>

        <button
          onClick={() => setActiveTab('sync')}
          className={`px-4 py-2.5 font-semibold text-xs rounded-t-xl transition flex items-center gap-2 border-b-2 -mb-px ${
            activeTab === 'sync'
              ? 'border-blue-600 text-blue-600 bg-blue-50/50'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>OLAP & Hibe Dağılımı</span>
        </button>

        <button
          onClick={() => setActiveTab('delta')}
          className={`px-4 py-2.5 font-semibold text-xs rounded-t-xl transition flex items-center gap-2 border-b-2 -mb-px ${
            activeTab === 'delta'
              ? 'border-purple-600 text-purple-600 bg-purple-50/50'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          <Radio className="w-4 h-4 text-purple-600 animate-pulse" />
          <span>Canlı CORDIS Delta API</span>
        </button>

        <button
          onClick={() => setActiveTab('workbench')}
          className={`px-4 py-2.5 font-semibold text-xs rounded-t-xl transition flex items-center gap-2 border-b-2 -mb-px ${
            activeTab === 'workbench'
              ? 'border-blue-600 text-blue-600 bg-blue-50/50'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          <Search className="w-4 h-4" />
          <span>Vector RAG Lab</span>
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
                  <span>K2 CORDIS Katman Durumu & Son İçe Aktarım</span>
                </h3>
                <p className="text-muted text-xs mt-0.5">
                  Aylık güncellenen resmi Avrupa Komisyonu dökümlerinden (Horizon Europe & H2020) veri aktarımı.
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
                  Son Çalıştırma: {k2Status.lastRun.status} ({k2Status.lastRun.dataset})
                </span>
              ) : (
                <span className="text-xs text-muted font-mono bg-ground px-3 py-1 rounded-full border border-border">
                  Henüz içe aktarım yapılmadı
                </span>
              )}
            </div>

            {k2Status?.lastRun && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono bg-ground p-4 rounded-xl border border-border">
                <div>
                  <span className="text-muted block text-[11px]">Son Başlatma:</span>
                  <span className="font-bold text-ink">
                    {new Date(k2Status.lastRun.startedAt).toLocaleString('tr-TR')}
                  </span>
                </div>

                <div>
                  <span className="text-muted block text-[11px]">Dosya Hash (SHA-256):</span>
                  <span className="font-bold text-ink truncate block">
                    {k2Status.lastRun.fileHash ? k2Status.lastRun.fileHash.slice(0, 16) + '...' : 'N/A'}
                  </span>
                </div>

                <div>
                  <span className="text-muted block text-[11px]">Son Aktarılan Satırlar:</span>
                  <span className="font-bold text-ink">
                    {k2Status.lastRun.rowCounts?.projects || 0} proje / {k2Status.lastRun.rowCounts?.organizations || 0} org
                  </span>
                </div>
              </div>
            )}

            {/* Run Controls */}
            <div className="pt-2 flex flex-col md:flex-row items-center justify-between gap-4 border-t border-border">
              <div className="flex items-center gap-3 w-full md:w-auto">
                <div>
                  <label className="text-xs font-bold text-ink-2 block mb-1">Veri Kümesi (Dataset)</label>
                  <select
                    value={selectedDataset}
                    onChange={(e) => setSelectedDataset(e.target.value as 'HORIZON' | 'H2020')}
                    className="border border-border rounded-xl px-3 py-2 text-xs font-semibold bg-ground text-ink"
                  >
                    <option value="HORIZON">Horizon Europe (2021-2027)</option>
                    <option value="H2020">H2020 (2014-2020)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-ink-2 block mb-1">Satır Sınırı (Limit)</label>
                  <input
                    type="number"
                    value={limitInput}
                    onChange={(e) => setLimitInput(e.target.value)}
                    placeholder="Örn: 5000"
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
                <span>{isImporting ? 'İçe Aktarılıyor ve Profil Üretiliyor...' : 'Şimdi Çalıştır (Ingest & M1 Profiles)'}</span>
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
                      <span>İçe Aktarım ve M1 Profilleri Başarıyla Güncellendi!</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4 h-4 text-red-600" />
                      <span>İçe Aktarım Hatası: {importResult.error}</span>
                    </>
                  )}
                </div>

                {importResult.success && (
                  <div className="font-mono text-[11px] pt-1">
                    {importResult.skipped ? (
                      <p>ℹ️ Veri kümesi zaten güncel (File hash eşleşti, aktarım atlandı).</p>
                    ) : (
                      <p>
                        İşlenen: {importResult.rowCounts?.projects} Proje, {importResult.rowCounts?.organizations} Kuruluş, {importResult.rowCounts?.participations} Katılım. Süre: {importResult.importDurationMs}ms.
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
              <span className="font-bold block">M1 Partner Intelligence Modülü Bağımlılığı</span>
              <p className="mt-0.5 text-amber-800">
                M1 &quot;Ortak Arama&quot; ekranları doğrudan K2 CORDIS katmanının türettiği <code className="font-mono font-bold bg-amber-100 px-1 rounded">cordis_partner_profile</code> tablosunu kullanır. K2 verisi aktarılmadığında M1 modülü &quot;K2 bağımlılığı kapalı&quot; uyarısı verir.
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
                <span>Resmî CORDIS Veri Kümesi Senkronizasyonu</span>
              </h3>
              <p className="text-muted text-xs mt-1">
                Ufuk Avrupa 2021-2027 çağrı sonuçları, ortaklık haritaları ve hibe rakamlarını güncellemek için senkronizasyonu başlatın.
              </p>
            </div>

            <button
              onClick={handleTriggerSync}
              disabled={isSyncing}
              className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-5 py-2.5 rounded-xl transition text-xs shadow-md shrink-0 flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Veriler İşleniyor...' : 'CORDIS Senkronizasyonunu Başlat'}</span>
            </button>
          </div>

          {syncResult && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-950 p-4 rounded-xl text-xs space-y-1">
              <span className="font-bold block">✓ CORDIS Veri Senkronizasyonu Başarıyla Tamamlandı!</span>
              <p className="font-mono text-[11px]">
                İşlenen Proje Sayısı: {syncResult.syncedProjectsCount} — Toplam Hibe: €{syncResult.totalEcContributionEUR?.toLocaleString()}
              </p>
            </div>
          )}

          <div className="space-y-3">
            <h3 className="font-bold text-sm text-ink">Ülke Bazlı Hibe & Proje Dağılımı (OLAP Aggregation)</h3>
            <div className="bg-surface border border-border rounded-2xl shadow-2xs overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-ground border-b border-border text-ink-2 font-bold uppercase tracking-wider text-[11px]">
                    <th className="p-3.5">Ülke</th>
                    <th className="p-3.5">Proje Sayısı</th>
                    <th className="p-3.5">Toplam Desteği (€)</th>
                    <th className="p-3.5 text-right">Proje Başı Ort. (€)</th>
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
                <span>Canlı CORDIS Delta API Çekimi (EU Funding Portal)</span>
              </h3>
              <p className="text-muted text-xs mt-1">
                AB Komisyonu portalından son 7 günde eklenen veya güncellenen yeni Ufuk Avrupa projelerini canlı olarak çekin.
              </p>
            </div>

            <button
              onClick={handleTriggerLiveDelta}
              disabled={isDeltaSyncing}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-5 py-2.5 rounded-xl transition text-xs shadow-md shrink-0 flex items-center gap-2"
            >
              <Radio className={`w-4 h-4 ${isDeltaSyncing ? 'animate-spin' : ''}`} />
              <span>{isDeltaSyncing ? 'Delta Çekiliyor...' : 'Canlı Delta API Çekimini Başlat (7 Gün)'}</span>
            </button>
          </div>

          {deltaResult && (
            <div className="bg-purple-50 border border-purple-200 text-purple-950 p-5 rounded-2xl text-xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-purple-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4.5 h-4.5 text-purple-700" />
                  Canlı Delta API Çekimi Başarıyla Tamamlandı!
                </span>
                <span className="font-mono text-[11px] text-purple-700 bg-purple-100 px-2.5 py-0.5 rounded-full font-bold">
                  {deltaResult.deltaCount} Yeni Delta Projesi İndekslendi
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                {deltaResult.ingestedProjects.map((p: any, idx: number) => (
                  <div key={idx} className="bg-surface border border-purple-100 p-4 rounded-xl space-y-2 shadow-2xs">
                    <div className="flex justify-between items-start">
                      <span className="font-bold text-ink font-mono text-xs">{p.acronym}</span>
                      <span className="font-mono text-xs text-emerald-700 font-bold">€{p.ecContributionEUR?.toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-ink-2 font-semibold">{p.title}</p>
                    <div className="flex items-center justify-between text-[11px] text-muted font-mono pt-1">
                      <span>Koordinatör: {p.coordinatorName} ({p.coordinatorCountry})</span>
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
                <span>Vector RAG Arama Testi (Cosine Similarity)</span>
              </h3>

              <form onSubmit={handleExecuteRagSearch} className="space-y-3 text-xs">
                <div>
                  <label className="font-semibold text-ink-2 block mb-1">Arama Sorgusu / Proje İhtiyacı</label>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Örn: Zero-emission battery thermal management"
                    required
                    className="w-full border border-border rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none bg-ground font-semibold"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <label className="font-semibold text-ink-2">Top-K Çıktı Sayısı:</label>
                    <select
                      value={topK}
                      onChange={(e) => setTopK(parseInt(e.target.value, 10))}
                      className="border border-border rounded-lg p-1.5 text-xs font-mono font-bold bg-ground"
                    >
                      <option value={3}>Top-3 Parça</option>
                      <option value={5}>Top-5 Parça</option>
                      <option value={10}>Top-10 Parça</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={isSearching}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-xl transition text-xs shadow-xs flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{isSearching ? 'Aranıyor...' : 'Vektör Araması Yap'}</span>
                  </button>
                </div>
              </form>
            </div>

            <div className="space-y-4">
              <h4 className="font-bold text-xs text-ink-2 uppercase tracking-wider">
                Vektör Benzerlik Sonuçları ({retrievedChunks.length})
              </h4>

              {retrievedChunks.map((chunk, idx) => (
                <div key={idx} className="bg-surface border border-border rounded-2xl p-5 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <span className="font-mono font-bold text-xs text-blue-900 bg-blue-50 px-2 py-0.5 rounded">
                      [Kaynak #{idx + 1}] {chunk.documentId}
                    </span>
                    <span className="font-mono font-bold text-xs text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                      Uyum: %{(chunk.score * 100).toFixed(1)}
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
              <span>LLM Fine-Tuning RAG Prompt Önizleme</span>
            </h3>

            <div className="bg-slate-950 text-slate-200 p-4 rounded-2xl border border-slate-800 shadow-sm space-y-3 font-mono text-[11px]">
              <span className="text-purple-400 font-bold block text-xs border-b border-slate-800 pb-2">
                {'// Formatted LLM Context Payload'}
              </span>

              {ragPrompt ? (
                <pre className="whitespace-pre-wrap leading-relaxed text-slate-300 max-h-[500px] overflow-y-auto">
                  {ragPrompt}
                </pre>
              ) : (
                <p className="text-muted text-xs italic">
                  Sol taraftan arama yaptığınızda LLM modeline gönderilen RAG bağlam metni burada görüntülenecektir.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
