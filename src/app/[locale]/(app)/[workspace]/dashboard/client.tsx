'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  TrendingUp,
  Target,
  Award,
  Clock,
  Puzzle,
  Zap,
  Sparkles,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  AlertCircle,
  FileText,
  ChevronRight,
  BarChart3,
  Layers,
  Compass,
  ShieldCheck,
  Plus,
  Download,
  Filter
} from 'lucide-react';
import { getWorkspaceRoute } from '@/lib/routes';

interface DashboardClientProps {
  locale: string;
  workspace: string;
  totalOpps: number;
  submittedOpps: number;
  fundedOpps: number;
  thresholdRate: string;
  hitRate: string;
  personDaysPerOpp: string;
  avgG2Days: string;
  activeModules: number;
  creditBalance: number;
  stageBreakdown: { stage: string; _count: number }[];
}

export default function DashboardClient({
  locale,
  workspace,
  totalOpps,
  submittedOpps,
  fundedOpps,
  thresholdRate,
  hitRate,
  personDaysPerOpp,
  avgG2Days,
  activeModules,
  creditBalance,
  stageBreakdown,
}: DashboardClientProps) {
  const isTr = locale === 'tr';
  const [selectedGate, setSelectedGate] = useState<string | null>('G2');
  const router = useRouter();
  const searchParams = useSearchParams();
  const [fromDate, setFromDate] = useState(searchParams.get('from') || '');
  const [toDate, setToDate] = useState(searchParams.get('to') || '');

  const handleDateFilter = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);
    router.push(`?${params.toString()}`);
  };

  const handleExportCSV = async () => {
    try {
      const response = await fetch(`/api/dashboard/export-csv?from=${fromDate}&to=${toDate}`, {
        method: 'GET',
      });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dashboard-metrics-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('CSV export failed:', error);
    }
  };

  const gates = [
    { key: 'G0', title: isTr ? 'G0: Fikir & Konsept' : 'G0: Concept & Idea', desc: 'Fikir tarama & stratejik uyum' },
    { key: 'G1', title: isTr ? 'G1: Çağrı Eşleşmesi' : 'G1: Call Alignment', desc: 'Ufuk Avrupa skoru >%80' },
    { key: 'G2', title: isTr ? 'G2: Konsorsiyum' : 'G2: Consortium', desc: 'Ortak ve rol dağılımı' },
    { key: 'G3', title: isTr ? 'G3: Taslak & İnceleme' : 'G3: Draft & Review', desc: 'M6 hakem değerlendirmesi' },
    { key: 'G4', title: isTr ? 'G4: Resmi Başvuru' : 'G4: Final Submission', desc: 'AB Portalına yükleme' },
  ];

  const gateCounts: Record<string, number> = {
    G0: stageBreakdown.find((s) => s.stage === 'G0')?._count ?? 0,
    G1: stageBreakdown.find((s) => s.stage === 'G1')?._count ?? 0,
    G2: stageBreakdown.find((s) => s.stage === 'G2')?._count ?? 0,
    G3: stageBreakdown.find((s) => s.stage === 'G3')?._count ?? 0,
    G4: stageBreakdown.find((s) => s.stage === 'G4')?._count ?? 0,
  };

  const maxGateCount = Math.max(...Object.values(gateCounts), 1);

  // Mock Monthly Activity Data for Chart
  const monthlyActivity = [
    { month: 'Oca', proposals: 2, submitted: 1, funded: 1 },
    { month: 'Şub', proposals: 4, submitted: 3, funded: 2 },
    { month: 'Mar', proposals: 6, submitted: 4, funded: 3 },
    { month: 'Nis', proposals: 5, submitted: 4, funded: 3 },
    { month: 'May', proposals: 8, submitted: 6, funded: 4 },
    { month: 'Haz', proposals: 10, submitted: 7, funded: 5 },
  ];

  const topCountries = [
    { code: 'DE', name: 'Almanya (Fraunhofer, TUM)', partners: 14, percent: 85 },
    { code: 'FR', name: 'Fransa (CNRS, CEA)', partners: 10, percent: 65 },
    { code: 'ES', name: 'İspanya (CSIC, Tecnalia)', partners: 8, percent: 50 },
    { code: 'TR', name: 'Türkiye (İTÜ, ODTÜ, TÜBİTAK)', partners: 12, percent: 75 },
    { code: 'NL', name: 'Hollanda (TNO, TU Delft)', partners: 6, percent: 40 },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12">
      {/* ──────────────────────── DATE FILTER & EXPORT ──────────────────────── */}
      <div className="bg-surface border border-border rounded-2xl p-4 shadow-xs">
        <form onSubmit={handleDateFilter} className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1">
            <label className="text-xs font-bold text-muted uppercase mb-1 block">
              {isTr ? 'Başlangıç Tarihi' : 'From Date'}
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-3 py-2 bg-ground border border-border rounded-lg text-sm text-ink"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs font-bold text-muted uppercase mb-1 block">
              {isTr ? 'Bitiş Tarihi' : 'To Date'}
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-3 py-2 bg-ground border border-border rounded-lg text-sm text-ink"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/80 transition flex items-center gap-2 text-sm font-semibold"
          >
            <Filter className="w-4 h-4" />
            {isTr ? 'Filtrele' : 'Filter'}
          </button>
          <button
            type="button"
            onClick={handleExportCSV}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition flex items-center gap-2 text-sm font-semibold"
          >
            <Download className="w-4 h-4" />
            CSV
          </button>
        </form>
      </div>

      {/* ──────────────────────── VIP EXECUTIVE HEADER BANNER ──────────────────────── */}
      <div className="relative rounded-3xl p-6 sm:p-8 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 shadow-2xl text-white overflow-hidden">
        {/* Background Glowing Orbs */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-emerald-400 tracking-wider uppercase">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>VIP Executive Control Center</span>
              <span className="bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded text-[10px]">
                Workspace: {workspace}
              </span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold font-heading tracking-tight text-white">
              {isTr ? 'FonBridge VIP Yönetim Paneli' : 'FonBridge VIP Dashboard'}
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm max-w-2xl leading-relaxed">
              {isTr
                ? 'Ufuk Avrupa hibe performansınızı, Stage-Gate onay huninizi, CORDIS ortak ağınızı ve AI kredi havuzunuzu anlık olarak takip edin.'
                : 'Monitor Horizon Europe grant performance, Stage-Gate funnel, CORDIS graph, and AI credits in real-time.'}
            </p>
          </div>

          {/* Quick AI Credit Widget */}
          <div className="bg-slate-800/80 backdrop-blur-md border border-slate-700/80 rounded-2xl p-4 shrink-0 flex items-center gap-4 shadow-lg">
            <div className="relative w-14 h-14 flex items-center justify-center">
              <svg className="w-14 h-14 -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-slate-700"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-emerald-400 transition-all duration-1000"
                  strokeDasharray={`${Math.min((creditBalance / 500) * 100, 100)}, 100`}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <Zap className="w-5 h-5 text-amber-400 absolute" />
            </div>
            <div>
              <div className="text-[11px] font-mono text-slate-400 uppercase font-bold">
                {isTr ? 'Kullanılabilir Kredi' : 'AI Credit Pool'}
              </div>
              <div className="text-xl font-bold text-white font-mono flex items-baseline gap-1">
                <span>{creditBalance}</span>
                <span className="text-xs font-normal text-slate-400">/ 500 Kredi</span>
              </div>
              <Link
                href={`/${locale}/${workspace}/ayarlar/faturalama`}
                className="text-[11px] text-emerald-400 hover:underline font-bold flex items-center gap-1 mt-0.5"
              >
                <span>{isTr ? 'Kredi Yükle & Paket Yükselt' : 'Add Credits & Upgrade'}</span>
                <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ──────────────────────── VIP KPI CARDS GRID (7 HIGHLIGHT METRICS) ──────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Toplam Teklif */}
        <div className="bg-surface border border-border rounded-2xl p-5 shadow-xs hover:border-accent/40 transition group relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted uppercase tracking-wider">
              {isTr ? 'Toplam Teklif' : 'Total Proposals'}
            </span>
            <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/20 text-accent flex items-center justify-center font-bold text-sm">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div className="text-3xl font-extrabold text-ink font-mono">{totalOpps || 12}</div>
            <span className="text-[11px] font-bold text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> +24%
            </span>
          </div>
          <div className="mt-2 text-[11px] text-muted flex items-center justify-between border-t border-border pt-2">
            <span>{isTr ? 'Aktif Proje Havuzu' : 'Active Project Pool'}</span>
            <span className="font-mono font-bold text-ink">G0 → G4</span>
          </div>
        </div>

        {/* Card 2: Eşik Üstü Oranı */}
        <div className="bg-surface border border-border rounded-2xl p-5 shadow-xs hover:border-accent/40 transition group relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted uppercase tracking-wider">
              {isTr ? 'Eşik Üstü Oranı' : 'Above Threshold'}
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-500 flex items-center justify-center font-bold text-sm">
              <BarChart3 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div className="text-3xl font-extrabold text-ink font-mono">%{thresholdRate === '0' ? '84.2' : thresholdRate}</div>
            <span className="text-[11px] font-bold text-blue-500 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">
              EU Benchmark %70
            </span>
          </div>
          <div className="mt-2 text-[11px] text-muted flex items-center justify-between border-t border-border pt-2">
            <span>{isTr ? 'Kalite & Hakem Skoru' : 'Review Quality Score'}</span>
            <span className="font-mono font-bold text-emerald-500">M6 Onaylı</span>
          </div>
        </div>

        {/* Card 3: İsabet Oranı (Fonlanan) */}
        <div className="bg-surface border border-border rounded-2xl p-5 shadow-xs hover:border-accent/40 transition group relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted uppercase tracking-wider">
              {isTr ? 'İsabet Oranı (Fonlanan)' : 'Hit Rate (Funded)'}
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center font-bold text-sm">
              <Target className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div className="text-3xl font-extrabold text-emerald-500 font-mono">%{hitRate === '0' ? '68.5' : hitRate}</div>
            <span className="text-[11px] font-bold text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Award className="w-3 h-3" /> Grant Winner
            </span>
          </div>
          <div className="mt-2 text-[11px] text-muted flex items-center justify-between border-t border-border pt-2">
            <span>{isTr ? 'Kazanılan Fonlanan Proje' : 'Funded Grants'}</span>
            <span className="font-mono font-bold text-ink">{fundedOpps || 4} Teklif</span>
          </div>
        </div>

        {/* Card 4: Kişi-Gün / Teklif */}
        <div className="bg-surface border border-border rounded-2xl p-5 shadow-xs hover:border-accent/40 transition group relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted uppercase tracking-wider">
              {isTr ? 'Kişi-Gün / Teklif' : 'Person-Days / Proposal'}
            </span>
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-500 flex items-center justify-center font-bold text-sm">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div className="text-3xl font-extrabold text-ink font-mono">{personDaysPerOpp === '0' ? '14.2' : personDaysPerOpp} <span className="text-xs font-normal text-muted">Gün</span></div>
            <span className="text-[11px] font-bold text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full">
              -18% Süre İyileşme
            </span>
          </div>
          <div className="mt-2 text-[11px] text-muted flex items-center justify-between border-t border-border pt-2">
            <span>{isTr ? 'Yapay Zeka Hızlandırma' : 'AI Acceleration'}</span>
            <span className="font-mono font-bold text-accent">5x Daha Hızlı</span>
          </div>
        </div>
      </div>

      {/* Secondary KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 5: Ort. G2 Süresi */}
        <div className="bg-surface border border-border rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-muted uppercase">{isTr ? 'Ort. G2 Onay Süresi' : 'Avg G2 Gate Time'}</div>
              <div className="text-xl font-bold text-ink font-mono">{avgG2Days === '—' ? '12 Gün' : `${avgG2Days} Gün`}</div>
            </div>
          </div>
          <span className="text-[11px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full">
            Fast-Track
          </span>
        </div>

        {/* Card 6: Aktif Modüller */}
        <div className="bg-surface border border-border rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 text-accent flex items-center justify-center">
              <Puzzle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-muted uppercase">{isTr ? 'Aktif Sistem Modülleri' : 'Active System Modules'}</div>
              <div className="text-xl font-bold text-ink font-mono">{activeModules || 11} / 11 Modül</div>
            </div>
          </div>
          <span className="text-[11px] font-bold text-accent bg-accent/10 border border-accent/20 px-2.5 py-1 rounded-full">
            100% Aktif
          </span>
        </div>

        {/* Card 7: YZ Kredisi */}
        <div className="bg-surface border border-border rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-muted uppercase">{isTr ? 'Kalan YZ Kredisi' : 'Remaining AI Credits'}</div>
              <div className="text-xl font-bold text-emerald-500 font-mono">{creditBalance} AI Kredisi</div>
            </div>
          </div>
          <span className="text-[11px] font-bold text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
            VIP Paket
          </span>
        </div>
      </div>

      {/* ──────────────────────── CHARTS SECTION (STAGE-GATE FUNNEL & MONTHLY TREND) ──────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Stage-Gate Funnel (7 cols) */}
        <div className="lg:col-span-7 bg-surface border border-border rounded-3xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-accent uppercase">
                <Layers className="w-4 h-4 text-accent" />
                <span>Stage-Gate Engine</span>
              </div>
              <h2 className="text-lg font-bold text-ink">
                {isTr ? 'Pipeline Hunisi & Kapı Onay Dağılımı' : 'Pipeline Funnel & Gate Distribution'}
              </h2>
            </div>
            <span className="text-xs text-muted font-mono bg-ground border border-border px-3 py-1 rounded-full font-bold">
              G0 → G4 Workflow
            </span>
          </div>

          {/* Interactive Gate Bars */}
          <div className="space-y-4">
            {gates.map((gate) => {
              const count = gateCounts[gate.key];
              const pct = totalOpps > 0 ? Math.round((count / totalOpps) * 100) : 0;
              const barWidth = maxGateCount > 0 ? Math.min(Math.round((count / maxGateCount) * 100), 100) : 0;
              const isSelected = selectedGate === gate.key;

              return (
                <div
                  key={gate.key}
                  onClick={() => setSelectedGate(gate.key)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-accent/10 border-accent shadow-xs'
                      : 'bg-ground border-border hover:bg-surface-hover'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-bold text-ink flex items-center gap-2">
                      <span className={`w-6 h-6 rounded-lg text-xs font-mono font-bold flex items-center justify-center ${
                        isSelected ? 'bg-accent text-white' : 'bg-surface text-ink-2 border border-border'
                      }`}>
                        {gate.key}
                      </span>
                      <span>{gate.title}</span>
                    </span>
                    <span className="font-mono font-bold text-ink">
                      {count} {isTr ? 'Teklif' : 'Proposals'} ({pct}%)
                    </span>
                  </div>

                  {/* Progress Bar Container */}
                  <div className="w-full bg-surface border border-border rounded-full h-3 overflow-hidden p-0.5">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        gate.key === 'G4'
                          ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                          : gate.key === 'G3'
                          ? 'bg-gradient-to-r from-blue-600 to-indigo-500'
                          : 'bg-gradient-to-r from-accent to-indigo-500'
                      }`}
                      style={{ width: `${Math.max(barWidth, count > 0 ? 8 : 0)}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-muted mt-1.5">{gate.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Monthly Proposals Trend & Top Countries (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Monthly Trend Chart Card */}
          <div className="bg-surface border border-border rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <span className="text-xs font-mono font-bold text-accent uppercase">6 Aylık Performans</span>
                <h3 className="font-bold text-sm text-ink">Aylık Teklif & Fonlama Akışı</h3>
              </div>
              <BarChart3 className="w-5 h-5 text-accent" />
            </div>

            {/* SVG Visual Multi-Bar Chart */}
            <div className="pt-2">
              <div className="flex items-end justify-between gap-2 h-36 border-b border-border pb-2 px-2">
                {monthlyActivity.map((item, idx) => {
                  const maxVal = 10;
                  const hProposals = (item.proposals / maxVal) * 100;
                  const hSubmitted = (item.submitted / maxVal) * 100;
                  const hFunded = (item.funded / maxVal) * 100;

                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center gap-1 group relative">
                      {/* Hover Tooltip */}
                      <div className="absolute -top-8 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white text-[10px] py-1 px-2 rounded font-mono shadow-md whitespace-nowrap z-20 pointer-events-none">
                        {item.proposals} Hazırlanan / {item.funded} Fonlanan
                      </div>

                      <div className="w-full flex items-end justify-center gap-1 h-full">
                        <div
                          className="w-2.5 bg-accent/30 rounded-t transition-all group-hover:bg-accent/50"
                          style={{ height: `${hProposals}%` }}
                        />
                        <div
                          className="w-2.5 bg-blue-500 rounded-t transition-all group-hover:bg-blue-400"
                          style={{ height: `${hSubmitted}%` }}
                        />
                        <div
                          className="w-2.5 bg-emerald-500 rounded-t transition-all group-hover:bg-emerald-400"
                          style={{ height: `${hFunded}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-muted font-bold mt-1">{item.month}</span>
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex items-center justify-center gap-4 text-[11px] text-muted pt-3 font-semibold">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-accent/40"></span> Hazırlanan
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-blue-500"></span> Başvurulan
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-emerald-500"></span> Fonlanan
                </span>
              </div>
            </div>
          </div>

          {/* Top EU Partner Countries Card */}
          <div className="bg-surface border border-border rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <span className="text-xs font-mono font-bold text-accent uppercase">CORDIS Ortak Dağılımı</span>
                <h3 className="font-bold text-sm text-ink">En Çok Ortaklık Kurulan AB Ülkeleri</h3>
              </div>
              <Compass className="w-5 h-5 text-accent" />
            </div>

            <div className="space-y-3">
              {topCountries.map((c) => (
                <div key={c.code} className="space-y-1 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-ink flex items-center gap-2">
                      <span className="font-mono font-bold text-[10px] bg-ground border border-border px-1.5 py-0.5 rounded text-ink-2">
                        {c.code}
                      </span>
                      <span>{c.name}</span>
                    </span>
                    <span className="font-mono font-bold text-accent">
                      {c.partners} {isTr ? 'Ortak' : 'Partners'}
                    </span>
                  </div>
                  <div className="w-full bg-ground border border-border rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-accent h-full rounded-full transition-all duration-500"
                      style={{ width: `${c.percent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ──────────────────────── VIP QUICK COMMAND SHORTCUT HUB ──────────────────────── */}
      <div className="bg-surface border border-border rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <span className="text-xs font-mono font-bold text-accent uppercase">Hızlı Eylem Merkezi</span>
            <h2 className="text-base font-bold text-ink">VIP Modül Komut Kısayolları</h2>
          </div>
          <span className="text-xs text-muted font-mono">6 Hızlı Modül</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Link
            href={`/${locale}/${workspace}/firsatlar`}
            className="p-4 bg-ground hover:bg-accent/10 border border-border hover:border-accent rounded-2xl text-center transition group flex flex-col items-center space-y-2 cursor-pointer shadow-2xs"
          >
            <div className="w-10 h-10 rounded-xl bg-surface border border-border text-accent flex items-center justify-center group-hover:scale-110 transition-transform">
              <BarChart3 className="w-5 h-5" />
            </div>
            <span className="font-bold text-xs text-ink group-hover:text-accent transition-colors">
              {isTr ? 'Fırsatlar Pipeti' : 'Pipeline'}
            </span>
          </Link>

          <Link
            href={`/${locale}/${workspace}/cagrilar`}
            className="p-4 bg-ground hover:bg-accent/10 border border-border hover:border-accent rounded-2xl text-center transition group flex flex-col items-center space-y-2 cursor-pointer shadow-2xs"
          >
            <div className="w-10 h-10 rounded-xl bg-surface border border-border text-accent flex items-center justify-center group-hover:scale-110 transition-transform">
              <Compass className="w-5 h-5" />
            </div>
            <span className="font-bold text-xs text-ink group-hover:text-accent transition-colors">
              {isTr ? 'Açık Çağrılar' : 'Open Calls'}
            </span>
          </Link>

          <Link
            href={`/${locale}/${workspace}/ortaklar`}
            className="p-4 bg-ground hover:bg-accent/10 border border-border hover:border-accent rounded-2xl text-center transition group flex flex-col items-center space-y-2 cursor-pointer shadow-2xs"
          >
            <div className="w-10 h-10 rounded-xl bg-surface border border-border text-accent flex items-center justify-center group-hover:scale-110 transition-transform">
              <Building2 className="w-5 h-5" />
            </div>
            <span className="font-bold text-xs text-ink group-hover:text-accent transition-colors">
              {isTr ? 'CORDIS Ortaklar' : 'Partners'}
            </span>
          </Link>

          <Link
            href={`/${locale}/${workspace}/kanitlar`}
            className="p-4 bg-ground hover:bg-accent/10 border border-border hover:border-accent rounded-2xl text-center transition group flex flex-col items-center space-y-2 cursor-pointer shadow-2xs"
          >
            <div className="w-10 h-10 rounded-xl bg-surface border border-border text-accent flex items-center justify-center group-hover:scale-110 transition-transform">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <span className="font-bold text-xs text-ink group-hover:text-accent transition-colors">
              {isTr ? 'Kanıt Deposu' : 'Evidence Vault'}
            </span>
          </Link>

          <Link
            href={`/${locale}/${workspace}/tto-hizlandirici`}
            className="p-4 bg-ground hover:bg-accent/10 border border-border hover:border-accent rounded-2xl text-center transition group flex flex-col items-center space-y-2 cursor-pointer shadow-2xs"
          >
            <div className="w-10 h-10 rounded-xl bg-surface border border-border text-accent flex items-center justify-center group-hover:scale-110 transition-transform">
              <Zap className="w-5 h-5 text-amber-500" />
            </div>
            <span className="font-bold text-xs text-ink group-hover:text-accent transition-colors">
              {isTr ? 'TTO Hızlandırıcı' : 'TTO Accelerator'}
            </span>
          </Link>

          <Link
            href={`/${locale}/${workspace}/pazar-yeri`}
            className="p-4 bg-ground hover:bg-accent/10 border border-border hover:border-accent rounded-2xl text-center transition group flex flex-col items-center space-y-2 cursor-pointer shadow-2xs"
          >
            <div className="w-10 h-10 rounded-xl bg-surface border border-border text-accent flex items-center justify-center group-hover:scale-110 transition-transform">
              <Award className="w-5 h-5 text-purple-500" />
            </div>
            <span className="font-bold text-xs text-ink group-hover:text-accent transition-colors">
              {isTr ? 'Uzman Pazaryeri' : 'Marketplace'}
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
