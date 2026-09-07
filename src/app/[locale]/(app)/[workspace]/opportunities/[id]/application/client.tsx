'use client';

import React, { useState } from 'react';
import { 
  FileCheck, 
  Euro, 
  Calendar, 
  Layers, 
  ExternalLink, 
  Plus, 
  Copy, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Users, 
  BarChart3, 
  FileText, 
  Sparkles,
  Check,
  Link as LinkIcon
} from 'lucide-react';
import { addBudgetLine, addWorkPackage, calculateLumpSumBudget } from '@/modules/m11/server/actions';
import { PartBCollaborativeEditor } from '@/modules/m11/ui/PartBCollaborativeEditor';
import type { BudgetLine, PartContent, WorkPackageItem } from '@/modules/m11/types';

export interface ApplicationPartItem {
  id: string;
  part: 'PART_A' | 'PART_B' | string;
  magicToken?: string | null;
  content?: PartContent;
}

interface ApplicationClientProps {
  opportunityId: string;
  tenantId: string;
  opportunityTitle: string;
  partA?: ApplicationPartItem | null;
  partB?: ApplicationPartItem | null;
}

export function ApplicationClient({
  opportunityId,
  tenantId,
  opportunityTitle,
  partA,
  partB,
}: ApplicationClientProps) {
  const [activeTab, setActiveTab] = useState<'PART_A' | 'PART_B_EDITOR' | 'GANTT' | 'CHECKLIST'>('PART_B_EDITOR');
  const [copiedToken, setCopiedToken] = useState(false);

  // Budget form state
  const [partnerName, setPartnerName] = useState('');
  const [personMonths, setPersonMonths] = useState(12);
  const [countryCoef, setCountryCoef] = useState('1.0');
  const [subcontracting, setSubcontracting] = useState('0');
  const [travel, setTravel] = useState('2500');
  const [isAddingBudget, setIsAddingBudget] = useState(false);

  // Work Package form state
  const [wpCode, setWpCode] = useState('WP3');
  const [wpTitle, setWpTitle] = useState('Prototyping & Pilot Testing');
  const [wpLead, setWpLead] = useState('Fraunhofer Institute');
  const [wpStart, setWpStart] = useState(7);
  const [wpEnd, setWpEnd] = useState(24);
  const [wpDeliverable, setWpDeliverable] = useState('D3.1 Thermal Pilot Prototype');
  const [isAddingWp, setIsAddingWp] = useState(false);

  // Dynamic budget lines state
  const initialBudget: BudgetLine[] = (partA?.content)?.budget || [
    { partnerName: 'Demo SME Consultancy (TR)', personMonths: 24, countryCoefficient: 1.0, subcontractingCost: 0, travelCost: 0, requestedTotal: 165000 },
    { partnerName: 'Fraunhofer Institute (DE)', personMonths: 36, countryCoefficient: 1.0, subcontractingCost: 0, travelCost: 0, requestedTotal: 247500 },
  ];
  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>(initialBudget);

  // Dynamic Work Packages state
  const initialWps: WorkPackageItem[] = (partB?.content)?.workPackages || [
    { code: 'WP1', title: 'Management & Coordination', leadPartner: 'Demo SME Consultancy', startMonth: 1, endMonth: 36, deliverables: ['D1.1 Data Management Plan'] },
    { code: 'WP2', title: 'System Requirements & Architecture', leadPartner: 'METU TTO', startMonth: 1, endMonth: 12, deliverables: ['D2.1 Technical Specs'] },
    { code: 'WP3', title: 'Prototyping & Pilot Testing', leadPartner: 'Fraunhofer Institute', startMonth: 7, endMonth: 24, deliverables: ['D3.1 Thermal Pilot'] },
    { code: 'WP4', title: 'Dissemination & Exploitation', leadPartner: 'Siemens AG', startMonth: 1, endMonth: 36, deliverables: ['D4.1 DEC Plan'] },
  ];
  const [workPackages, setWorkPackages] = useState<WorkPackageItem[]>(initialWps);

  const handleCopyMagicLink = () => {
    if (partA?.magicToken) {
      const url = `${window.location.origin}/portal/partner/${partA.magicToken}`;
      navigator.clipboard.writeText(url);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  const handleAddBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partnerName.trim() || !partA) return;

    setIsAddingBudget(true);
    try {
      const coef = parseFloat(countryCoef);
      const sub = parseFloat(subcontracting);
      const trv = parseFloat(travel);
      const total = await calculateLumpSumBudget(personMonths, coef, sub, trv);

      await addBudgetLine(partA.id, partnerName.trim(), personMonths, coef, sub, trv);

      setBudgetLines((prev) => [
        ...prev,
        {
          partnerName: partnerName.trim(),
          personMonths,
          countryCoefficient: coef,
          subcontractingCost: sub,
          travelCost: trv,
          requestedTotal: total,
        }
      ]);

      setPartnerName('');
      setPersonMonths(12);
    } catch (err) {
      console.error('Error adding budget line:', err);
    } finally {
      setIsAddingBudget(false);
    }
  };

  const handleAddWp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partB) return;

    setIsAddingWp(true);
    try {
      await addWorkPackage(partB.id, {
        code: wpCode,
        title: wpTitle,
        leadPartner: wpLead,
        startMonth: wpStart,
        endMonth: wpEnd,
        deliverables: [wpDeliverable],
      });

      setWorkPackages((prev) => [
        ...prev,
        {
          code: wpCode,
          title: wpTitle,
          leadPartner: wpLead,
          startMonth: wpStart,
          endMonth: wpEnd,
          deliverables: [wpDeliverable],
        }
      ]);
    } catch (err) {
      console.error('Error adding work package:', err);
    } finally {
      setIsAddingWp(false);
    }
  };

  // Budget calculations
  const totalPersonMonths = budgetLines.reduce((acc, b) => acc + (b.personMonths || 0), 0);
  const totalRequestedBudget = budgetLines.reduce((acc, b) => acc + (b.requestedTotal || 0), 0);

  return (
    <div className="space-y-6">
      {/* ──────────────────────── HEADER BANNER ──────────────────────── */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-blue-400 font-semibold tracking-wider uppercase mb-1">
              <FileCheck className="w-4 h-4 text-blue-400" />
              <span>Modül 11 — Full Application Production</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight font-heading text-white">
              Part A & Part B Başvuru Üretim Paneli
            </h1>
            <p className="text-muted text-xs md:text-sm mt-1 max-w-2xl">
              Teklif: <strong className="text-slate-200">{opportunityTitle}</strong>
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <a
              href="/api/documents/export?type=PART_B&format=docx&title=Part_B_Technical_Proposal"
              target="_blank"
              rel="noreferrer"
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3.5 py-1.5 rounded-xl transition text-xs shadow-md flex items-center gap-1.5"
            >
              <span>Part B (.docx) Şablonu İndir</span>
            </a>

            <span className="text-xs bg-slate-800 border border-slate-700 text-emerald-400 px-3 py-1.5 rounded-full font-mono font-bold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Part A & B Aktif</span>
            </span>
          </div>
        </div>

        {/* Top Summary Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-slate-800 text-xs">
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5">
            <span className="text-muted block text-[11px]">Toplam Konsorsiyum Eforu</span>
            <span className="text-xl font-bold text-white font-mono mt-0.5 block">
              {totalPersonMonths} <span className="text-xs text-muted">Kişi-Ay (PM)</span>
            </span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5">
            <span className="text-muted block text-[11px]">Toplam Bütçe (Lump Sum)</span>
            <span className="text-xl font-bold text-emerald-400 font-mono mt-0.5 block">
              €{totalRequestedBudget.toLocaleString()}
            </span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5">
            <span className="text-muted block text-[11px]">İş Paketi Sayısı</span>
            <span className="text-xl font-bold text-white font-mono mt-0.5 block">
              {workPackages.length} <span className="text-xs text-muted">İş Paketi (WP)</span>
            </span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5">
            <span className="text-muted block text-[11px]">Sayfa Limiti Kontrolü</span>
            <span className="text-xs font-bold font-mono mt-1 flex items-center gap-1.5 text-blue-300">
              <FileText className="w-3.5 h-3.5 text-blue-400" />
              RIA/IA Limit: 45 Sayfa
            </span>
          </div>
        </div>
      </div>

      {/* ──────────────────────── NAVIGATION TABS ──────────────────────── */}
      <div className="flex border-b border-border gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('PART_B_EDITOR')}
          className={`px-4 py-2.5 font-semibold text-xs rounded-t-xl transition flex items-center gap-2 border-b-2 -mb-px shrink-0 ${
            activeTab === 'PART_B_EDITOR'
              ? 'border-blue-600 text-blue-600 bg-blue-50/50'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          <Sparkles className="w-4 h-4 text-blue-600" />
          <span>Part B (Çoklu Yazar İşbirlikçi Metin Editörü)</span>
        </button>

        <button
          onClick={() => setActiveTab('PART_A')}
          className={`px-4 py-2.5 font-semibold text-xs rounded-t-xl transition flex items-center gap-2 border-b-2 -mb-px shrink-0 ${
            activeTab === 'PART_A'
              ? 'border-blue-600 text-blue-600 bg-blue-50/50'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          <Euro className="w-4 h-4" />
          <span>Part A (İdari & Lump-Sum Bütçe)</span>
        </button>

        <button
          onClick={() => setActiveTab('GANTT')}
          className={`px-4 py-2.5 font-semibold text-xs rounded-t-xl transition flex items-center gap-2 border-b-2 -mb-px shrink-0 ${
            activeTab === 'GANTT'
              ? 'border-blue-600 text-blue-600 bg-blue-50/50'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Part B (Gantt Şeması & İş Paketleri)</span>
        </button>

        <button
          onClick={() => setActiveTab('CHECKLIST')}
          className={`px-4 py-2.5 font-semibold text-xs rounded-t-xl transition flex items-center gap-2 border-b-2 -mb-px shrink-0 ${
            activeTab === 'CHECKLIST'
              ? 'border-blue-600 text-blue-600 bg-blue-50/50'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          <FileCheck className="w-4 h-4" />
          <span>Gönderim Kontrol Listesi</span>
        </button>
      </div>

      {/* ──────────────────────── TAB 0: PART B COLLABORATIVE EDITOR ──────────────────────── */}
      {activeTab === 'PART_B_EDITOR' && (
        <PartBCollaborativeEditor
          partId={partB?.id || 'part-b-1'}
          opportunityTitle={opportunityTitle}
          tenantId={tenantId}
          initialSections={(partB?.content)?.sections}
          initialRevisions={(partB?.content)?.revisions}
          initialComments={(partB?.content)?.comments}
        />
      )}

      {/* ──────────────────────── TAB 1: PART A (BUDGET & PORTAL) ──────────────────────── */}
      {activeTab === 'PART_A' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Partner Portal Link & Budget Add Form (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            {/* External Partner Portal Link Card */}
            {partA?.magicToken && (
              <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white rounded-2xl p-5 shadow-sm border border-indigo-800 space-y-3">
                <div className="flex items-center gap-2">
                  <LinkIcon className="w-4 h-4 text-indigo-400" />
                  <h3 className="font-bold text-sm text-white">Ortak Katkı Portalı (Magic Link)</h3>
                </div>
                <p className="text-[11px] text-slate-300">
                  Dış konsorsiyum ortakları şifre gerekmeksizin aşağıdaki güvenli bağlantıyla kendi kurum ve bütçe verilerini girebilir:
                </p>

                <div className="flex items-center gap-2 bg-slate-950/80 p-2.5 rounded-xl border border-indigo-950 font-mono text-xs text-indigo-300 overflow-hidden">
                  <span className="truncate flex-1">
                    {typeof window !== 'undefined' ? window.location.origin : ''}/portal/partner/{partA.magicToken}
                  </span>
                  <button
                    onClick={handleCopyMagicLink}
                    className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition text-[11px] font-semibold shrink-0 flex items-center gap-1"
                  >
                    {copiedToken ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedToken ? 'Kopyalandı' : 'Kopyala'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Lump-Sum Budget Add Line Form */}
            <div className="bg-surface rounded-2xl p-5 border border-border shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b pb-3">
                <Euro className="w-4 h-4 text-blue-600" />
                <h3 className="font-bold text-sm text-ink">Lump-Sum Bütçe Kalemi Ekle</h3>
              </div>

              <form onSubmit={handleAddBudget} className="space-y-3 text-xs">
                <div>
                  <label className="font-semibold text-ink-2 block mb-1">Ortak Kurum Adı</label>
                  <input
                    type="text"
                    value={partnerName}
                    onChange={(e) => setPartnerName(e.target.value)}
                    placeholder="Örn: METU TTO, Fraunhofer Institute"
                    required
                    className="w-full border border-border rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none bg-ground"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-ink-2 block mb-1">Efor (Person-Months)</label>
                    <input
                      type="number"
                      min="1"
                      value={personMonths}
                      onChange={(e) => setPersonMonths(parseInt(e.target.value, 10) || 1)}
                      className="w-full border border-border rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none bg-ground font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-ink-2 block mb-1">Ülke Katsayısı</label>
                    <select
                      value={countryCoef}
                      onChange={(e) => setCountryCoef(e.target.value)}
                      className="w-full border border-border rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none bg-ground font-mono"
                    >
                      <option value="1.0">1.00 (Standard EU)</option>
                      <option value="0.85">0.85 (Türkiye / SEE)</option>
                      <option value="1.2">1.20 (High-Cost North)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-ink-2 block mb-1">Seyahat (€)</label>
                    <input
                      type="number"
                      value={travel}
                      onChange={(e) => setTravel(e.target.value)}
                      className="w-full border border-border rounded-xl p-2 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none bg-ground font-mono"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-ink-2 block mb-1">Alt Yüklenici (€)</label>
                    <input
                      type="number"
                      value={subcontracting}
                      onChange={(e) => setSubcontracting(e.target.value)}
                      className="w-full border border-border rounded-xl p-2 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none bg-ground font-mono"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isAddingBudget}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2.5 rounded-xl transition shadow-xs flex items-center justify-center gap-2 text-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isAddingBudget ? 'Hesaplanıyor...' : 'Bütçe Kalemini Kaydet'}</span>
                </button>
              </form>
            </div>
          </div>

          {/* Right Column: Partner Lump-Sum Budget Breakdown Table (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <h3 className="font-bold text-sm text-ink flex items-center justify-between">
              <span>Konsorsiyum Lump-Sum Bütçe Tablosu</span>
              <span className="text-xs font-mono font-bold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                Standart %25 Genel Gider Dahil
              </span>
            </h3>

            <div className="bg-surface border border-border rounded-2xl shadow-2xs overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-ground border-b border-border text-ink-2 font-bold uppercase tracking-wider text-[11px]">
                    <th className="p-3.5">Ortak Kurum</th>
                    <th className="p-3.5">Kişi-Ay (PM)</th>
                    <th className="p-3.5">Ülke Kat.</th>
                    <th className="p-3.5 text-right">Talep Edilen (€)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {budgetLines.map((b, idx) => (
                    <tr key={idx} className="hover:bg-ground/80 transition-colors">
                      <td className="p-3.5 font-bold text-ink">{b.partnerName}</td>
                      <td className="p-3.5 font-mono text-ink-2">{b.personMonths} PM</td>
                      <td className="p-3.5 font-mono text-muted">{b.countryCoefficient || 1.0}</td>
                      <td className="p-3.5 text-right font-mono font-bold text-ink">
                        €{Number(b.requestedTotal).toLocaleString()}
                      </td>
                    </tr>
                  ))}

                  <tr className="bg-slate-900 text-white font-bold">
                    <td className="p-3.5">TOPLAM KONSORSİYUM</td>
                    <td className="p-3.5 font-mono">{totalPersonMonths} PM</td>
                    <td className="p-3.5">-</td>
                    <td className="p-3.5 text-right font-mono text-emerald-400 text-sm">
                      €{totalRequestedBudget.toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────── TAB 2: PART B GANTT CHART & WORK PACKAGES ──────────────────────── */}
      {activeTab === 'GANTT' && (
        <div className="space-y-6">
          {/* Gantt Chart Timeline Header */}
          <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <h3 className="font-bold text-base text-ink flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-blue-600" />
                  <span>Proje Gantt Şeması & İş Paketi Zaman Çizelgesi (M1 - M36)</span>
                </h3>
                <p className="text-muted text-xs mt-1">
                  Horizon Europe Part B Section 3.1 İş Paketi (WP) başlangıç ve bitiş ayları.
                </p>
              </div>
            </div>

            {/* Visual Gantt Matrix */}
            <div className="space-y-3 pt-2">
              {/* Timeline Month Headers */}
              <div className="grid grid-cols-12 gap-1 text-center font-mono text-[10px] font-bold text-muted bg-surface-hover p-2 rounded-xl">
                <span>M1-3</span>
                <span>M4-6</span>
                <span>M7-9</span>
                <span>M10-12</span>
                <span>M13-15</span>
                <span>M16-18</span>
                <span>M19-21</span>
                <span>M22-24</span>
                <span>M25-27</span>
                <span>M28-30</span>
                <span>M31-33</span>
                <span>M34-36</span>
              </div>

              {/* Work Package Bar Rows */}
              {workPackages.map((wp, idx) => {
                const startCol = Math.ceil(wp.startMonth / 3);
                const endCol = Math.ceil(wp.endMonth / 3);
                const colSpan = Math.max(1, endCol - startCol + 1);

                return (
                  <div key={idx} className="bg-ground border border-border p-3 rounded-xl space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2 font-bold text-ink">
                        <span className="bg-blue-600 text-white text-[10px] font-mono px-2 py-0.5 rounded">
                          {wp.code}
                        </span>
                        <span>{wp.title}</span>
                      </div>
                      <span className="text-muted text-[11px] font-mono">
                        Lider: <strong>{wp.leadPartner}</strong> (Ay M{wp.startMonth} - M{wp.endMonth})
                      </span>
                    </div>

                    {/* Gantt Bar Grid */}
                    <div className="grid grid-cols-12 gap-1 bg-slate-200/60 p-1 rounded-lg">
                      <div
                        style={{ gridColumnStart: startCol, gridColumnEnd: startCol + colSpan }}
                        className="bg-gradient-to-r from-blue-500 to-indigo-600 h-6 rounded-md shadow-xs flex items-center justify-center text-white text-[10px] font-bold font-mono px-2 truncate"
                      >
                        {wp.code}: M{wp.startMonth}-M{wp.endMonth}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Add Work Package Form */}
          <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm space-y-4 max-w-xl">
            <h3 className="font-bold text-sm text-ink flex items-center gap-2 border-b pb-3">
              <Plus className="w-4 h-4 text-blue-600" />
              <span>Yeni İş Paketi (WP) Ekle</span>
            </h3>

            <form onSubmit={handleAddWp} className="space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-semibold text-ink-2 block mb-1">WP Kodu</label>
                  <input
                    type="text"
                    value={wpCode}
                    onChange={(e) => setWpCode(e.target.value)}
                    required
                    className="w-full border border-border rounded-xl p-2 text-xs font-mono font-bold bg-ground"
                  />
                </div>
                <div className="col-span-2">
                  <label className="font-semibold text-ink-2 block mb-1">WP Başlığı</label>
                  <input
                    type="text"
                    value={wpTitle}
                    onChange={(e) => setWpTitle(e.target.value)}
                    required
                    className="w-full border border-border rounded-xl p-2 text-xs bg-ground"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-semibold text-ink-2 block mb-1">Lider Kurum</label>
                  <input
                    type="text"
                    value={wpLead}
                    onChange={(e) => setWpLead(e.target.value)}
                    required
                    className="w-full border border-border rounded-xl p-2 text-xs bg-ground"
                  />
                </div>

                <div>
                  <label className="font-semibold text-ink-2 block mb-1">Başlangıç (Ay)</label>
                  <input
                    type="number"
                    min="1"
                    max="36"
                    value={wpStart}
                    onChange={(e) => setWpStart(parseInt(e.target.value, 10) || 1)}
                    className="w-full border border-border rounded-xl p-2 text-xs font-mono bg-ground"
                  />
                </div>

                <div>
                  <label className="font-semibold text-ink-2 block mb-1">Bitiş (Ay)</label>
                  <input
                    type="number"
                    min="1"
                    max="36"
                    value={wpEnd}
                    onChange={(e) => setWpEnd(parseInt(e.target.value, 10) || 36)}
                    className="w-full border border-border rounded-xl p-2 text-xs font-mono bg-ground"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isAddingWp}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2.5 rounded-xl transition shadow-xs flex items-center justify-center gap-2 text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>İş Paketini Gantt Şemasına Ekle</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ──────────────────────── TAB 3: SUBMISSION CHECKLIST ──────────────────────── */}
      {activeTab === 'CHECKLIST' && (
        <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm space-y-6">
          <div>
            <h2 className="text-base font-bold text-ink flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-blue-600" />
              <span>Resmî Gönderim Öncesi Kontrol Listesi (Submission Readiness)</span>
            </h2>
            <p className="text-muted text-xs mt-1">
              European Funding & Tenders portalına yükleme yapmadan önce zorunlu kriterleri doğrulayın.
            </p>
          </div>

          <div className="space-y-3 text-xs">
            {[
              { title: 'Part A İdari Kurum Formları', desc: 'Tüm konsorsiyum ortaklarının PIC numaraları ve finansal temsilcileri doğrulandı.', status: true },
              { title: 'Part B Sayfa Limiti Uyum Kontrolü', desc: 'RIA/IA projeleri için azami 45 sayfa sınırı aşılmadı (Mevcut: ~38 Sayfa).', status: true },
              { title: 'Cinsiyet Eşitliği Planı (Gender Equality Plan - GEP)', desc: 'Kamu ve üniversite ortaklarının onaylı GEP belgeleri yüklendi.', status: true },
              { title: 'Açık Bilim ve Veri Yönetimi Planı (FAIR Data)', desc: 'Part B 1.2 bölümünde açık erişim yayıncılık taahhüt edildi.', status: true },
              { title: 'Fikri Mülkiyet (IP) & Arka Plan Hakları', desc: 'Tüm ortakların arka plan patent ve yazılım hakları tanımlandı.', status: true },
            ].map((chk, idx) => (
              <div key={idx} className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 flex items-start gap-3 text-emerald-950">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold">{chk.title}</h4>
                  <p className="text-[11px] opacity-80 mt-0.5">{chk.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
