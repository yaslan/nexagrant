'use client';

import React, { useState } from 'react';
import { 
  FileText, 
  Sparkles, 
  UserCheck, 
  HelpCircle, 
  AlertOctagon, 
  CheckSquare, 
  Plus, 
  Calendar, 
  Printer, 
  Building2, 
  ArrowLeft,
  Clock,
  Send,
  MessageSquare
} from 'lucide-react';
import Link from 'next/link';
import { generateMeetingBrief, savePostMeetingNotes } from '@/modules/m9/server/actions';

interface BriefItem {
  id: string;
  interactionId: string;
  content: string;
  createdAt: string | Date;
}

interface MeetingBriefsClientProps {
  opportunityId: string;
  locale: string;
  workspace: string;
  opportunityTitle: string;
  briefs: BriefItem[];
}

export function MeetingBriefsClient({
  opportunityId,
  locale,
  workspace,
  opportunityTitle,
  briefs: initialBriefs,
}: MeetingBriefsClientProps) {
  const [briefs, setBriefs] = useState<BriefItem[]>(initialBriefs);
  const [partnerName, setPartnerName] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Active brief selection
  const [activeBriefId, setActiveBriefId] = useState<string>(initialBriefs[0]?.id || '');

  // Post-meeting notes form
  const [meetingNotes, setMeetingNotes] = useState('');
  const [meetingDecisions, setMeetingDecisions] = useState('');
  const [actionItemInput, setActionItemInput] = useState('');
  const [actionItems, setActionItems] = useState<string[]>([]);
  const [nextMeetingDate, setNextMeetingDate] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  const activeBrief = briefs.find((b) => b.id === activeBriefId) || briefs[0];

  const handleGenerateBrief = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partnerName.trim()) return;

    setIsGenerating(true);
    try {
      const interactionId = `int-${Date.now()}`;
      // tenantId/userId are no longer passed: the action reads them from the
      // session, so the browser cannot name a tenant.
      const res = await generateMeetingBrief({
        interactionId,
        partnerName: partnerName.trim(),
        callTopic: opportunityTitle,
      });

      if (res.brief) {
        const newBrief: BriefItem = {
          id: res.brief.id,
          interactionId: res.brief.interactionId,
          content: res.brief.content,
          createdAt: res.brief.createdAt,
        };
        setBriefs((prev) => [newBrief, ...prev]);
        setActiveBriefId(newBrief.id);
        setPartnerName('');
      }
    } catch (err) {
      console.error('Error generating brief:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddActionItem = () => {
    if (actionItemInput.trim()) {
      setActionItems((prev) => [...prev, actionItemInput.trim()]);
      setActionItemInput('');
    }
  };

  const handleRemoveActionItem = (index: number) => {
    setActionItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSavePostMeetingNotes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBrief) return;

    setIsSavingNotes(true);
    try {
      const res = await savePostMeetingNotes({
        briefId: activeBrief.id,
        partnerName: partnerName || 'Konsorsiyum Ortağı',
        notes: meetingNotes,
        decisions: meetingDecisions,
        actionItems,
        nextMeetingDate,
      });

      if (res.formattedPostNotes) {
        setBriefs((prev) =>
          prev.map((b) =>
            b.id === activeBrief.id
              ? { ...b, content: b.content + res.formattedPostNotes }
              : b
          )
        );
      }

      setMeetingNotes('');
      setMeetingDecisions('');
      setActionItems([]);
      setNextMeetingDate('');
    } catch (err) {
      console.error('Error saving post-meeting notes:', err);
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* ──────────────────────── HEADER BANNER ──────────────────────── */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 rounded-2xl p-6 text-white shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Link
                href={`/${locale}/${workspace}/pipeline`}
                className="text-xs text-blue-400 hover:text-blue-300 transition flex items-center gap-1 font-semibold"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Pipeline'a Dön</span>
              </Link>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-blue-400 font-semibold tracking-wider uppercase mb-1">
              <FileText className="w-4 h-4 text-blue-400" />
              <span>Modül 9 — Meeting Briefs</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight font-heading text-white">
              Görüşme Brifingi & Not Alma Motoru
            </h1>
            <p className="text-muted text-xs md:text-sm mt-1 max-w-2xl">
              Çağrı Fırsatı: <strong className="text-slate-200">{opportunityTitle}</strong>
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs bg-indigo-950 text-indigo-300 border border-indigo-700 px-3 py-1.5 rounded-full font-mono font-bold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>1 AI Kredi / Brief</span>
            </span>

            {activeBrief && (
              <button
                onClick={handlePrint}
                className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Yazdır / PDF</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ──────────────────────── GENERATOR FORM ──────────────────────── */}
      <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Building2 className="w-4 h-4 text-blue-600" />
          <h2 className="font-bold text-sm text-ink">Yeni Görüşme Notu Oluştur (AI Pre-Meeting Brief)</h2>
        </div>

        <form onSubmit={handleGenerateBrief} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={partnerName}
            onChange={(e) => setPartnerName(e.target.value)}
            placeholder="Görüşülecek Ortak / Kurum Adı (Örn: Fraunhofer Institute, METU TTO, Siemens AG)"
            required
            className="flex-1 border border-border rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none bg-ground"
          />
          <button
            type="submit"
            disabled={isGenerating}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-5 rounded-xl transition text-xs shadow-sm flex items-center justify-center gap-2 shrink-0 disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <Sparkles className="w-4 h-4 animate-spin" />
                <span>AI Brief Hazırlanıyor...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Yapay Zeka Brief Oluştur</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* ──────────────────────── MAIN CONTENT & BRIEFS FEED ──────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Brief Selector / History (4 cols) */}
        <div className="lg:col-span-4 space-y-3">
          <h3 className="font-bold text-xs text-ink-2 uppercase tracking-wider px-1">
            Görüşme Kayıtları ({briefs.length})
          </h3>

          <div className="space-y-2">
            {briefs.map((b) => (
              <button
                key={b.id}
                onClick={() => setActiveBriefId(b.id)}
                className={`w-full text-left p-3.5 rounded-xl border transition flex flex-col gap-1.5 ${
                  b.id === activeBrief?.id
                    ? 'bg-blue-50/80 border-blue-300 text-blue-950 shadow-2xs'
                    : 'bg-surface border-border text-ink-2 hover:bg-ground'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-ink truncate">
                    {b.interactionId}
                  </span>
                  <span className="text-[10px] text-muted font-mono flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(b.createdAt).toLocaleDateString('tr-TR')}
                  </span>
                </div>
                <p className="text-[11px] text-muted line-clamp-2">
                  {b.content.substring(0, 100)}...
                </p>
              </button>
            ))}

            {briefs.length === 0 && (
              <div className="bg-surface border border-border rounded-xl p-6 text-center text-muted text-xs">
                Henüz kayıtlı bir görüşme bulunmuyor.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Brief Viewer & Post-Meeting Form (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {activeBrief ? (
            <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm space-y-6">
              {/* Brief Header */}
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div>
                  <span className="text-xs font-mono font-bold bg-surface-hover text-ink-2 px-2.5 py-1 rounded-md">
                    Etkileşim ID: {activeBrief.interactionId}
                  </span>
                </div>
                <span className="text-xs text-muted font-mono">
                  Oluşturulma: {new Date(activeBrief.createdAt).toLocaleDateString('tr-TR')}
                </span>
              </div>

              {/* Structured Markdown Viewer */}
              <div className="prose prose-sm max-w-none text-ink whitespace-pre-wrap font-sans leading-relaxed space-y-4">
                {activeBrief.content}
              </div>

              {/* ──────────────── POST-MEETING NOTES FORM ──────────────── */}
              <div className="pt-6 border-t border-border space-y-4">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-emerald-600" />
                  <h3 className="font-bold text-sm text-ink">
                    Toplantı Sonrası Kararları & Aksiyon Notu Ekle
                  </h3>
                </div>

                <form onSubmit={handleSavePostMeetingNotes} className="space-y-4 text-xs">
                  <div>
                    <label className="font-semibold text-ink-2 block mb-1">Alınan Kararlar / Sonuç</label>
                    <input
                      type="text"
                      value={meetingDecisions}
                      onChange={(e) => setMeetingDecisions(e.target.value)}
                      placeholder="Örn: Fraunhofer WP3 liderliğini kabul etti; NDA haftaya imzalanacak."
                      className="w-full border border-border rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none bg-ground"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-ink-2 block mb-1">Görüşme Detay Notları</label>
                    <textarea
                      rows={3}
                      value={meetingNotes}
                      onChange={(e) => setMeetingNotes(e.target.value)}
                      placeholder="Toplantıda konuşulan detaylar, TRL beklentileri, bütçe kısıtları..."
                      className="w-full border border-border rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none bg-ground"
                    />
                  </div>

                  {/* Action Items Input */}
                  <div>
                    <label className="font-semibold text-ink-2 block mb-1">Aksiyon Maddeleri</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={actionItemInput}
                        onChange={(e) => setActionItemInput(e.target.value)}
                        placeholder="Örn: Mehmet - WP3 efor tablosunu Cuma'ya kadar iletecek."
                        className="flex-1 border border-border rounded-xl p-2 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none bg-ground"
                      />
                      <button
                        type="button"
                        onClick={handleAddActionItem}
                        className="bg-slate-800 hover:bg-slate-900 text-white font-semibold px-3 py-2 rounded-xl transition text-xs flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Ekle</span>
                      </button>
                    </div>

                    {actionItems.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {actionItems.map((item, idx) => (
                          <li
                            key={idx}
                            className="flex items-center justify-between bg-ground border border-border px-3 py-1.5 rounded-lg text-ink-2 text-xs"
                          >
                            <span>{idx + 1}. {item}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveActionItem(idx)}
                              className="text-rose-500 hover:text-rose-700 text-[11px] font-bold"
                            >
                              Kaldır
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div>
                    <label className="font-semibold text-ink-2 block mb-1">Sonraki Takip Görüşme Tarihi</label>
                    <input
                      type="date"
                      value={nextMeetingDate}
                      onChange={(e) => setNextMeetingDate(e.target.value)}
                      className="border border-border rounded-xl p-2 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none bg-ground font-mono"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSavingNotes}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-xl transition shadow-xs flex items-center justify-center gap-2 text-xs"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isSavingNotes ? 'Notlar Ekleniyor...' : 'Toplantı Sonrası Notlarını Brief\'e Ekle'}</span>
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="bg-surface border border-border rounded-2xl p-12 text-center text-muted text-xs">
              Lütfen sol panelden bir görüşme seçin veya yeni bir AI Brief oluşturun.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
