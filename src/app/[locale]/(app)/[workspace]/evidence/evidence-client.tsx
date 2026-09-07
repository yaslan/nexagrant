'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  getPresignedUploadUrlAction,
  confirmEvidenceUploadAction,
  deleteEvidence,
} from './actions';
import { calculateEvidenceHealthScore, HealthScoreResult } from '@/lib/evidence-health';
import { evidenceBadge } from '@/lib/evidence-status';
import {
  ShieldCheck,
  Upload,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  Trash2,
  FileText,
  HelpCircle,
  ExternalLink,
  Eye,
} from 'lucide-react';
import { errorMessage } from '@/lib/errors';

export interface EvidenceItemData {
  id: string;
  tenantId?: string;
  category?: string;
  kind?: string;
  title: string;
  body?: string;
  description?: string;
  issuingAuthority?: string;
  documentNumber?: string;
  validUntil?: Date | string | null;
  confidentiality?: string;
  status?: string;
  version?: number;
  fileUrl?: string | null;
  r2ObjectKey?: string | null;
  fileName?: string | null;
  fileSizeBytes?: number | null;
  mimeType?: string | null;
  ocrText?: string | null;
  tags?: string[];
  createdAt?: Date | string;
  claimLinks?: Array<{
    id: string;
    claim?: { statement?: string | null; statementEn?: string | null } | null;
  }>;
}

interface EvidenceClientProps {
  initialData: EvidenceItemData[];
  locale?: string;
}

const TAXONOMY_CATEGORIES = [
  { code: 'CAT-01', key: 'CORPORATE_IDENTITY', labelTr: 'Kurumsal Kimlik', labelEn: 'Corporate Identity', descTr: 'Ticaret Sicil, PIC/LEAR, KOBİ Beyanı, FID', icon: '🏛️' },
  { code: 'CAT-02', key: 'FINANCIAL', labelTr: 'Mali Belgeler', labelEn: 'Financial Reports', descTr: 'Son 3 Yıl Bilanço, Bağımsız Denetim Raporu', icon: '📊' },
  { code: 'CAT-03', key: 'CERTIFICATION', labelTr: 'Sertifika & Uyum', labelEn: 'Certifications', descTr: 'ISO 9001/27001, CE, TÜBİTAK Ar-Ge Merkezi', icon: '📜' },
  { code: 'CAT-04', key: 'INFRASTRUCTURE', labelTr: 'Yetkinlik & Altyapı', labelEn: 'Infrastructure', descTr: 'Laboratuvar, Test Ekipmanı, Lisanslar', icon: '🔬' },
  { code: 'CAT-05', key: 'PAST_PERFORMANCE', labelTr: 'Geçmiş Performans', labelEn: 'Past Performance', descTr: 'Tamamlanan AB Projeleri, Patentler, Yayınlar', icon: '🏆' },
  { code: 'CAT-06', key: 'ETHICS_LEGAL', labelTr: 'Etik & Yasal Uyum', labelEn: 'Ethics & Legal', descTr: 'GEP (Gender Equality Plan), GDPR, Etik Onay', icon: '⚖️' },
  { code: 'CAT-07', key: 'PARTNER_DOCS', labelTr: 'Ortak Belgeleri', labelEn: 'Partner Documents', descTr: 'Letter of Intent (LOI), NDA, Ortaklık Yazıları', icon: '🤝' },
  { code: 'CAT-08', key: 'PERSONNEL', labelTr: 'Personel & CV', labelEn: 'Personnel & CVs', descTr: 'Kilit Personel Europass CV, Yetki Belgeleri', icon: '👤' },
];

