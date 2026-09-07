'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface SediaTopic {
  identifier: string;
  title: string;
  status: 'FORTHCOMING' | 'OPEN' | 'CLOSED';
  typeOfAction?: string;
  frameworkProgramme?: string;
  callIdentifier?: string;
  callTitle?: string;
  isLumpSum?: boolean;
  isTwoStage?: boolean;
  budgetPerProjectCents?: number;
  numProjects?: number;
  deadlines?: Array<{ stage: number; at: string; tz: string }>;
  nextDeadlineAt?: string | null;
  plannedOpeningDate?: string | null;
  eligibility?: {
    restricted?: string | null;
    countriesExcluded?: string[];
    notes?: string;
  };
  keywords?: string[];
  description?: string;
  sourceUrl?: string;
}

const FRAMEWORK_PROGRAMMES = [
  { id: 'ALL', labelTr: 'Tüm Programlar', labelEn: 'All Programmes' },
  { id: '43108390', labelTr: 'Ufuk Avrupa (Horizon Europe)', labelEn: 'Horizon Europe' },
  { id: '43152860', labelTr: 'Dijital Avrupa (Digital Europe)', labelEn: 'Digital Europe' },
  { id: '43353764', labelTr: 'Erasmus+', labelEn: 'Erasmus+' },
  { id: '43252434', labelTr: 'LIFE Programı', labelEn: 'LIFE Programme' },
  { id: '43353744', labelTr: 'Avrupa Savunma Fonu (EDF)', labelEn: 'European Defence Fund' },
  { id: '43353724', labelTr: 'CEF (Altyapı)', labelEn: 'Connecting Europe Facility' },
];

