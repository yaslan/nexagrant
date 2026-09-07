'use client';

import React, { useState } from 'react';
import { 
  Lightbulb, 
  Sparkles, 
  Plus, 
  Sliders, 
  FileCheck, 
  Zap, 
  X, 
  ChevronRight
} from 'lucide-react';
import { createTtoItem, matchTtoItemToCalls, generateIpChecklist } from '@/modules/m7/server/actions';

export interface TtoItem {
  id: string;
  title: string;
  trl: number;
  patentStatus: 'granted' | 'pending' | 'licensed' | string;
  summary: string;
  keywords: string[];
  createdAt: Date | string;
}

interface TtoAcceleratorClientProps {
  items: TtoItem[];
}

/** One call the TRL matcher proposes for a portfolio item. */
interface MatchedTopic {
  topicId: string;
  title: string;
  fitScore: number;
  targetTrlRange: string;
  matchReason: string;
  recommendedRole: string;
}

export function TtoAcceleratorClient({
  items: initialItems,
}: TtoAcceleratorClientProps) {
  const [items, setItems] = useState<TtoItem[]>(initialItems);
  const [activeTab, setActiveTab] = useState<'portfolio' | 'roadmap' | 'checklist'>('portfolio');

  // New IP item form state
  const [title, setTitle] = useState('');
  const [trl, setTrl] = useState(5);
  const [patentStatus, setPatentStatus] = useState('granted');
  const [summary, setSummary] = useState('');
  const [keywords, setKeywords] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Matcher state
  const [selectedMatchItem, setSelectedMatchItem] = useState<TtoItem | null>(null);
  const [matchedTopics, setMatchedTopics] = useState<MatchedTopic[]>([]);
  const [isMatching, setIsMatching] = useState(false);

  // IP Checklist modal state
  const [checklistContent, setChecklistContent] = useState<string | null>(null);
  const [isGeneratingChecklist, setIsGeneratingChecklist] = useState(false);

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      const kwList = keywords.split(',').map((s) => s.trim()).filter(Boolean);
      // The action stamps the session tenant itself; the browser cannot name one.
      const res = await createTtoItem({
        title: title.trim(),
        trl,
        patentStatus,
        summary: summary.trim(),
        keywords: kwList,
      });

      const newItem: TtoItem = {
        id: res.id || `tto-${Date.now()}`,
        title: title.trim(),
        trl,
        patentStatus,
        summary: summary.trim(),
        keywords: kwList,
        createdAt: new Date().toISOString(),
      };

      setItems((prev) => [newItem, ...prev]);
      setTitle('');
      setSummary('');
      setKeywords('');
    } catch (err) {
      console.error('Error creating TTO item:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRunMatcher = async (item: TtoItem) => {
    setSelectedMatchItem(item);
    setIsMatching(true);
    try {
      const res = await matchTtoItemToCalls(item.id);
      setMatchedTopics(res.matchedTopics || []);
    } catch (err) {
      console.error('Error matching TTO item:', err);
    } finally {
      setIsMatching(false);
    }
  };

  const handleGenerateIpChecklist = async (item: TtoItem) => {
    setIsGeneratingChecklist(true);
    try {
      const res = await generateIpChecklist({
        title: item.title,
        trl: item.trl,
        patentStatus: item.patentStatus,
      });
      setChecklistContent(res.checklistContent);
    } catch (err) {
      console.error('Error generating IP checklist:', err);
    } finally {
      setIsGeneratingChecklist(false);
    }
  };

  const avgTrl =
    items.length > 0
      ? (items.reduce((acc, i) => acc + i.trl, 0) / items.length).toFixed(1)
      : '0.0';

  const grantedCount = items.filter((i) => i.patentStatus === 'granted').length;

  const getPatentBadge = (status: string) => {
    switch (status) {
      case 'granted':
        return <span className="bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-bold text-[11px]">Tescilli (Granted)</span>;
      case 'pending':
        return <span className="bg-amber-500/15 text-amber-500 border border-amber-500/30 px-2.5 py-0.5 rounded-full font-bold text-[11px]">Başvuru Aşamasında (Pending)</span>;
      case 'licensed':
        return <span className="bg-accent/15 text-accent-ink border border-accent/30 px-2.5 py-0.5 rounded-full font-bold text-[11px]">Lisanslandı (Licensed)</span>;
      default:
        return <span className="bg-surface-hover text-ink border border-border px-2.5 py-0.5 rounded-full font-bold text-[11px]">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* ──────────────────────── HEADER BANNER ──────────────────────── */}
      <div className="bg-surface rounded-2xl p-6 text-ink shadow-sm border border-border relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-accent font-semibold tracking-wider uppercase mb-1">
              <Lightbulb className="w-4 h-4 text-accent" />
              <span>Modül 7 — TTO Accelerator</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight font-heading text-ink">
              Üniversite TTO Portföy & AB Çağrı Eşleştirici
            </h1>
            <p className="text-muted text-xs md:text-sm mt-1 max-w-2xl">
              Üniversite Ar-Ge patent portföylerini Ufuk Avrupa çağrılarıyla ve özel sektör ihtiyaçlarıyla buluşturun.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs bg-accent/10 border border-accent/20 text-accent-ink px-3.5 py-1.5 rounded-full font-mono font-bold">
              Patent & TRL Engine
            </span>
          </div>
        </div>

        {/* Metric Cards Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-border text-xs">
          <div className="bg-ground border border-border rounded-xl p-3.5">
            <span className="text-muted block text-[11px]">Toplam TTO IP Varlığı</span>
            <span className="text-xl font-bold text-ink font-mono mt-0.5 block">
              {items.length} <span className="text-xs text-muted">Teknoloji</span>
            </span>
          </div>

          <div className="bg-ground border border-border rounded-xl p-3.5">
            <span className="text-muted block text-[11px]">Ortalama TRL Seviyesi</span>
            <span className="text-xl font-bold text-accent font-mono mt-0.5 block">
              TRL {avgTrl}
            </span>
          </div>

          <div className="bg-ground border border-border rounded-xl p-3.5">
            <span className="text-muted block text-[11px]">Tescilli Patent (Granted)</span>
            <span className="text-xl font-bold text-emerald-500 font-mono mt-0.5 block">
              {grantedCount} <span className="text-xs text-muted">Patent</span>
            </span>
          </div>

          <div className="bg-ground border border-border rounded-xl p-3.5">
            <span className="text-muted block text-[11px]">Yapay Zeka Çağrı Eşleşmesi</span>
            <span className="text-xs font-bold text-purple-400 mt-1 block flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              Horizon Europe Uyumlu
            </span>
          </div>
        </div>
      </div>

      {/* ──────────────────────── NAVIGATION TABS ──────────────────────── */}
      <div className="flex border-b border-border gap-2 overflow-x-auto scrollbar-none pb-px">
        <button
          onClick={() => setActiveTab('portfolio')}
          className={`px-4 py-2.5 font-semibold text-xs rounded-t-xl transition flex items-center gap-2 border-b-2 -mb-px whitespace-nowrap shrink-0 ${
            activeTab === 'portfolio'
              ? 'border-accent text-accent-ink bg-accent/10 font-bold'
              : 'border-transparent text-muted hover:text-ink hover:bg-surface-hover'
          }`}
        >
          <Lightbulb className="w-4 h-4" />
          <span>TTO Portföy Kartları ({items.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('roadmap')}
          className={`px-4 py-2.5 font-semibold text-xs rounded-t-xl transition flex items-center gap-2 border-b-2 -mb-px whitespace-nowrap shrink-0 ${
            activeTab === 'roadmap'
              ? 'border-accent text-accent-ink bg-accent/10 font-bold'
              : 'border-transparent text-muted hover:text-ink hover:bg-surface-hover'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>TRL Seviye Haritası (TRL 1-9)</span>
        </button>

        <button
          onClick={() => setActiveTab('checklist')}
          className={`px-4 py-2.5 font-semibold text-xs rounded-t-xl transition flex items-center gap-2 border-b-2 -mb-px whitespace-nowrap shrink-0 ${
            activeTab === 'checklist'
              ? 'border-accent text-accent-ink bg-accent/10 font-bold'
              : 'border-transparent text-muted hover:text-ink hover:bg-surface-hover'
          }`}
        >
          <FileCheck className="w-4 h-4" />
          <span>IP & Lisanslama Kontrol Listesi</span>
        </button>
      </div>

      {/* ──────────────────────── TAB 1: PORTFOLIO & ADD FORM ──────────────────────── */}
      {activeTab === 'portfolio' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Form (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-surface rounded-2xl p-5 border border-border shadow-xs space-y-4">
              <div className="flex items-center gap-2 border-b border-border pb-3">
                <Plus className="w-4 h-4 text-accent" />
                <h3 className="font-bold text-sm text-ink">Yeni Patent / IP Portföy Öğesi Ekle</h3>
              </div>

              <form onSubmit={handleCreateItem} className="space-y-3.5 text-xs">
                <div>
                  <label className="font-semibold text-ink-2 block mb-1">Teknoloji / Patent Başlığı</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Örn: Katı Hal Batarya Mikrosensör Dizesi"
                    required
                    className="w-full border border-border rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-accent focus:outline-hidden bg-ground text-ink"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="font-semibold text-ink-2">TRL (1 - 9)</label>
                      <span className="font-mono font-bold text-accent">TRL {trl}</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="9"
                      value={trl}
                      onChange={(e) => setTrl(parseInt(e.target.value, 10))}
                      className="w-full accent-accent"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-ink-2 block mb-1">Patent Durumu</label>
                    <select
                      value={patentStatus}
                      onChange={(e) => setPatentStatus(e.target.value)}
                      className="w-full border border-border rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-accent focus:outline-hidden bg-ground text-ink"
                    >
                      <option value="granted">Tescilli (Granted)</option>
                      <option value="pending">Başvuru Aşamasında (Pending)</option>
                      <option value="licensed">Lisanslandı (Licensed)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-ink-2 block mb-1">Anahtar Kelimeler (Virgülle ayırın)</label>
                  <input
                    type="text"
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    placeholder="Örn: batarya, termal, sensör, katı hal"
                    className="w-full border border-border rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-accent focus:outline-hidden bg-ground text-ink"
                  />
                </div>

                <div>
                  <label className="font-semibold text-ink-2 block mb-1">Teknoloji Özeti & Avantajları</label>
                  <textarea
                    rows={3}
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    placeholder="Teknolojinin AB projelerine sunacağı teknik üstünlükler ve ticarileştirme nitelikleri..."
                    className="w-full border border-border rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-accent focus:outline-hidden bg-ground text-ink"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-accent hover:opacity-90 text-white font-semibold py-2.5 rounded-xl transition shadow-2xs flex items-center justify-center gap-2 text-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? 'Ekleniyor...' : 'TTO Portföyüne Kaydet'}</span>
                </button>
              </form>
            </div>
          </div>

          {/* Right Column: IP Cards & AI Match Launcher (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <h3 className="font-bold text-sm text-ink flex items-center justify-between">
              <span>Portföy Teknolojileri ({items.length})</span>
              <span className="text-xs font-normal text-muted">
                AB Çağrı Eşleşmesi İçin Karta Tıklayın
              </span>
            </h3>

            <div className="space-y-4">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="bg-surface border border-border rounded-2xl p-5 shadow-2xs space-y-3.5 hover:border-accent/40 transition"
                >
                  <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
                    <div>
                      <h4 className="font-bold text-sm text-ink">{item.title}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        {getPatentBadge(item.patentStatus)}
                        <span className="bg-purple-500/15 text-purple-400 border border-purple-500/30 font-mono font-bold px-2 py-0.5 rounded text-[11px]">
                          TRL {item.trl}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleRunMatcher(item)}
                      className="px-3 py-1.5 bg-accent hover:opacity-90 text-white font-semibold rounded-xl text-xs transition shadow-2xs flex items-center gap-1.5 shrink-0"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>AB Çağrıları Eşleştir</span>
                    </button>
                  </div>

                  <p className="text-xs text-ink-2 leading-relaxed">{item.summary}</p>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border">
                    <div className="flex flex-wrap gap-1.5">
                      {item.keywords?.map((k, idx) => (
                        <span key={idx} className="text-[10px] bg-ground border border-border text-ink-2 px-2 py-0.5 rounded font-mono">
                          #{k}
                        </span>
                      ))}
                    </div>

                    {/* `isGeneratingChecklist` was set on both sides of the call and never
                        read, so the button stayed idle-looking during an AI request and
                        could be clicked again — each click debits credits (CLAUDE.md §5). */}
                    <button
                      onClick={() => handleGenerateIpChecklist(item)}
                      disabled={isGeneratingChecklist}
                      className="text-[11px] font-semibold text-accent hover:underline flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline"
                    >
                      <FileCheck className="w-3.5 h-3.5 text-accent" />
                      <span>{isGeneratingChecklist ? 'Üretiliyor...' : 'IP Kontrol Listesi Üret'}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────── TAB 2: TRL ROADMAP (1-9) ──────────────────────── */}
      {activeTab === 'roadmap' && (
        <div className="bg-surface border border-border rounded-2xl p-6 shadow-xs space-y-6">
          <div>
            <h2 className="text-base font-bold text-ink flex items-center gap-2">
              <Sliders className="w-5 h-5 text-accent" />
              <span>Teknoloji Hazırlık Seviyesi (TRL 1 - 9) Matrisi</span>
            </h2>
            <p className="text-muted text-xs mt-1">
              Horizon Europe projelerinde üniversite buluşlarının ticarileşme olgunlaşma basamakları.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="bg-ground border border-border rounded-2xl p-4 space-y-2">
              <span className="text-xs font-bold font-mono text-ink-2 bg-surface border border-border px-2 py-0.5 rounded">
                TRL 1 - 3 (Temel Araştırma)
              </span>
              <h4 className="font-bold text-ink">Laboratuvar & Konsept Kanıtı</h4>
              <p className="text-ink-2 text-[11px] leading-relaxed">
                Temel ilkelerin gözlemlenmesi, teknoloji konseptinin ve uygulamanın formule edilmesi.
              </p>
            </div>

            <div className="bg-accent/10 border border-accent/20 rounded-2xl p-4 space-y-2">
              <span className="text-xs font-bold font-mono text-accent-ink bg-accent/20 px-2 py-0.5 rounded">
                TRL 4 - 6 (Prototip & Doğrulama)
              </span>
              <h4 className="font-bold text-ink">Laboratuvar & İlgili Ortam Doğrulaması</h4>
              <p className="text-ink-2 text-[11px] leading-relaxed">
                Bileşenlerin laboratuvarda ve ilgili sanayi ortamında doğrulanması. (Ufuk Avrupa Ar-Ge odağı).
              </p>
            </div>

            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 space-y-2">
              <span className="text-xs font-bold font-mono text-emerald-500 bg-emerald-500/20 px-2 py-0.5 rounded">
                TRL 7 - 9 (Ticarileşme & Pazar)
              </span>
              <h4 className="font-bold text-ink">Demonstrasyon & Operasyonel Yaygınlaşma</h4>
              <p className="text-ink-2 text-[11px] leading-relaxed">
                Sistemin gerçek operasyonel ortamda gösterimi, tescili ve pazar lisanslaması.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────── TAB 3: IP CHECKLIST VIEW ──────────────────────── */}
      {activeTab === 'checklist' && (
        <div className="bg-surface border border-border rounded-2xl p-6 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-ink flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-accent" />
            <span>Fikri Mülkiyet (IP) & Lisanslama Kontrol Rehberi</span>
          </h2>

          {checklistContent ? (
            <div className="prose prose-sm max-w-none text-ink whitespace-pre-wrap font-sans leading-relaxed p-5 bg-ground border border-border rounded-xl">
              {checklistContent}
            </div>
          ) : (
            <div className="p-8 text-center text-muted text-xs border border-dashed border-border rounded-xl space-y-2">
              <p>Lütfen Portföy sekmesindeki herhangi bir teknoloji için &quot;IP Kontrol Listesi Üret&quot; butonuna tıklayın.</p>
            </div>
          )}
        </div>
      )}

      {/* ──────────────── AI CALL MATCHER MODAL ──────────────── */}
      {selectedMatchItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-surface rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 max-h-[85vh] overflow-y-auto border border-border">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <span className="text-xs font-mono font-bold text-accent uppercase">
                  AB Horizon Europe Çağrı Eşleştirici
                </span>
                <h3 className="font-bold text-base text-ink">{selectedMatchItem.title}</h3>
              </div>
              <button
                onClick={() => setSelectedMatchItem(null)}
                className="p-1 rounded-lg hover:bg-surface-hover text-muted"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isMatching ? (
              <div className="p-12 text-center text-muted space-y-2">
                <Zap className="w-8 h-8 text-accent animate-spin mx-auto" />
                <p className="font-semibold text-sm">Yapay Zeka AB Çağrılarını Analiz Ediyor...</p>
              </div>
            ) : (
              <div className="space-y-3">
                <h4 className="font-bold text-xs text-ink-2 uppercase tracking-wider">
                  Tespit Edilen En Yüksek Uyumlu AB Çağrıları ({matchedTopics.length})
                </h4>

                {matchedTopics.map((topic, idx) => (
                  <div key={idx} className="bg-ground border border-border rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-xs text-accent bg-accent/15 border border-accent/20 px-2 py-0.5 rounded">
                        {topic.topicId}
                      </span>
                      <span className="font-mono font-bold text-xs text-emerald-500 bg-emerald-500/15 px-2 py-0.5 rounded border border-emerald-500/30">
                        Uyum Skoru: %{topic.fitScore}
                      </span>
                    </div>

                    <h5 className="font-bold text-sm text-ink">{topic.title}</h5>
                    <p className="text-xs text-ink-2">{topic.matchReason}</p>

                    <div className="flex items-center justify-between pt-2 border-t border-border/60 text-xs">
                      <span className="text-[11px] font-mono text-muted">
                        Hedef TRL: <strong>{topic.targetTrlRange}</strong>
                      </span>

                      <button
                        onClick={() => setSelectedMatchItem(null)}
                        className="px-3 py-1 bg-accent hover:opacity-90 text-white rounded-lg transition font-semibold text-xs flex items-center gap-1"
                      >
                        <span>M4 İlişkisi Aç</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
