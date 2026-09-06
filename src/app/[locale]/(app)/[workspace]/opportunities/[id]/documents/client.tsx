'use client';

import React, { useState } from 'react';
import { 
  FileText, 
  ShieldCheck, 
  Award, 
  CheckCircle2, 
  Clock, 
  Download, 
  FileSignature, 
  Sparkles, 
  FileCode, 
  Plus, 
  RotateCw, 
  Eye, 
  X,
  Building,
  Check,
  AlertCircle
} from 'lucide-react';
import { generateStandardDoc, signDocument, createNewVersion, submitDualApprovalAction, departmentApproveAction } from '@/modules/m10/server/actions';
import { ShieldAlert, Scale, Landmark } from 'lucide-react';

interface DocItem {
  id: string;
  kind: 'NDA' | 'LOI' | 'COMMITMENT' | 'ESR_DEBRIEF' | 'AWARD_PACK' | string;
  version: number;
  contentUrl?: string | null;
  signedAt?: Date | string | null;
  createdAt: Date | string;
  contentText?: string;
}

interface DocumentsClientProps {
  opportunityId: string;
  opportunityTitle: string;
  documents: DocItem[];
}

export function DocumentsClient({
  opportunityId,
  opportunityTitle,
  documents: initialDocs,
}: DocumentsClientProps) {
  const [docs, setDocs] = useState<DocItem[]>(initialDocs);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'LEGAL' | 'COMMITMENT' | 'AWARD'>('ALL');
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<DocItem | null>(null);

  const handleGenerateDoc = async (kind: 'NDA' | 'LOI' | 'COMMITMENT' | 'ESR_DEBRIEF' | 'AWARD_PACK') => {
    setIsGenerating(true);
    try {
      // The action reads the tenant and user from the session.
      const res = await generateStandardDoc(opportunityId, kind);
      const newDoc: DocItem = {
        id: res.id || `doc-${Date.now()}`,
        kind: res.kind || kind,
        version: res.version || 1,
        contentUrl: res.contentUrl,
        signedAt: res.signedAt || null,
        createdAt: new Date().toISOString(),
        contentText: res.contentText,
      };
      setDocs((prev) => [newDoc, ...prev]);
    } catch (err) {
      console.error('Error generating document:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSignDoc = async (docId: string) => {
    try {
      await signDocument(docId);
      setDocs((prev) =>
        prev.map((d) => (d.id === docId ? { ...d, signedAt: new Date().toISOString() } : d))
      );
    } catch (err) {
      console.error('Error signing document:', err);
    }
  };

  const handleCreateNewVersion = async (docId: string) => {
    try {
      const res = await createNewVersion(docId);
      if (res.updatedDoc) {
        setDocs((prev) =>
          prev.map((d) =>
            d.id === docId
              ? {
                  ...d,
                  version: res.updatedDoc.version,
                  signedAt: null,
                  contentUrl: res.updatedDoc.contentUrl,
                }
              : d
          )
        );
      }
    } catch (err) {
      console.error('Error updating document version:', err);
    }
  };

  const filteredDocs = docs.filter((d) => {
    if (activeFilter === 'LEGAL') return d.kind === 'NDA' || d.kind === 'LOI';
    if (activeFilter === 'COMMITMENT') return d.kind === 'COMMITMENT';
    if (activeFilter === 'AWARD') return d.kind === 'AWARD_PACK' || d.kind === 'ESR_DEBRIEF';
    return true;
  });

  const getDocKindBadge = (kind: string) => {
    switch (kind) {
      case 'NDA':
        return <span className="bg-blue-100 text-blue-800 border border-blue-200 px-2.5 py-0.5 rounded-full font-bold text-xs">NDA (Gizlilik Anlaşması)</span>;
      case 'LOI':
        return <span className="bg-indigo-100 text-indigo-800 border border-indigo-200 px-2.5 py-0.5 rounded-full font-bold text-xs">LOI (Niyet Mektubu)</span>;
      case 'COMMITMENT':
        return <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded-full font-bold text-xs">Ortak Taahhüt Formu</span>;
      case 'AWARD_PACK':
        return <span className="bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-0.5 rounded-full font-bold text-xs">TÜBİTAK Eşik Üstü Paketi</span>;
      case 'ESR_DEBRIEF':
        return <span className="bg-purple-100 text-purple-800 border border-purple-200 px-2.5 py-0.5 rounded-full font-bold text-xs">ESR Sonrası Özet</span>;
      default:
        return <span className="bg-surface-hover text-ink px-2.5 py-0.5 rounded-full font-bold text-xs">{kind}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* ──────────────────────── HEADER BANNER ──────────────────────── */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-blue-400 font-semibold tracking-wider uppercase mb-1">
              <FileSignature className="w-4 h-4 text-blue-400" />
              <span>Modül 10 — Follow-up Documents</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight font-heading text-white">
              Takip Belgeleri & Eşik Üstü Ödül Paketi
            </h1>
            <p className="text-muted text-xs md:text-sm mt-1 max-w-2xl">
              Fırsat: <strong className="text-slate-200">{opportunityTitle}</strong>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs bg-slate-800 border border-slate-700 text-slate-300 px-3 py-1.5 rounded-full font-mono font-bold">
              {docs.length} Doküman Mevcut
            </span>
          </div>
        </div>

        {/* TÜBİTAK Eşik Üstü Award Highlight Bar */}
        <div className="mt-6 pt-5 border-t border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold shrink-0">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-xs text-amber-300">TÜBİTAK Eşik Üstü Ödülü Desteği</h4>
              <p className="text-[11px] text-slate-300">
                Ufuk Avrupa değerlendirmesinden eşik üstü (≥ 12.0/15) alan projeler için TÜBİTAK Ödül paketi tek tıkla üretilir.
              </p>
            </div>
          </div>

          <button
            onClick={() => handleGenerateDoc('AWARD_PACK')}
            disabled={isGenerating}
            className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold px-4 py-2 rounded-xl transition text-xs shadow-md shrink-0 flex items-center gap-1.5"
          >
            <Sparkles className="w-4 h-4" />
            <span>TÜBİTAK Ödül Paketi Üret</span>
          </button>
        </div>
      </div>

      {/* ──────────────────────── DUAL APPROVAL STEPPER BANNER ──────────────────────── */}
      <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b pb-2">
          <div className="flex items-center gap-2">
            <Landmark className="w-4 h-4 text-purple-600" />
            <h3 className="font-bold text-xs text-ink uppercase tracking-wider">
              Çift Onaylı Kurumsal Yetki Akışı (Dual Approval Workflow)
            </h3>
          </div>
          <span className="text-[11px] bg-purple-50 text-purple-800 border border-purple-200 px-2.5 py-0.5 rounded-full font-semibold">
            Finans & Hukuk Çift Onayı
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs pt-1">
          <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 font-bold flex flex-col items-center gap-1">
            <span className="text-[10px] uppercase text-blue-600">Aşama 1</span>
            <span>1. Taslak Üretimi</span>
          </div>

          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 font-bold flex flex-col items-center gap-1">
            <span className="text-[10px] uppercase text-amber-600">Aşama 2</span>
            <span>2. Finans Onayı</span>
          </div>

          <div className="p-2.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 font-bold flex flex-col items-center gap-1">
            <span className="text-[10px] uppercase text-indigo-600">Aşama 3</span>
            <span>3. Hukuk Onayı</span>
          </div>

          <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold flex flex-col items-center gap-1">
            <span className="text-[10px] uppercase text-emerald-600">Aşama 4</span>
            <span>4. İmzalı & Onaylı</span>
          </div>
        </div>
      </div>

      {/* ──────────────────────── QUICK ACTIONS & GENERATORS ──────────────────────── */}
      <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm space-y-4">
        <h2 className="font-bold text-sm text-ink flex items-center gap-2">
          <Plus className="w-4 h-4 text-blue-600" />
          <span>Yeni İdari / Yasal Doküman Üret (AI Draft Generator)</span>
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            onClick={() => handleGenerateDoc('NDA')}
            disabled={isGenerating}
            className="p-3 bg-blue-50/70 hover:bg-blue-100/80 border border-blue-200 text-blue-900 rounded-xl transition text-xs font-semibold flex flex-col items-start gap-1"
          >
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <span>+ NDA Gizlilik Anlaşması</span>
          </button>

          <button
            onClick={() => handleGenerateDoc('LOI')}
            disabled={isGenerating}
            className="p-3 bg-indigo-50/70 hover:bg-indigo-100/80 border border-indigo-200 text-indigo-900 rounded-xl transition text-xs font-semibold flex flex-col items-start gap-1"
          >
            <FileText className="w-4 h-4 text-indigo-600" />
            <span>+ LOI Niyet Mektubu</span>
          </button>

          <button
            onClick={() => handleGenerateDoc('COMMITMENT')}
            disabled={isGenerating}
            className="p-3 bg-emerald-50/70 hover:bg-emerald-100/80 border border-emerald-200 text-emerald-900 rounded-xl transition text-xs font-semibold flex flex-col items-start gap-1"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>+ Ortak Taahhüt Formu</span>
          </button>

          <button
            onClick={() => handleGenerateDoc('ESR_DEBRIEF')}
            disabled={isGenerating}
            className="p-3 bg-purple-50/70 hover:bg-purple-100/80 border border-purple-200 text-purple-900 rounded-xl transition text-xs font-semibold flex flex-col items-start gap-1"
          >
            <FileCode className="w-4 h-4 text-purple-600" />
            <span>+ ESR Sonrası Özet</span>
          </button>
        </div>
      </div>

      {/* ──────────────────────── FILTER TABS & TABLE ──────────────────────── */}
      <div className="space-y-4">
        <div className="flex border-b border-border gap-2">
          <button
            onClick={() => setActiveFilter('ALL')}
            className={`px-4 py-2.5 font-semibold text-xs rounded-t-xl transition border-b-2 -mb-px ${
              activeFilter === 'ALL'
                ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            Tüm Dokümanlar ({docs.length})
          </button>

          <button
            onClick={() => setActiveFilter('LEGAL')}
            className={`px-4 py-2.5 font-semibold text-xs rounded-t-xl transition border-b-2 -mb-px ${
              activeFilter === 'LEGAL'
                ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            Yasal Anlaşmalar (NDA / LOI)
          </button>

          <button
            onClick={() => setActiveFilter('COMMITMENT')}
            className={`px-4 py-2.5 font-semibold text-xs rounded-t-xl transition border-b-2 -mb-px ${
              activeFilter === 'COMMITMENT'
                ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            Ortak Taahhütleri
          </button>

          <button
            onClick={() => setActiveFilter('AWARD')}
            className={`px-4 py-2.5 font-semibold text-xs rounded-t-xl transition border-b-2 -mb-px ${
              activeFilter === 'AWARD'
                ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            TÜBİTAK Ödül Paketi
          </button>
        </div>

        {/* Documents Grid / Table */}
        <div className="bg-surface border border-border rounded-2xl shadow-2xs overflow-hidden">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-ground border-b border-border text-ink-2 font-bold uppercase tracking-wider text-[11px]">
                <th className="p-4">Doküman Türü</th>
                <th className="p-4">Sürüm</th>
                <th className="p-4">Oluşturulma</th>
                <th className="p-4">İmza / Onay Durumu</th>
                <th className="p-4 text-right">Eylemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredDocs.map((doc) => (
                <tr key={doc.id} className="hover:bg-ground/80 transition-colors">
                  <td className="p-4 font-semibold text-ink">
                    {getDocKindBadge(doc.kind)}
                  </td>
                  <td className="p-4 font-mono font-bold text-ink-2">
                    v{doc.version}
                  </td>
                  <td className="p-4 text-muted font-mono">
                    {new Date(doc.createdAt).toLocaleDateString('tr-TR')}
                  </td>
                  <td className="p-4">
                    {doc.signedAt ? (
                      <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-full text-xs font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        İmzalandı ({new Date(doc.signedAt).toLocaleDateString('tr-TR')})
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-full text-xs font-bold">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        Bekliyor (İmzasız)
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    <div className="inline-flex items-center justify-end gap-2">
                      {doc.contentText && (
                        <button
                          onClick={() => setPreviewDoc(doc)}
                          className="px-2.5 py-1 bg-surface-hover hover:bg-slate-200 text-ink rounded-lg transition font-semibold text-xs flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Önizle</span>
                        </button>
                      )}

                      {!doc.signedAt && (
                        <button
                          onClick={() => handleSignDoc(doc.id)}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition font-semibold text-xs flex items-center gap-1"
                        >
                          <FileSignature className="w-3.5 h-3.5" />
                          <span>Elektronik İmzala</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleCreateNewVersion(doc.id)}
                        className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg transition font-semibold text-xs flex items-center gap-1"
                        title="Yeni Revizyon Sürümü Oluştur"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                        <span>Revizyon v{doc.version + 1}</span>
                      </button>

                      <a
                        href={`/api/documents/export?type=${doc.kind}&format=docx`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition font-semibold text-xs flex items-center gap-1"
                        title="Resmî Word .docx Şablonu İndir"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>.DOCX</span>
                      </a>

                      <a
                        href={`/api/documents/export?type=${doc.kind}&format=pdf`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded-lg transition font-semibold text-xs flex items-center gap-1"
                        title="Resmî PDF / Baskı Şablonu Aç"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>PDF / Baskı</span>
                      </a>
                    </div>
                  </td>
                </tr>
              ))}

              {filteredDocs.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted text-xs">
                    Bu filtreye uygun doküman bulunmuyor. Yukarıdaki butonlarla yeni bir doküman üretebilirsiniz.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ──────────────── PREVIEW MODAL ──────────────── */}
      {previewDoc && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-surface rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                {getDocKindBadge(previewDoc.kind)}
                <span className="font-mono text-xs text-muted font-bold">v{previewDoc.version}</span>
              </div>
              <button
                onClick={() => setPreviewDoc(null)}
                className="p-1 rounded-lg hover:bg-surface-hover text-muted"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="prose prose-sm max-w-none text-ink whitespace-pre-wrap font-sans leading-relaxed p-4 bg-ground border border-border rounded-xl">
              {previewDoc.contentText}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                onClick={() => setPreviewDoc(null)}
                className="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-semibold"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