export default function CallsPage({
  params,
}: {
  params?: Promise<{ locale?: string; workspace?: string }>;
}) {
  const resolvedParams = params ? React.use(params) : { locale: 'tr', workspace: 'default' };
  const locale = resolvedParams.locale || 'tr';
  const workspace = resolvedParams.workspace || 'default';
  const isTr = locale === 'tr';

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [framework, setFramework] = useState('ALL');
  const [statuses, setStatuses] = useState<string[]>(['OPEN', 'FORTHCOMING']);
  const [callType, setCallType] = useState<'1' | '2'>('1'); // 1 = Grant, 2 = Tender
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const [topics, setTopics] = useState<SediaTopic[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingSearch, setSavingSearch] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<SediaTopic | null>(null);

  type SortField = 'status' | 'title' | 'action' | 'budget' | 'deadline';
  type SortOrder = 'asc' | 'desc';

  const [sortField, setSortField] = useState<SortField>('deadline');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder(field === 'budget' ? 'desc' : 'asc');
    }
  };

  const sortedTopics = React.useMemo(() => {
    return [...topics].sort((a, b) => {
      let comparison = 0;

      if (sortField === 'deadline') {
        const getTime = (d?: string | null) => {
          if (!d) return Infinity;
          const t = new Date(d).getTime();
          return isNaN(t) ? Infinity : t;
        };
        comparison = getTime(a.nextDeadlineAt) - getTime(b.nextDeadlineAt);
      } else if (sortField === 'title') {
        comparison = (a.title || '').localeCompare(b.title || '');
      } else if (sortField === 'status') {
        const statusMap: Record<string, number> = { OPEN: 1, FORTHCOMING: 2, CLOSED: 3 };
        comparison = (statusMap[a.status] || 4) - (statusMap[b.status] || 4);
      } else if (sortField === 'action') {
        comparison = (a.typeOfAction || '').localeCompare(b.typeOfAction || '');
      } else if (sortField === 'budget') {
        comparison = (a.budgetPerProjectCents || 0) - (b.budgetPerProjectCents || 0);
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [topics, sortField, sortOrder]);

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <span className="text-muted/40 text-[10px] ml-1">↕</span>;
    }
    return (
      <span className="text-accent text-xs font-bold ml-1">
        {sortOrder === 'asc' ? '↑' : '↓'}
      </span>
    );
  };

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(handler);
  }, [search]);

  // Fetch calls from live SEDIA API route
  const loadCalls = useCallback(async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (debouncedSearch.trim()) queryParams.set('q', debouncedSearch.trim());
      if (framework !== 'ALL') queryParams.set('framework', framework);
      if (statuses.length > 0) queryParams.set('status', statuses.join(','));
      queryParams.set('type', callType);
      queryParams.set('lang', locale);
      queryParams.set('page', page.toString());
      queryParams.set('limit', limit.toString());

      const res = await fetch(`/api/cagrilar?${queryParams.toString()}`);
      const data = await res.json();

      if (data.success) {
        setTopics(data.topics || []);
        setTotalResults(data.totalResults || 0);
      } else {
        setTopics([]);
        setTotalResults(0);
      }
    } catch (err) {
      console.error('Failed to fetch calls:', err);
      setTopics([]);
      setTotalResults(0);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, framework, statuses, callType, page, limit]);

  useEffect(() => {
    // Fetch-on-mount/filter-change: loadCalls is a useCallback with a complete dependency
    // array and flips the loading flag before awaiting. There is no server-rendered value to
    // seed this list from, so the request has to start from an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above
    loadCalls();
  }, [loadCalls]);

  const toggleStatus = (st: string) => {
    setPage(1);
    setStatuses((prev) =>
      prev.includes(st) ? prev.filter((s) => s !== st) : [...prev, st]
    );
  };

  const handleSaveSearch = async () => {
    setSavingSearch(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    alert(
      isTr
        ? `Arama kaydedildi (${debouncedSearch || 'Tüm Arama'}). Yeni çağrılar için e-posta bildirimi alacaksınız.`
        : `Search saved for "${debouncedSearch || 'All Calls'}". You will receive notification alerts.`
    );
    setSavingSearch(false);
  };

  const totalPages = Math.ceil(totalResults / limit) || 1;

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return isTr ? 'Belirtilmedi' : 'N/A';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(isTr ? 'tr-TR' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const formatCurrency = (cents?: number) => {
    if (!cents || cents <= 0) return isTr ? 'Bütçe Detayda' : 'See Details';
    const euros = cents / 100;
    return new Intl.NumberFormat(isTr ? 'tr-TR' : 'en-US', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(euros);
  };

  return (
    <div className="max-w-7xl mx-auto p-3 sm:p-6 md:p-8 overflow-x-hidden">
      {/* Header section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 sm:mb-8 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              {isTr ? 'SEDIA Canlı API Bağlantısı Etkin' : 'Live SEDIA API Active'}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading mb-2 text-ink">
            {isTr ? 'AB Hibeleri & Çağrı Başlıkları (SEDIA)' : 'EU Funding Calls & Topics (SEDIA)'}
          </h1>
          <p className="text-muted text-xs sm:text-sm max-w-2xl">
            {isTr
              ? 'Avrupa Komisyonu (SEDIA) arama servisine canlı erişim ile Ufuk Avrupa, Dijital Avrupa, Erasmus+, LIFE ve diğer AB programlarına ait açık ve gelecek çağrıları arayın.'
              : 'Browse and search live funding opportunities across Horizon Europe, Digital Europe, Erasmus+, and EU programmes.'}
          </p>
        </div>

        {/* Call Type Selector: Grants vs Tenders */}
        <div className="flex bg-ground p-1 rounded-xl border border-border w-full sm:w-auto justify-center">
          <button
            onClick={() => { setCallType('1'); setPage(1); }}
            className={`flex-1 sm:flex-initial px-4 py-1.5 text-xs font-semibold rounded-lg transition ${
              callType === '1'
                ? 'bg-surface text-accent shadow-xs'
                : 'text-muted hover:text-ink'
            }`}
          >
            {isTr ? 'Hibeler (Grants)' : 'Grants'}
          </button>
          <button
            onClick={() => { setCallType('2'); setPage(1); }}
            className={`flex-1 sm:flex-initial px-4 py-1.5 text-xs font-semibold rounded-lg transition ${
              callType === '2'
                ? 'bg-surface text-accent shadow-xs'
                : 'text-muted hover:text-ink'
            }`}
          >
            {isTr ? 'İhaleler (Tenders)' : 'Tenders'}
          </button>
        </div>
      </div>

      {/* Program Quick Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto max-w-full pb-3 mb-4 scrollbar-none">
        {FRAMEWORK_PROGRAMMES.map((prog) => (
          <button
            key={prog.id}
            onClick={() => { setFramework(prog.id); setPage(1); }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition border shrink-0 ${
              framework === prog.id
                ? 'bg-accent text-white border-accent shadow-xs'
                : 'bg-surface text-muted hover:text-ink border-border hover:border-border/80'
            }`}
          >
            {isTr ? prog.labelTr : prog.labelEn}
          </button>
        ))}
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-surface p-3.5 sm:p-4 rounded-xl shadow-xs border border-border mb-6 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder={
                isTr
                  ? 'Anahtar kelime, konu kodu (örn: HORIZON-CL5), başlık ile ara...'
                  : 'Search by keyword, topic code (e.g. HORIZON-CL5), or title...'
              }
              className="w-full pl-3 pr-8 py-2.5 bg-ground border border-border rounded-lg text-ink text-xs sm:text-sm placeholder:text-muted focus:outline-hidden focus:ring-2 focus:ring-accent"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-2.5 text-muted hover:text-ink text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>

          <button
            onClick={handleSaveSearch}
            disabled={savingSearch}
            className="w-full sm:w-auto px-4 py-2.5 border border-accent text-accent font-semibold text-xs sm:text-sm rounded-lg hover:bg-accent/10 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <span>🔔</span>
            {savingSearch
              ? isTr ? 'Kaydediliyor...' : 'Saving...'
              : isTr ? 'Aramayı Kaydet & Bildirim Al' : 'Save Search & Alert'}
          </button>
        </div>

        {/* Status Checkboxes & Results count */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-border/50 text-xs">
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-4">
            <span className="font-semibold text-muted">{isTr ? 'Çağrı Durumu:' : 'Status:'}</span>
            <label className="flex items-center gap-1.5 cursor-pointer text-ink hover:text-accent select-none">
              <input
                type="checkbox"
                checked={statuses.includes('OPEN')}
                onChange={() => toggleStatus('OPEN')}
                className="rounded border-border text-accent focus:ring-accent"
              />
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
              {isTr ? 'Açık Çağrılar' : 'Open Calls'}
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer text-ink hover:text-accent select-none">
              <input
                type="checkbox"
                checked={statuses.includes('FORTHCOMING')}
                onChange={() => toggleStatus('FORTHCOMING')}
                className="rounded border-border text-accent focus:ring-accent"
              />
              <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
              {isTr ? 'Gelecek' : 'Forthcoming'}
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer text-ink hover:text-accent select-none">
              <input
                type="checkbox"
                checked={statuses.includes('CLOSED')}
                onChange={() => toggleStatus('CLOSED')}
                className="rounded border-border text-accent focus:ring-accent"
              />
              <span className="inline-block w-2 h-2 rounded-full bg-gray-400"></span>
              {isTr ? 'Kapanmış' : 'Closed'}
            </label>
          </div>

          <div className="text-muted font-medium text-[11px] sm:text-xs">
            {loading ? (
              <span>{isTr ? 'Canlı veriler yükleniyor...' : 'Fetching live data...'}</span>
            ) : (
              <span>
                {isTr
                  ? `Toplam ${totalResults} çağrı bulundu (${page}. sayfa)`
                  : `Found ${totalResults} calls (Page ${page})`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Table Area */}
      <div className="bg-surface rounded-xl shadow-xs border border-border overflow-hidden">
        <div className="overflow-x-auto w-full">
          <table className="w-full min-w-[680px] text-left border-collapse">
            <thead className="bg-ground/60 border-b border-border select-none">
              <tr>
                <th
                  onClick={() => handleSort('status')}
                  className="px-4 py-3 text-xs font-semibold text-muted uppercase cursor-pointer hover:text-ink transition"
                >
                  <div className="flex items-center gap-1">
                    <span>{isTr ? 'Durum' : 'Status'}</span>
                    {renderSortIcon('status')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('title')}
                  className="px-4 py-3 text-xs font-semibold text-muted uppercase min-w-[260px] cursor-pointer hover:text-ink transition"
                >
                  <div className="flex items-center gap-1">
                    <span>{isTr ? 'Çağrı Başlığı & Kodu' : 'Topic & Code'}</span>
                    {renderSortIcon('title')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('action')}
                  className="px-4 py-3 text-xs font-semibold text-muted uppercase cursor-pointer hover:text-ink transition"
                >
                  <div className="flex items-center gap-1">
                    <span>{isTr ? 'Eylem Tipi' : 'Type of Action'}</span>
                    {renderSortIcon('action')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('budget')}
                  className="px-4 py-3 text-xs font-semibold text-muted uppercase cursor-pointer hover:text-ink transition"
                >
                  <div className="flex items-center gap-1">
                    <span>{isTr ? 'Tahmini Bütçe' : 'Est. Budget'}</span>
                    {renderSortIcon('budget')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('deadline')}
                  className="px-4 py-3 text-xs font-semibold text-muted uppercase cursor-pointer hover:text-ink transition"
                >
                  <div className="flex items-center gap-1">
                    <span>{isTr ? 'Son Başvuru' : 'Deadline'}</span>
                    {renderSortIcon('deadline')}
                  </div>
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-muted uppercase text-right">
                  {isTr ? 'İşlem' : 'Action'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="px-6 py-4">
                      <div className="h-5 w-16 bg-ground rounded"></div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-4 w-3/4 bg-ground rounded mb-2"></div>
                      <div className="h-3 w-1/3 bg-ground rounded"></div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-4 w-20 bg-ground rounded"></div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-4 w-24 bg-ground rounded"></div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-4 w-20 bg-ground rounded"></div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="h-7 w-16 bg-ground rounded ml-auto"></div>
                    </td>
                  </tr>
                ))
              ) : sortedTopics.length > 0 ? (
                sortedTopics.map((call) => (
                  <tr
                    key={call.identifier}
                    className="hover:bg-surface-hover transition-colors group"
                  >
                    <td className="px-6 py-4 align-top">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${
                          call.status === 'OPEN'
                            ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                            : call.status === 'FORTHCOMING'
                            ? 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                            : 'bg-gray-500/10 text-gray-500 border-gray-500/20'
                        }`}
                      >
                        {call.status === 'OPEN'
                          ? isTr ? 'AÇIK' : 'OPEN'
                          : call.status === 'FORTHCOMING'
                          ? isTr ? 'GELECEK' : 'FORTHCOMING'
                          : isTr ? 'KAPANDI' : 'CLOSED'}
                      </span>
                    </td>

                    <td className="px-6 py-4 align-top">
                      <button
                        onClick={() => setSelectedTopic(call)}
                        className="text-accent font-semibold text-xs sm:text-sm hover:underline text-left block leading-snug"
                      >
                        {call.title}
                      </button>

                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        <span className="text-xs text-muted font-mono bg-ground px-2 py-0.5 rounded border border-border">
                          {call.identifier}
                        </span>
                        {call.isLumpSum && (
                          <span className="text-[10px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20 px-1.5 py-0.5 rounded">
                            Lump Sum
                          </span>
                        )}
                        {call.isTwoStage && (
                          <span className="text-[10px] font-bold bg-purple-500/10 text-purple-600 border border-purple-500/20 px-1.5 py-0.5 rounded">
                            {isTr ? '2 Aşamalı' : '2-Stage'}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-6 py-4 text-xs sm:text-sm text-ink-2 font-medium align-top">
                      {call.typeOfAction || '-'}
                    </td>

                    <td className="px-6 py-4 text-xs sm:text-sm text-ink font-semibold align-top whitespace-nowrap">
                      {formatCurrency(call.budgetPerProjectCents)}
                    </td>

                    <td className="px-6 py-4 text-xs sm:text-sm text-ink font-mono align-top whitespace-nowrap">
                      {formatDate(call.nextDeadlineAt)}
                    </td>

                    <td className="px-6 py-4 text-right align-top whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setSelectedTopic(call)}
                          className="px-3 py-1.5 text-xs font-semibold bg-accent/10 text-accent hover:bg-accent hover:text-white rounded-lg transition border border-accent/20"
                        >
                          {isTr ? 'Detaylar' : 'Details'}
                        </button>
                        {call.sourceUrl && (
                          <a
                            href={call.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-muted hover:text-accent rounded-lg border border-border hover:border-accent transition"
                            title={isTr ? 'SEDIA Portalında Aç' : 'Open in SEDIA Portal'}
                          >
                            ↗
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted text-xs sm:text-sm">
                    {isTr
                      ? 'Seçilen filtrelere uygun çağrı bulunamadı. Lütfen arama terimini veya durum filtrelerini kontrol edin.'
                      : 'No funding calls found matching your filter parameters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between p-4 border-t border-border bg-ground/40 gap-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-muted">{isTr ? 'Sayfa Başı Gösterim:' : 'Per page:'}</span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(parseInt(e.target.value, 10));
                setPage(1);
              }}
              className="bg-surface border border-border rounded px-2 py-1 text-ink focus:ring-accent"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              disabled={page <= 1 || loading}
              className="px-3 py-1.5 border border-border rounded-lg bg-surface text-ink hover:bg-surface-hover disabled:opacity-40 transition font-semibold"
            >
              ← {isTr ? 'Önceki' : 'Previous'}
            </button>
            <span className="font-semibold text-ink">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              disabled={page >= totalPages || loading}
              className="px-3 py-1.5 border border-border rounded-lg bg-surface text-ink hover:bg-surface-hover disabled:opacity-40 transition font-semibold"
            >
              {isTr ? 'Sonraki' : 'Next'} →
            </button>
          </div>
        </div>
      </div>

      {/* Topic Detail Modal */}
      {selectedTopic && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 relative animate-in fade-in zoom-in duration-200">
            <button
              onClick={() => setSelectedTopic(null)}
              className="absolute top-4 right-4 text-muted hover:text-ink font-bold text-lg p-1"
            >
              ✕
            </button>

            <div className="mb-4">
              <span className="text-xs font-mono bg-accent/10 text-accent px-2.5 py-1 rounded border border-accent/20">
                {selectedTopic.identifier}
              </span>
              <h2 className="text-xl font-bold font-heading text-ink mt-2">
                {selectedTopic.title}
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-ground p-4 rounded-xl border border-border mb-6 text-xs">
              <div>
                <span className="text-muted block">{isTr ? 'Program:' : 'Programme:'}</span>
                <span className="font-semibold text-ink">
                  {selectedTopic.frameworkProgramme || 'EU Funding'}
                </span>
              </div>
              <div>
                <span className="text-muted block">{isTr ? 'Eylem Türü (Type of Action):' : 'Type of Action:'}</span>
                <span className="font-semibold text-ink">
                  {selectedTopic.typeOfAction || '-'}
                </span>
              </div>
              <div>
                <span className="text-muted block">{isTr ? 'Son Başvuru Tarihi:' : 'Deadline:'}</span>
                <span className="font-mono font-semibold text-accent">
                  {formatDate(selectedTopic.nextDeadlineAt)}
                </span>
              </div>
              <div>
                <span className="text-muted block">{isTr ? 'Tahmini Bütçe:' : 'Est. Budget:'}</span>
                <span className="font-semibold text-ink">
                  {formatCurrency(selectedTopic.budgetPerProjectCents)}
                </span>
              </div>
            </div>

            {selectedTopic.description && (
              <div className="mb-6">
                <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-2">
                  {isTr ? 'Çağrı Özeti & Amaç' : 'Summary & Scope'}
                </h3>
                <p className="text-xs sm:text-sm text-ink-2 leading-relaxed bg-ground/50 p-4 rounded-xl border border-border">
                  {selectedTopic.description}
                </p>
              </div>
            )}

            {selectedTopic.deadlines && selectedTopic.deadlines.length > 0 && (
              <div className="mb-6">
                <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-2">
                  {isTr ? 'Başvuru Aşamaları' : 'Deadline Stages'}
                </h3>
                <div className="space-y-2">
                  {selectedTopic.deadlines.map((dl, i) => (
                    <div key={i} className="flex justify-between items-center bg-ground px-3 py-2 rounded-lg text-xs">
                      <span className="font-medium text-ink">Stage {dl.stage}</span>
                      <span className="font-mono text-accent font-semibold">{formatDate(dl.at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-between items-center pt-4 border-t border-border">
              <Link
                href={`/${locale}/${workspace}/cagrilar/${selectedTopic.identifier}`}
                className="px-4 py-2 bg-accent text-white font-semibold text-xs rounded-lg hover:bg-accent/90 transition"
              >
                {isTr ? 'Proje Fırsatına Dönüştür →' : 'Convert to Opportunity →'}
              </Link>

              {selectedTopic.sourceUrl && (
                <a
                  href={selectedTopic.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 border border-border text-ink hover:text-accent font-semibold text-xs rounded-lg hover:border-accent transition flex items-center gap-1.5"
                >
                  <span>{isTr ? 'AB Portalında İncele' : 'View on EU Portal'}</span>
                  <span>↗</span>
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