export default function EvidenceClient({ initialData, locale = 'tr' }: EvidenceClientProps) {
  const [items, setItems] = useState<EvidenceItemData[]>(initialData || []);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Upload Modal State
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCategory, setUploadCategory] = useState<string>('CAT-03');
  const [uploadTitle, setUploadTitle] = useState<string>('');
  const [uploadValidUntil, setUploadValidUntil] = useState<string>('');
  const [uploadAuthority, setUploadAuthority] = useState<string>('');
  const [uploadConfidentiality] = useState<string>('INTERNAL');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  
  // Selected Document Detail Drawer
  const [selectedDoc, setSelectedDoc] = useState<EvidenceItemData | null>(null);
  
  // Health Score Calculation
  const healthResult: HealthScoreResult = calculateEvidenceHealthScore(items);

  const isTr = locale === 'tr';
  const t = useTranslations('Evidence');

  // What the drawer may show about the selected document. Both are empty for almost
  // every row today, and an empty state is the correct thing to render: the module has
  // no OCR, and a claim exists only once a person has written and linked one.
  const documentText = selectedDoc?.ocrText || selectedDoc?.body || '';
  const linkedClaims = selectedDoc?.claimLinks ?? [];

  // Filter items
  const filteredItems = items.filter((item) => {
    const matchesCategory = selectedCategory === 'ALL' || item.category === selectedCategory || item.kind === selectedCategory;
    const matchesStatus = selectedStatus === 'ALL' || item.status === selectedStatus;
    const matchesSearch = !searchQuery.trim() || 
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.body && item.body.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.issuingAuthority && item.issuingAuthority.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.tags && item.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase())));
    
    return matchesCategory && matchesStatus && matchesSearch;
  });

  // The rule lives in evidenceBadge() (src/lib/evidence-status.ts) and is unit tested
  // there; this only paints the answer. The green badge is reachable only for a record
  // whose status column says verification passed — an unchecked document is labelled
  // as unchecked rather than shown with a tick.
  const getStatusBadge = (status?: string, validUntil?: Date | string | null) => {
    const badge = evidenceBadge({ status, validUntil });

    switch (badge.kind) {
      case 'EXPIRED':
        return (
          <span data-testid="evidence-badge" data-badge-kind={badge.kind} className="inline-flex items-center gap-1 text-[10px] font-bold bg-bad/15 text-bad border border-bad/30 px-2 py-0.5 rounded-full">
            <AlertTriangle className="w-3 h-3" />
            <span>{t('badge.expired')}</span>
          </span>
        );

      case 'REJECTED':
        return (
          <span data-testid="evidence-badge" data-badge-kind={badge.kind} className="inline-flex items-center gap-1 text-[10px] font-bold bg-bad/15 text-bad border border-bad/30 px-2 py-0.5 rounded-full">
            <AlertTriangle className="w-3 h-3" />
            <span>{t('badge.rejected')}</span>
          </span>
        );

      case 'UNVERIFIED':
        return (
          <span data-testid="evidence-badge" data-badge-kind={badge.kind} className="inline-flex items-center gap-1 text-[10px] font-bold bg-muted/15 text-muted border border-border px-2 py-0.5 rounded-full">
            <HelpCircle className="w-3 h-3" />
            <span>{t('badge.unverified')}</span>
          </span>
        );

      case 'EXPIRING_SOON':
        return (
          <span data-testid="evidence-badge" data-badge-kind={badge.kind} className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber/15 text-amber border border-amber/30 px-2 py-0.5 rounded-full">
            <Clock className="w-3 h-3" />
            <span>{t('badge.daysLeft', { days: badge.daysLeft ?? 0 })}</span>
          </span>
        );

      default:
        return (
          <span data-testid="evidence-badge" data-badge-kind={badge.kind} className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="w-3 h-3" />
            <span>{t('badge.valid')}</span>
          </span>
        );
    }
  };

  const handlePresignedUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;

    setIsUploading(true);
    setUploadProgress(15);

    try {
      // 1. Get Presigned Upload URL
      const { uploadUrl, objectKey } = await getPresignedUploadUrlAction(
        uploadCategory,
        uploadFile.name,
        uploadFile.type || 'application/pdf'
      );

      setUploadProgress(40);

      // 2. Direct R2 Upload via Presigned PUT (Dev Fallback supported)
      if (uploadUrl.includes('/api/evidence/mock-upload')) {
        // Dev Mode Mock Delay
        await new Promise(r => setTimeout(r, 600));
      } else {
        await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': uploadFile.type || 'application/pdf' },
          body: uploadFile,
        });
      }

      setUploadProgress(75);

      // 3. Confirm Evidence Upload & Trigger AI OCR
      const res = await confirmEvidenceUploadAction({
        title: uploadTitle || uploadFile.name.replace(/\.[^/.]+$/, ''),
        category: uploadCategory,
        kind: uploadCategory.toLowerCase(),
        objectKey,
        fileName: uploadFile.name,
        fileSizeBytes: uploadFile.size,
        mimeType: uploadFile.type || 'application/pdf',
        validUntil: uploadValidUntil || undefined,
        issuingAuthority: uploadAuthority || undefined,
        confidentiality: uploadConfidentiality,
        language: locale,
      });

      setUploadProgress(100);

      if (res?.evidence) {
        setItems([res.evidence, ...items]);
      }

      setShowUploadModal(false);
      setUploadFile(null);
      setUploadTitle('');
      setUploadValidUntil('');
      setUploadAuthority('');
    } catch (err) {
      alert(isTr ? `Yükleme hatası: ${errorMessage(err)}` : `Upload error: ${errorMessage(err)}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(isTr ? 'Bu belgeyi silmek istediğinize emin misiniz?' : 'Are you sure you want to delete this document?')) return;
    
    await deleteEvidence(id);
    setItems(items.filter(i => i.id !== id));
    if (selectedDoc?.id === id) setSelectedDoc(null);
  };

  const exportCSV = () => {
    const header = "ID,Title,Category,IssuingAuthority,ValidUntil,Status,FileUrl\n";
    const rows = filteredItems.map(i => 
      `${i.id},"${i.title.replace(/"/g, '""')}",${i.category || i.kind || ''},"${i.issuingAuthority || ''}",${i.validUntil || ''},${i.status || 'UNVERIFIED'},"${i.fileUrl || ''}"`
    ).join('\n');
    
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FonBridge_Evidence_Pack_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="space-y-8">
      {/* ─── 1. HEALTH SCORE & SUMMARY BANNER ─── */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-accent/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-3 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="bg-accent/20 text-accent-ink border border-accent/30 text-xs font-mono font-bold px-2.5 py-1 rounded-md flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-accent" />
                <span>M3 EVIDENCE PACK HEALTH ENGINE</span>
              </span>
              <span className="text-xs text-slate-400 font-mono">1 GB Free Storage</span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-extrabold font-heading tracking-tight text-white">
              {isTr ? 'Evidence Pack Kurumsal Hazırlık Skoru' : 'Evidence Pack Health Score'}
            </h2>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              {isTr ? healthResult.recommendationTr : healthResult.recommendationEn}
            </p>

            {healthResult.missingCoreDocs.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-[11px] text-amber-400 font-bold uppercase tracking-wider">
                  {isTr ? '⚠️ Eksik Zorunlu Belgeler:' : '⚠️ Missing Core Docs:'}
                </span>
                {healthResult.missingCoreDocs.map((doc, idx) => (
                  <span key={idx} className="text-[11px] bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded font-medium">
                    {doc}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Health Score Gauge Box */}
          <div className="flex items-center gap-6 bg-slate-800/80 border border-slate-700/80 p-5 rounded-2xl shrink-0 w-full sm:w-auto justify-between sm:justify-start">
            <div className="text-center">
              <div className="text-4xl font-extrabold font-mono text-emerald-400">
                {healthResult.score}<span className="text-sm text-slate-400">/100</span>
              </div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                {isTr ? 'Sağlık Skoru' : 'Health Rating'}
              </div>
            </div>

            <div className="h-10 w-px bg-slate-700"></div>

            <div className="space-y-1 text-xs text-slate-300 font-medium">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span>{healthResult.validCount} {isTr ? 'Geçerli Belge' : 'Valid Docs'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                <span>{healthResult.expiringCount} {isTr ? 'Süresi Yaklaşan' : 'Expiring Soon'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                <span>{healthResult.expiredCount} {isTr ? 'Süresi Dolmuş' : 'Expired Docs'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── 2. 8 TAXONOMY CATEGORY CARDS ─── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold font-heading text-ink text-sm sm:text-base tracking-tight flex items-center gap-2">
            <span>🗂️</span>
            <span>{isTr ? 'Kanıt Taksonomisi (8 Kategori Kütüphanesi)' : 'Evidence Taxonomy (8 Categories)'}</span>
          </h3>
          <span className="text-xs text-muted font-mono">{items.length} {isTr ? 'Kayıtlı Belge' : 'Total Items'}</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
          {TAXONOMY_CATEGORIES.map((cat) => {
            const count = items.filter(i => i.category === cat.code || i.kind === cat.code || i.category === cat.key).length;
            const isSelected = selectedCategory === cat.code;

            return (
              <button
                key={cat.code}
                type="button"
                onClick={() => setSelectedCategory(isSelected ? 'ALL' : cat.code)}
                className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between group cursor-pointer ${
                  isSelected
                    ? 'bg-accent/15 border-accent text-accent-ink ring-2 ring-accent/30 scale-[1.02]'
                    : 'bg-surface hover:bg-surface-hover border-border text-ink'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="text-lg">{cat.icon}</span>
                  <span className="text-[10px] font-mono font-bold bg-ground border border-border px-1.5 py-0.5 rounded">
                    {count}
                  </span>
                </div>
                <div>
                  <div className="font-bold text-xs truncate leading-snug">{isTr ? cat.labelTr : cat.labelEn}</div>
                  <div className="text-[9px] text-muted font-mono">{cat.code}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── 3. ACTIONS BAR & SEARCH ─── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-surface border border-border p-4 rounded-2xl shadow-2xs">
        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          {/* Search Box */}
          <div className="relative flex-1 sm:w-64">
            <input
              type="text"
              placeholder={isTr ? "Belge adı, kurum veya etiket ara..." : "Search title, authority, tag..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-ground border border-border rounded-xl pl-9 pr-3 py-2 text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <span className="absolute left-3 top-2.5 text-muted text-xs">🔍</span>
          </div>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="bg-ground border border-border rounded-xl px-3 py-2 text-xs font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
          >
            <option value="ALL">{isTr ? 'Tüm Durumlar' : 'All Statuses'}</option>
            <option value="VALID">{isTr ? 'Geçerli Belgeler' : 'Valid Docs'}</option>
            <option value="EXPIRING_SOON">{isTr ? 'Süresi Yaklaşanlar' : 'Expiring Soon'}</option>
            <option value="EXPIRED">{isTr ? 'Süresi Dolmuşlar' : 'Expired Docs'}</option>
          </select>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
          <button
            onClick={exportCSV}
            className="bg-ground hover:bg-surface-hover text-ink font-semibold text-xs py-2 px-3.5 rounded-xl border border-border shadow-2xs transition flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isTr ? 'CSV Dışa Aktar' : 'Export CSV'}</span>
          </button>

          <button
            onClick={() => setShowUploadModal(true)}
            className="bg-accent hover:opacity-90 text-white font-bold text-xs py-2.5 px-4 rounded-xl shadow-md transition flex items-center gap-2 cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>{isTr ? 'Yeni Belge Yükle (R2)' : 'Upload Evidence (R2)'}</span>
          </button>
        </div>
      </div>

      {/* ─── 4. EVIDENCE DOCUMENTS LIST ─── */}
      <div className="space-y-3">
        {filteredItems.length === 0 ? (
          <div className="text-center py-16 bg-surface border border-border rounded-3xl p-8 space-y-3">
            <div className="text-4xl">📄</div>
            <h4 className="font-bold text-ink text-base">
              {isTr ? 'Kayıtlı Kanıt Belgesi Bulunamadı' : 'No Evidence Documents Found'}
            </h4>
            <p className="text-xs text-muted max-w-sm mx-auto">
              {isTr
                ? 'Seçili filtrelere uygun belge bulunmuyor. Cloudflare R2 üzerine direkt belge yüklemek için yukarıdaki yükle butonunu kullanın.'
                : 'No evidence matches your filters. Upload new documents to Cloudflare R2 repository.'}
            </p>
            <button
              onClick={() => setShowUploadModal(true)}
              className="bg-accent text-white text-xs font-bold px-4 py-2 rounded-xl shadow-sm hover:opacity-90 transition"
            >
              + {isTr ? 'Belge Yükle' : 'Upload Document'}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredItems.map((doc) => {
              const catObj = TAXONOMY_CATEGORIES.find(c => c.code === doc.category || c.key === doc.category) || TAXONOMY_CATEGORIES[2];

              return (
                <div
                  key={doc.id}
                  className="bg-surface border border-border rounded-2xl p-5 shadow-2xs hover:shadow-md hover:border-accent/40 transition-all flex flex-col justify-between space-y-4 group relative overflow-hidden"
                >
                  <div className="space-y-2.5">
                    {/* Card Header Top */}
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-2xl">{catObj.icon}</span>
                      <div className="flex items-center gap-1.5">
                        {getStatusBadge(doc.status, doc.validUntil)}
                        <span className="text-[10px] font-mono text-muted bg-ground border border-border px-1.5 py-0.5 rounded">
                          v{doc.version || 1}
                        </span>
                      </div>
                    </div>

                    {/* Title & Authority */}
                    <div>
                      <h4 className="font-bold text-sm text-ink group-hover:text-accent transition-colors leading-snug line-clamp-2">
                        {doc.title}
                      </h4>
                      {doc.issuingAuthority && (
                        <p className="text-[11px] text-muted font-medium mt-0.5 flex items-center gap-1">
                          <span>🏛️</span>
                          <span className="truncate">{doc.issuingAuthority}</span>
                        </p>
                      )}
                    </div>

                    {/* OCR Summary Snippet */}
                    {doc.body && (
                      <p className="text-xs text-ink-2 bg-ground/60 border border-border/80 rounded-xl p-2.5 line-clamp-3 font-sans leading-relaxed">
                        {doc.body}
                      </p>
                    )}

                    {/* Meta info tags */}
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted">
                      {doc.validUntil && (
                        <span className="bg-ground border border-border px-2 py-0.5 rounded font-mono flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-muted" />
                          <span>{new Date(doc.validUntil).toLocaleDateString(isTr ? 'tr-TR' : 'en-US')}</span>
                        </span>
                      )}
                      <span className="bg-ground border border-border px-2 py-0.5 rounded font-mono uppercase">
                        {doc.confidentiality || 'INTERNAL'}
                      </span>
                    </div>
                  </div>

                  {/* Card Actions Footer */}
                  <div className="pt-3 border-t border-border/80 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedDoc(doc)}
                      className="text-xs font-semibold text-accent hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>{isTr ? 'İncele & İddialar' : 'Inspect & Claims'}</span>
                    </button>

                    <div className="flex items-center gap-1.5">
                      {doc.fileUrl && (
                        <a
                          href={doc.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 text-muted hover:text-ink bg-ground hover:bg-surface border border-border rounded-lg transition"
                          title={isTr ? "Belgeyi Aç / İndir" : "Open Document"}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDelete(doc.id)}
                        className="p-1.5 text-bad/70 hover:text-bad bg-bad/10 hover:bg-bad/20 rounded-lg transition cursor-pointer"
                        title={isTr ? "Sil" : "Delete"}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── 5. UPLOAD MODAL (Presigned R2 Upload) ─── */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-accent/15 text-accent flex items-center justify-center font-bold">
                  ☁️
                </div>
                <div>
                  <h3 className="font-bold font-heading text-ink text-base">
                    {isTr ? 'Cloudflare R2 Kanıt Yükleme' : 'Upload Evidence to R2'}
                  </h3>
                  <p className="text-[11px] text-muted">Sözleşme & AB Hakem Standartlarına Uyumlu</p>
                </div>
              </div>
              <button
                onClick={() => setShowUploadModal(false)}
                className="text-muted hover:text-ink font-bold text-lg p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handlePresignedUploadSubmit} className="space-y-4">
              {/* File Dropzone */}
              <div>
                <label className="block text-xs font-bold text-ink mb-1">
                  {isTr ? 'Belge Dosyası (PDF, DOCX, XLSX, max 100MB)' : 'Evidence File (PDF, DOCX, max 100MB)'}
                </label>
                <input
                  type="file"
                  required
                  accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setUploadFile(file);
                      if (!uploadTitle) setUploadTitle(file.name.replace(/\.[^/.]+$/, ''));
                    }
                  }}
                  className="w-full text-xs bg-ground border border-dashed border-border rounded-2xl p-4 text-muted cursor-pointer file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-accent file:text-white hover:file:opacity-90"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink mb-1">
                  {isTr ? 'Kanıt Kategorisi (Taksonomi)' : 'Category Taxonomy'}
                </label>
                <select
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value)}
                  className="w-full bg-ground border border-border rounded-xl p-2.5 text-xs font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  {TAXONOMY_CATEGORIES.map(c => (
                    <option key={c.code} value={c.code}>
                      {c.icon} {c.code} - {isTr ? c.labelTr : c.labelEn}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink mb-1">
                  {isTr ? 'Belge Başlığı / Açıklama' : 'Document Title'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={isTr ? "Örn: ISO 27001 Bilgi Güvenliği Belgesi" : "e.g. ISO 27001 Certificate"}
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  className="w-full bg-ground border border-border rounded-xl p-2.5 text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-ink mb-1">
                    {isTr ? 'Veren Kurum / Şirket' : 'Issuing Authority'}
                  </label>
                  <input
                    type="text"
                    placeholder="TÜRKAK / İTO / BSI"
                    value={uploadAuthority}
                    onChange={(e) => setUploadAuthority(e.target.value)}
                    className="w-full bg-ground border border-border rounded-xl p-2.5 text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink mb-1">
                    {isTr ? 'Son Geçerlilik Tarihi' : 'Expiry Date'}
                  </label>
                  <input
                    type="date"
                    value={uploadValidUntil}
                    onChange={(e) => setUploadValidUntil(e.target.value)}
                    className="w-full bg-ground border border-border rounded-xl p-2.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
              </div>

              {isUploading && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-[11px] font-bold text-accent">
                    <span>{isTr ? 'Yükleniyor & YZ OCR İşleniyor...' : 'Uploading & AI OCR Processing...'}</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-ground border border-border h-2 rounded-full overflow-hidden">
                    <div className="bg-accent h-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                  </div>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  disabled={isUploading}
                  className="px-4 py-2.5 rounded-xl border border-border text-xs font-semibold text-ink hover:bg-surface-hover transition"
                >
                  {isTr ? 'İptal' : 'Cancel'}
                </button>

                <button
                  type="submit"
                  disabled={isUploading || !uploadFile}
                  className="px-5 py-2.5 rounded-xl bg-accent text-white text-xs font-bold shadow-md hover:opacity-90 transition disabled:opacity-60 cursor-pointer flex items-center gap-2"
                >
                  {isUploading ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>{isTr ? 'Yükleniyor...' : 'Uploading...'}</span>
                    </>
                  ) : (
                    <span>{isTr ? 'Cloudflare R2’ye Yükle →' : 'Upload to Cloudflare R2 →'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── 6. DOCUMENT INSPECTION DRAWER MODAL ─── */}
      {selectedDoc && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-end">
          <div className="bg-surface border-l border-border h-full max-w-lg w-full p-6 sm:p-8 space-y-6 overflow-y-auto animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <span className="text-[10px] font-mono font-bold bg-accent/15 text-accent-ink border border-accent/20 px-2 py-0.5 rounded">
                  {selectedDoc.category || 'CAT-03'}
                </span>
                <h3 className="font-bold font-heading text-ink text-base mt-1 leading-snug">
                  {selectedDoc.title}
                </h3>
              </div>
              <button
                onClick={() => setSelectedDoc(null)}
                className="text-muted hover:text-ink font-bold text-xl p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-ground border border-border rounded-2xl p-4 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted">{isTr ? 'Veren Kurum:' : 'Issuing Authority:'}</span>
                  {selectedDoc.issuingAuthority ? (
                    <span className="font-semibold text-ink">{selectedDoc.issuingAuthority}</span>
                  ) : (
                    <span className="text-muted italic">{t('field.empty')}</span>
                  )}
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">{isTr ? 'Belge No:' : 'Document No:'}</span>
                  {selectedDoc.documentNumber ? (
                    <span className="font-mono text-ink font-semibold">{selectedDoc.documentNumber}</span>
                  ) : (
                    <span className="text-muted italic">{t('field.empty')}</span>
                  )}
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">{isTr ? 'Son Geçerlilik:' : 'Valid Until:'}</span>
                  <span className="font-mono text-ink">
                    {selectedDoc.validUntil ? new Date(selectedDoc.validUntil).toLocaleDateString(isTr ? 'tr-TR' : 'en-US') : 'Süresiz / N/A'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">{isTr ? 'Gizlilik Seviyesi:' : 'Confidentiality:'}</span>
                  <span className="font-mono text-xs text-accent font-bold">{selectedDoc.confidentiality || 'INTERNAL'}</span>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-xs text-ink mb-1.5 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-muted" />
                  <span>{t('documentText.title')}</span>
                </h4>
                {documentText ? (
                  <div className="bg-ground border border-border rounded-2xl p-4 text-xs text-ink-2 leading-relaxed font-sans max-h-48 overflow-y-auto whitespace-pre-line">
                    {documentText}
                  </div>
                ) : (
                  /* There is no OCR behind the upload. Saying "processing" implied one
                     was running and text was on its way; neither is true. */
                  <div className="bg-ground border border-dashed border-border rounded-2xl p-4 text-xs text-muted leading-relaxed">
                    {t('documentText.none')}
                  </div>
                )}
              </div>

              <div>
                <h4 className="font-bold text-xs text-ink mb-1.5">
                  {isTr ? 'Bağlı Kurumsal İddialar (Claim Links)' : 'Linked Corporate Claims'}
                </h4>
                {linkedClaims.length > 0 ? (
                  <div className="bg-accent/10 border border-accent/20 rounded-2xl p-4 text-xs text-accent-ink space-y-2">
                    {linkedClaims.map((link) => (
                      <div key={link.id} className="flex items-start gap-2">
                        <span className="text-accent font-bold">✓</span>
                        <span>{(isTr ? link.claim?.statement : link.claim?.statementEn) || link.claim?.statement}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* This panel used to render one hard-coded sentence — "corporate
                     information security and EU data protection are verified" — with a
                     green tick, for every document, backed by nothing. CLAUDE.md §7. */
                  <div className="bg-ground border border-dashed border-border rounded-2xl p-4 text-xs text-muted leading-relaxed">
                    {t('claims.none')}
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-border flex items-center justify-between">
              {selectedDoc.fileUrl && (
                <a
                  href={selectedDoc.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-accent text-white font-bold text-xs py-2.5 px-4 rounded-xl shadow-xs hover:opacity-90 transition flex items-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>{isTr ? 'R2 Üzerinden Orijinal Belgeyi Aç' : 'Open R2 Original File'}</span>
                </a>
              )}

              <button
                onClick={() => handleDelete(selectedDoc.id)}
                className="text-bad hover:bg-bad/10 border border-bad/30 font-bold text-xs py-2.5 px-4 rounded-xl transition"
              >
                {isTr ? 'Belgeyi Sil' : 'Delete Document'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
