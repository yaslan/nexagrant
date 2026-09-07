'use client';

import React, { useState, useEffect } from 'react';
import {
  FileText,
  Users,
  Lock,
  Unlock,
  Save,
  Sparkles,
  MessageSquare,
  History,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Check,
  Eye,
  Edit3,
  Layers,
  Clock,
  Send,
  X
} from 'lucide-react';
import {
  PartBSectionItem,
  SectionRevisionItem,
  SectionCommentItem,
  CollaboratorPresence,
  DEFAULT_PART_B_SECTIONS,
} from '../types';
import {
  acquireSectionLock,
  releaseSectionLock,
  updateSectionContent,
  addSectionComment,
  resolveSectionComment,
  restoreSectionRevision,
  updatePresenceHeartbeat,
  generateSectionDraftAi,
} from '../server/actions';
import { errorMessage } from '@/lib/errors';

interface PartBCollaborativeEditorProps {
  partId: string;
  opportunityTitle: string;
  tenantId: string;
  initialSections?: PartBSectionItem[];
  initialRevisions?: SectionRevisionItem[];
  initialComments?: SectionCommentItem[];
}

/**
 * Seed rows for a part that has no comments yet. Built per mount so the
 * timestamps read as "an hour ago" rather than a fixed date, and kept out of
 // eslint-disable-next-line react-hooks/purity
 * the component body because `Date.now()` may not run during render.
 */
function demoComments(): SectionCommentItem[] {
  return [
    {
      id: 'cmt-1',
      sectionKey: '1.1_objectives',
      authorName: 'Prof. Klaus Müller',
      authorOrg: 'Fraunhofer Institute',
      // eslint-disable-next-line react-hooks/purity
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      text: 'SO2 hedefinde AI model doğruluğu %99.2 olarak belirtilmiş. Bu metriği test senaryolarıyla detaylandırmalıyız.',
      resolved: false,
    },
    {
      id: 'cmt-2',
      sectionKey: '1.2_methodology',
      authorName: 'Dr. Sofia Rossi',
      authorOrg: 'Politecnico di Milano',
      // eslint-disable-next-line react-hooks/purity
      timestamp: new Date(Date.now() - 7200000).toISOString(),
      text: 'Açık bilim bölümünde Zenodo ve CC-BY lisanslama taahhüdü çok net, teşekkürler.',
      resolved: true,
    },
  ];
}

/** Seed revision for a part with no history yet. See {@link demoComments}. */
function demoRevisions(content: string): SectionRevisionItem[] {
  return [
    {
      id: 'rev-1',
      sectionKey: '1.1_objectives',
      authorName: 'Dr. Mehmet Yılmaz',
      authorOrg: 'Demo SME Consultancy',
      // eslint-disable-next-line react-hooks/purity
      timestamp: new Date(Date.now() - 1800000).toISOString(),
      wordCount: 172,
      summary: 'SMART hedefler ve TRL hedefleri eklendi',
      content,
    },
  ];
}

export function PartBCollaborativeEditor({
  partId,
  opportunityTitle,
  tenantId,
  initialSections = DEFAULT_PART_B_SECTIONS,
  initialRevisions = [],
  initialComments = [],
}: PartBCollaborativeEditorProps) {
  const currentUserId = 'usr-me';
  const currentUserName = 'Dr. Mehmet Yılmaz';
  const currentUserOrg = 'FonBridge Ar-Ge & Konsorsiyum';

  const [sections, setSections] = useState<PartBSectionItem[]>(
    initialSections && initialSections.length > 0 ? initialSections : DEFAULT_PART_B_SECTIONS
  );
  const [activeSectionKey, setActiveSectionKey] = useState<string>('1.1_objectives');
  const activeSection = sections.find((s) => s.key === activeSectionKey) || sections[0]!;

  const [editorText, setEditorText] = useState<string>(activeSection.content || '');
  const [viewMode, setViewMode] = useState<'EDIT' | 'PREVIEW'>('EDIT');
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'SAVED' | 'UNSAVED' | 'SAVING'>('SAVED');

  const [activeDrawer, setActiveDrawer] = useState<'COMMENTS' | 'HISTORY' | 'AI' | null>(null);

  const [comments, setComments] = useState<SectionCommentItem[]>(() =>
    initialComments.length > 0 ? initialComments : demoComments()
  );
  const [newCommentText, setNewCommentText] = useState('');

  const [revisions, setRevisions] = useState<SectionRevisionItem[]>(() =>
    initialRevisions.length > 0 ? initialRevisions : demoRevisions(activeSection.content)
  );

  const [presenceList, setPresenceList] = useState<CollaboratorPresence[]>([
    {
      userId: 'usr-me',
      name: currentUserName,
      org: currentUserOrg,
      color: '#2563EB',
      activeSection: '1.1_objectives',
      lastSeenAt: new Date().toISOString(),
    },
    {
      userId: 'usr-klaus',
      name: 'Prof. Klaus Müller',
      org: 'Fraunhofer Institute (DE)',
      color: '#059669',
      activeSection: '1.2_methodology',
      lastSeenAt: new Date().toISOString(),
    },
    {
      userId: 'usr-sofia',
      name: 'Dr. Sofia Rossi',
      org: 'Politecnico di Milano (IT)',
      color: '#7C3AED',
      activeSection: '2.1_pathways',
      lastSeenAt: new Date().toISOString(),
    },
  ]);

  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiPromptNotes, setAiPromptNotes] = useState('');

  useEffect(() => {
    const sec = sections.find((s) => s.key === activeSectionKey);
    if (sec) {
      setEditorText(sec.content || '');
      setSaveStatus('SAVED');
    }
  }, [activeSectionKey, sections]);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        await updatePresenceHeartbeat(
          partId,
          currentUserId,
          currentUserName,
          currentUserOrg,
          activeSectionKey
        );
      } catch (e) {}
    }, 20000);
    return () => clearInterval(interval);
  }, [partId, activeSectionKey]);

  useEffect(() => {
    if (editorText === activeSection.content) return;
    setSaveStatus('UNSAVED');

    const timer = setTimeout(async () => {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      await handleSaveContent(false);
    }, 2500);

    return () => clearTimeout(timer);
  }, [editorText]);

  const calculateWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
  const currentSectionWords = calculateWords(editorText);
  const currentSectionEstimatedPages = (currentSectionWords / 450).toFixed(1);

  const totalWords = sections.reduce((acc, s) => {
    const content = s.key === activeSectionKey ? editorText : s.content;
    return acc + calculateWords(content || '');
  }, 0);
  const totalEstimatedPages = parseFloat((totalWords / 450).toFixed(1));
  const MAX_PAGE_LIMIT = 45;

  const isLockedByMe = activeSection.lockedBy === currentUserId;
  const isLockedByOther =
    activeSection.lockedBy &&
    activeSection.lockedBy !== currentUserId &&
    activeSection.lockedAt &&
    // eslint-disable-next-line react-hooks/purity
    (Date.now() - new Date(activeSection.lockedAt).getTime()) / 1000 < 60;

  const handleAcquireLock = async () => {
    const res = await acquireSectionLock(
      partId,
      activeSectionKey,
      currentUserId,
      currentUserName,
      currentUserOrg
    );
    if (res.success) {
      setSections((prev) =>
        prev.map((s) =>
          s.key === activeSectionKey
            ? {
                ...s,
                lockedBy: currentUserId,
                lockedByName: currentUserName,
                lockedByOrg: currentUserOrg,
                lockedAt: new Date().toISOString(),
              }
            : s
        )
      );
    } else {
      alert(res.message || 'Bölüm şu anda başka bir ortak tarafından kilitli.');
    }
  };

  const handleReleaseLock = async () => {
    await releaseSectionLock(partId, activeSectionKey, currentUserId);
    setSections((prev) =>
      prev.map((s) =>
        s.key === activeSectionKey
          ? { ...s, lockedBy: null, lockedByName: null, lockedByOrg: null, lockedAt: null }
          : s
      )
    );
  };

  const handleSaveContent = async (isManual: boolean = true) => {
    setIsSaving(true);
    setSaveStatus('SAVING');
    try {
      await updateSectionContent(
        partId,
        activeSectionKey,
        editorText,
        currentUserId,
        currentUserName,
        currentUserOrg,
        isManual ? 'Elle anlık kaydedildi' : 'Otomatik arka plan kaydı'
      );

      setSections((prev) =>
        prev.map((s) =>
          s.key === activeSectionKey
            ? {
                ...s,
                content: editorText,
                lastModifiedBy: currentUserName,
                lastModifiedAt: new Date().toISOString(),
              }
            : s
        )
      );

      const newRev: SectionRevisionItem = {
        // eslint-disable-next-line react-hooks/purity
        id: 'rev-' + Date.now(),
        sectionKey: activeSectionKey,
        authorName: currentUserName,
        authorOrg: currentUserOrg,
        timestamp: new Date().toISOString(),
        wordCount: currentSectionWords,
        summary: isManual ? 'Elle anlık kaydedildi' : 'Otomatik senkronizasyon kaydı',
        content: editorText,
      };
      setRevisions((prev) => [newRev, ...prev.slice(0, 20)]);

      setSaveStatus('SAVED');
    } catch (err) {
      console.error('Error saving content:', err);
      setSaveStatus('UNSAVED');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;

    const cmt = await addSectionComment(
      partId,
      activeSectionKey,
      currentUserName,
      currentUserOrg,
      newCommentText.trim()
    );

    setComments((prev) => [cmt, ...prev]);
    setNewCommentText('');
  };

  const handleToggleResolveComment = async (commentId: string) => {
    await resolveSectionComment(partId, activeSectionKey, commentId);
    setComments((prev) =>
      prev.map((c) => (c.id === commentId ? { ...c, resolved: !c.resolved } : c))
    );
  };

  const handleRestoreRevision = async (rev: SectionRevisionItem) => {
    if (confirm(`${rev.authorName} tarafından oluşturulan (${new Date(rev.timestamp).toLocaleTimeString()}) sürüme geri dönmek istediğinizden emin misiniz?`)) {
      setEditorText(rev.content);
      await restoreSectionRevision(partId, activeSectionKey, rev.id);
      setActiveDrawer(null);
    }
  };

  const handleGenerateAi = async () => {
    setIsAiGenerating(true);
    try {
      const draft = await generateSectionDraftAi(
        partId,
        activeSectionKey,
        activeSection.title,
        opportunityTitle,
        aiPromptNotes
      );
      setEditorText(draft);
      setActiveDrawer(null);
    } catch (e) {
      alert('YZ taslak üretilirken hata oluştu: ' + errorMessage(e));
    } finally {
      setIsAiGenerating(false);
    }
  };

  const activeSectionComments = comments.filter((c) => c.sectionKey === activeSectionKey);
  const activeSectionRevisions = revisions.filter((r) => r.sectionKey === activeSectionKey);

  return (
    <div className="space-y-4">
      {/* ──────────────────────── LIVE PRESENCE BAR ──────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-white shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
          <div>
            <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-blue-400" />
              <span>Canlı Konsorsiyum Eşzamanlı Yazarları ({presenceList.length} Aktif)</span>
            </h3>
            <p className="text-[11px] text-muted mt-0.5">
              Tüm değişiklikler ve kilitler diğer konsorsiyum ortaklarıyla anlık senkronize edilir.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {presenceList.map((user) => (
            <div
              key={user.userId}
              style={{ borderColor: user.color }}
              className="flex items-center gap-2 bg-slate-800/90 border px-3 py-1.5 rounded-full text-xs"
            >
              <div
                style={{ backgroundColor: user.color }}
                className="w-2 h-2 rounded-full ring-2 ring-slate-900"
              />
              <span className="font-semibold text-slate-100">{user.name}</span>
              <span className="text-[10px] text-muted font-mono hidden sm:inline">
                ({user.org.split(' ')[0]})
              </span>
              <span className="bg-slate-700/80 text-[10px] font-mono text-blue-300 px-1.5 py-0.5 rounded">
                {user.activeSection.split('_')[0]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ──────────────────────── GLOBAL PAGE BUDGET MONITOR ──────────────────────── */}
      <div className="bg-surface border border-border rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="space-y-1 w-full sm:w-auto">
          <div className="flex items-center justify-between sm:justify-start gap-3 text-xs font-semibold">
            <span className="text-ink-2 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-indigo-600" />
              <span>Part B Toplam Sayfa Bütçesi:</span>
            </span>
            <span
              className={`font-mono font-bold px-2 py-0.5 rounded text-xs ${
                totalEstimatedPages > MAX_PAGE_LIMIT
                  ? 'bg-red-100 text-red-700 border border-red-300'
                  : totalEstimatedPages > 40
                  ? 'bg-amber-100 text-amber-700 border border-amber-300'
                  : 'bg-emerald-100 text-emerald-700 border border-emerald-300'
              }`}
            >
              {totalEstimatedPages} / {MAX_PAGE_LIMIT} Sayfa ({totalWords.toLocaleString()} Kelime)
            </span>
          </div>

          <div className="w-full sm:w-80 bg-surface-hover h-2.5 rounded-full overflow-hidden border border-border">
            <div
              style={{ width: `${Math.min(100, (totalEstimatedPages / MAX_PAGE_LIMIT) * 100)}%` }}
              className={`h-full transition-all duration-500 ${
                totalEstimatedPages > MAX_PAGE_LIMIT
                  ? 'bg-red-500'
                  : totalEstimatedPages > 40
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
              }`}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs w-full sm:w-auto justify-end">
          {totalEstimatedPages > MAX_PAGE_LIMIT && (
            <span className="text-red-600 flex items-center gap-1 font-semibold text-[11px] bg-red-50 px-2.5 py-1 rounded-lg border border-red-200">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>Sayfa Limiti Aşıldı! (~{(totalEstimatedPages - MAX_PAGE_LIMIT).toFixed(1)} sayfa kırpılmalı)</span>
            </span>
          )}

          <a
            href={`/api/documents/export?type=PART_B&format=docx&partId=${partId}&title=Part_B_Technical_Proposal`}
            target="_blank"
            rel="noreferrer"
            className="bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 shadow-xs text-xs"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Resmî DOCX İndir</span>
          </a>
        </div>
      </div>

      {/* ──────────────────────── MAIN EDITOR GRID ──────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* LEFT COLUMN: Section Tree Navigation (4 cols) */}
        <div className="lg:col-span-4 space-y-3">
          <div className="bg-surface border border-border rounded-2xl p-4 shadow-2xs space-y-3">
            <h4 className="font-bold text-xs uppercase tracking-wider text-muted font-mono flex items-center justify-between">
              <span>Part B Bölüm Ağacı</span>
              <span className="text-muted font-normal">8 Bölüm</span>
            </h4>

            <div className="space-y-2">
              {/* Group 1: Excellence */}
              <div>
                <div className="text-[11px] font-bold text-blue-900 bg-blue-50 px-2.5 py-1 rounded-lg mb-1 flex items-center justify-between">
                  <span>1. EXCELLENCE (Mükemmeliyet)</span>
                  <span className="font-mono text-[10px] text-blue-700">~18 Sayfa</span>
                </div>
                <div className="space-y-1 pl-1">
                  {sections
                    .filter((s) => s.partGroup === '1_EXCELLENCE')
                    .map((s) => {
                      const isActive = s.key === activeSectionKey;
                      const words = calculateWords(s.key === activeSectionKey ? editorText : s.content || '');
                      const estPages = (words / 450).toFixed(1);
                      const secComments = comments.filter((c) => c.sectionKey === s.key && !c.resolved);

                      return (
                        <button
                          key={s.key}
                          onClick={() => setActiveSectionKey(s.key)}
                          className={`w-full text-left p-2.5 rounded-xl transition flex items-start justify-between gap-2 text-xs border ${
                            isActive
                              ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                              : 'bg-ground/70 hover:bg-surface-hover/80 text-ink border-border'
                          }`}
                        >
                          <div className="space-y-0.5 truncate">
                            <div className="font-bold truncate flex items-center gap-1.5">
                              <span>{s.title}</span>
                            </div>
                            <div
                              className={`text-[10px] font-mono ${
                                isActive ? 'text-blue-100' : 'text-muted'
                              }`}
                            >
                              Lider: {s.leadAuthor?.split(' ')[0]} ({s.leadAuthorOrg?.split(' ')[0]})
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-semibold ${
                                isActive
                                  ? 'bg-blue-700 text-white'
                                  : 'bg-slate-200 text-ink-2'
                              }`}
                            >
                              {estPages}/{s.targetPages} s.
                            </span>

                            {secComments.length > 0 && (
                              <span
                                className={`text-[9px] font-bold px-1 rounded-full flex items-center gap-0.5 ${
                                  isActive
                                    ? 'bg-amber-300 text-amber-950'
                                    : 'bg-amber-100 text-amber-800 border border-amber-300'
                                }`}
                              >
                                <MessageSquare className="w-2.5 h-2.5" />
                                {secComments.length}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>

              {/* Group 2: Impact */}
              <div className="pt-1">
                <div className="text-[11px] font-bold text-emerald-900 bg-emerald-50 px-2.5 py-1 rounded-lg mb-1 flex items-center justify-between">
                  <span>2. IMPACT (Etki & Yayma)</span>
                  <span className="font-mono text-[10px] text-emerald-700">~14 Sayfa</span>
                </div>
                <div className="space-y-1 pl-1">
                  {sections
                    .filter((s) => s.partGroup === '2_IMPACT')
                    .map((s) => {
                      const isActive = s.key === activeSectionKey;
                      const words = calculateWords(s.key === activeSectionKey ? editorText : s.content || '');
                      const estPages = (words / 450).toFixed(1);
                      const secComments = comments.filter((c) => c.sectionKey === s.key && !c.resolved);

                      return (
                        <button
                          key={s.key}
                          onClick={() => setActiveSectionKey(s.key)}
                          className={`w-full text-left p-2.5 rounded-xl transition flex items-start justify-between gap-2 text-xs border ${
                            isActive
                              ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                              : 'bg-ground/70 hover:bg-surface-hover/80 text-ink border-border'
                          }`}
                        >
                          <div className="space-y-0.5 truncate">
                            <div className="font-bold truncate">{s.title}</div>
                            <div
                              className={`text-[10px] font-mono ${
                                isActive ? 'text-blue-100' : 'text-muted'
                              }`}
                            >
                              Lider: {s.leadAuthor?.split(' ')[0]} ({s.leadAuthorOrg?.split(' ')[0]})
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-semibold ${
                                isActive
                                  ? 'bg-blue-700 text-white'
                                  : 'bg-slate-200 text-ink-2'
                              }`}
                            >
                              {estPages}/{s.targetPages} s.
                            </span>

                            {secComments.length > 0 && (
                              <span
                                className={`text-[9px] font-bold px-1 rounded-full flex items-center gap-0.5 ${
                                  isActive
                                    ? 'bg-amber-300 text-amber-950'
                                    : 'bg-amber-100 text-amber-800 border border-amber-300'
                                }`}
                              >
                                <MessageSquare className="w-2.5 h-2.5" />
                                {secComments.length}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>

              {/* Group 3: Implementation */}
              <div className="pt-1">
                <div className="text-[11px] font-bold text-purple-900 bg-purple-50 px-2.5 py-1 rounded-lg mb-1 flex items-center justify-between">
                  <span>3. IMPLEMENTATION (Uygulama)</span>
                  <span className="font-mono text-[10px] text-purple-700">~13 Sayfa</span>
                </div>
                <div className="space-y-1 pl-1">
                  {sections
                    .filter((s) => s.partGroup === '3_IMPLEMENTATION')
                    .map((s) => {
                      const isActive = s.key === activeSectionKey;
                      const words = calculateWords(s.key === activeSectionKey ? editorText : s.content || '');
                      const estPages = (words / 450).toFixed(1);
                      const secComments = comments.filter((c) => c.sectionKey === s.key && !c.resolved);

                      return (
                        <button
                          key={s.key}
                          onClick={() => setActiveSectionKey(s.key)}
                          className={`w-full text-left p-2.5 rounded-xl transition flex items-start justify-between gap-2 text-xs border ${
                            isActive
                              ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                              : 'bg-ground/70 hover:bg-surface-hover/80 text-ink border-border'
                          }`}
                        >
                          <div className="space-y-0.5 truncate">
                            <div className="font-bold truncate">{s.title}</div>
                            <div
                              className={`text-[10px] font-mono ${
                                isActive ? 'text-blue-100' : 'text-muted'
                              }`}
                            >
                              Lider: {s.leadAuthor?.split(' ')[0]} ({s.leadAuthorOrg?.split(' ')[0]})
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-semibold ${
                                isActive
                                  ? 'bg-blue-700 text-white'
                                  : 'bg-slate-200 text-ink-2'
                              }`}
                            >
                              {estPages}/{s.targetPages} s.
                            </span>

                            {secComments.length > 0 && (
                              <span
                                className={`text-[9px] font-bold px-1 rounded-full flex items-center gap-0.5 ${
                                  isActive
                                    ? 'bg-amber-300 text-amber-950'
                                    : 'bg-amber-100 text-amber-800 border border-amber-300'
                                }`}
                              >
                                <MessageSquare className="w-2.5 h-2.5" />
                                {secComments.length}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT/CENTER COLUMN: Active Section Collaborative Editor (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-surface border border-border rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
              <div>
                <h3 className="font-bold text-base text-ink flex items-center gap-2">
                  <span>{activeSection.title}</span>
                </h3>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted mt-1 font-mono">
                  <span>
                    Sorumlu: <strong>{activeSection.leadAuthor}</strong> ({activeSection.leadAuthorOrg})
                  </span>
                  <span>•</span>
                  <span>Hedef: {activeSection.targetPages} Sayfa</span>
                  <span>•</span>
                  <span className="text-blue-600 font-semibold">
                    Şu an: ~{currentSectionEstimatedPages} Sayfa ({currentSectionWords} Kelime)
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {saveStatus === 'SAVING' && (
                  <span className="text-[11px] font-mono text-amber-600 bg-amber-50 px-2 py-1 rounded flex items-center gap-1">
                    <Clock className="w-3 h-3 animate-spin" />
                    <span>Kaydediliyor...</span>
                  </span>
                )}
                {saveStatus === 'SAVED' && (
                  <span className="text-[11px] font-mono text-emerald-600 bg-emerald-50 px-2 py-1 rounded flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    <span>Senkronize</span>
                  </span>
                )}
                {saveStatus === 'UNSAVED' && (
                  <span className="text-[11px] font-mono text-muted bg-surface-hover px-2 py-1 rounded">
                    Değişiklik var...
                  </span>
                )}

                {isLockedByMe ? (
                  <button
                    onClick={handleReleaseLock}
                    className="bg-emerald-50 border border-emerald-300 text-emerald-700 hover:bg-emerald-100 px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Kilidi Bırak</span>
                  </button>
                ) : isLockedByOther ? (
                  <div className="bg-red-50 border border-red-300 text-red-700 px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" />
                    <span>{activeSection.lockedByName?.split(' ')[0]} Düzenliyor</span>
                  </div>
                ) : (
                  <button
                    onClick={handleAcquireLock}
                    className="bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Bölümü Kilitle</span>
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-1.5 bg-surface-hover p-1 rounded-xl text-xs font-semibold">
                <button
                  onClick={() => setViewMode('EDIT')}
                  className={`px-3 py-1 rounded-lg transition flex items-center gap-1.5 ${
                    viewMode === 'EDIT'
                      ? 'bg-surface text-ink shadow-2xs'
                      : 'text-ink-2 hover:text-ink'
                  }`}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Düzenle (Markdown)</span>
                </button>
                <button
                  onClick={() => setViewMode('PREVIEW')}
                  className={`px-3 py-1 rounded-lg transition flex items-center gap-1.5 ${
                    viewMode === 'PREVIEW'
                      ? 'bg-surface text-ink shadow-2xs'
                      : 'text-ink-2 hover:text-ink'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Önizleme</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveDrawer('AI')}
                  className="bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>YZ Eş-Yazar Asistanı</span>
                </button>

                <button
                  onClick={() => setActiveDrawer(activeDrawer === 'COMMENTS' ? null : 'COMMENTS')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition flex items-center gap-1.5 ${
                    activeDrawer === 'COMMENTS'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-surface text-ink-2 border-border hover:bg-ground'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                  <span>İnceleme Yorumları ({activeSectionComments.length})</span>
                </button>

                <button
                  onClick={() => setActiveDrawer(activeDrawer === 'HISTORY' ? null : 'HISTORY')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition flex items-center gap-1.5 ${
                    activeDrawer === 'HISTORY'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-surface text-ink-2 border-border hover:bg-ground'
                  }`}
                >
                  <History className="w-3.5 h-3.5 text-ink-2" />
                  <span>Sürüm Geçmişi</span>
                </button>

                <button
                  onClick={() => handleSaveContent(true)}
                  disabled={isSaving}
                  className="bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Kaydet</span>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {viewMode === 'EDIT' ? (
                <div className="relative">
                  <textarea
                    rows={18}
                    value={editorText}
                    onChange={(e) => setEditorText(e.target.value)}
                    placeholder="Bölüm içeriğini buraya yazın veya YZ Eş-Yazar Asistanı ile taslak üretin..."
                    className="w-full rounded-xl border border-border p-4 font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none bg-ground/50 leading-relaxed"
                  />
                  <div className="absolute bottom-3 right-3 text-[10px] font-mono bg-surface/90 border border-border px-2 py-0.5 rounded text-muted shadow-2xs">
                    {currentSectionWords} kelime | ~{currentSectionEstimatedPages} sayfa
                  </div>
                </div>
              ) : (
                <div className="min-h-[360px] rounded-xl border border-border p-5 bg-surface prose prose-sm max-w-none text-xs leading-relaxed overflow-y-auto max-h-[500px]">
                  <div className="whitespace-pre-wrap font-sans text-ink">
                    {editorText}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ──────────────────────── SIDE DRAWER 1: INLINE COMMENTS ──────────────────────── */}
      {activeDrawer === 'COMMENTS' && (
        <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-blue-600" />
              <h4 className="font-bold text-sm text-ink">
                {activeSection.title} — İnceleme ve Ortak Yorumları
              </h4>
            </div>
            <button
              onClick={() => setActiveDrawer(null)}
              className="p-1 text-muted hover:text-ink-2 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleAddComment} className="flex gap-2">
            <input
              type="text"
              value={newCommentText}
              onChange={(e) => setNewCommentText(e.target.value)}
              placeholder="Bu bölüme bir revizyon notu veya soru ekleyin..."
              className="flex-1 border border-border rounded-xl p-2.5 text-xs bg-ground focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Gönder</span>
            </button>
          </form>

          <div className="space-y-3 pt-2">
            {activeSectionComments.length === 0 ? (
              <p className="text-xs text-muted py-4 text-center">
                Bu bölüm için henüz bir inceleme yorumu bulunmuyor.
              </p>
            ) : (
              activeSectionComments.map((cmt) => (
                <div
                  key={cmt.id}
                  className={`p-3.5 rounded-xl border text-xs space-y-2 transition ${
                    cmt.resolved
                      ? 'bg-ground border-border opacity-60'
                      : 'bg-amber-50/50 border-amber-200/80'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-ink">{cmt.authorName}</span>
                      <span className="text-[11px] text-muted font-mono">
                        ({cmt.authorOrg})
                      </span>
                    </div>
                    <span className="text-[10px] text-muted font-mono">
                      {new Date(cmt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <p className="text-ink leading-normal">{cmt.text}</p>

                  <div className="flex items-center justify-end pt-1">
                    <button
                      onClick={() => handleToggleResolveComment(cmt.id)}
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-md flex items-center gap-1 transition ${
                        cmt.resolved
                          ? 'text-ink-2 bg-slate-200 hover:bg-slate-300'
                          : 'text-emerald-700 bg-emerald-100 hover:bg-emerald-200'
                      }`}
                    >
                      <Check className="w-3 h-3" />
                      <span>{cmt.resolved ? 'Yeniden Aç' : 'Çözüldü Olarak İşaretle'}</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ──────────────────────── SIDE DRAWER 2: REVISION HISTORY ──────────────────────── */}
      {activeDrawer === 'HISTORY' && (
        <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-purple-600" />
              <h4 className="font-bold text-sm text-ink">
                {activeSection.title} — Zaman Damgalı Sürüm Geçmişi
              </h4>
            </div>
            <button
              onClick={() => setActiveDrawer(null)}
              className="p-1 text-muted hover:text-ink-2 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3">
            {activeSectionRevisions.map((rev, idx) => (
              <div
                key={rev.id || idx}
                className="bg-ground border border-border p-3.5 rounded-xl flex items-center justify-between gap-4 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-ink">{rev.authorName}</span>
                    <span className="text-[10px] text-muted font-mono">
                      ({rev.authorOrg})
                    </span>
                    <span className="bg-purple-100 text-purple-800 text-[10px] font-mono px-1.5 py-0.5 rounded">
                      {rev.wordCount} Kelime
                    </span>
                  </div>
                  <p className="text-[11px] text-ink-2">{rev.summary}</p>
                  <span className="text-[10px] text-muted font-mono block">
                    {new Date(rev.timestamp).toLocaleString('tr-TR')}
                  </span>
                </div>

                <button
                  onClick={() => handleRestoreRevision(rev)}
                  className="bg-surface border border-border hover:bg-surface-hover text-ink px-3 py-1.5 rounded-lg font-semibold text-[11px] transition flex items-center gap-1 shrink-0 shadow-2xs"
                >
                  <RotateCcw className="w-3 h-3 text-purple-600" />
                  <span>Bu Sürüme Dön</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ──────────────────────── SIDE DRAWER 3: AI CO-AUTHOR ──────────────────────── */}
      {activeDrawer === 'AI' && (
        <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-950 text-white border border-indigo-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-indigo-800 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              <div>
                <h4 className="font-bold text-base text-white">
                  YZ Eş-Yazar Asistanı (Horizon Europe Evaluator Lens)
                </h4>
                <p className="text-xs text-indigo-300 mt-0.5">
                  Seçili Bölüm: <strong>{activeSection.title}</strong>
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveDrawer(null)}
              className="p-1 text-muted hover:text-white rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-3 text-xs">
            <label className="font-semibold text-slate-200 block">
              Özel Odak Noktaları veya Konsorsiyum Notları (Opsiyonel):
            </label>
            <textarea
              rows={3}
              value={aiPromptNotes}
              onChange={(e) => setAiPromptNotes(e.target.value)}
              placeholder="Örn: Fraunhofer ile geliştirilen mikromimari soğutma deneylerini ve 3 demo sahasını vurgula..."
              className="w-full border border-indigo-700/60 rounded-xl p-3 bg-slate-950/80 text-xs text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-indigo-400 focus:outline-none font-mono"
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              <button
                type="button"
                onClick={() =>
                  setAiPromptNotes(
                    'SMART hedefler, TRL 4-7 ilerlemesi ve state-of-the-art karşılaştırması ekle'
                  )
                }
                className="bg-indigo-950/80 border border-indigo-800 hover:border-indigo-600 text-indigo-200 p-2 rounded-lg text-left text-[11px] transition"
              >
                🎯 SMART & SOTA Odaklı
              </button>
              <button
                type="button"
                onClick={() =>
                  setAiPromptNotes(
                    'Açık bilim (FAIR), Zenodo açık veri deposu ve cinsiyet boyutu entegrasyonu'
                  )
                }
                className="bg-indigo-950/80 border border-indigo-800 hover:border-indigo-600 text-indigo-200 p-2 rounded-lg text-left text-[11px] transition"
              >
                🔬 Açık Bilim & FAIR
              </button>
              <button
                type="button"
                onClick={() =>
                  setAiPromptNotes(
                    'Ticari sömürü, Fikri Mülkiyet (IP) konsorsiyum protokolü ve pazar ölçeği'
                  )
                }
                className="bg-indigo-950/80 border border-indigo-800 hover:border-indigo-600 text-indigo-200 p-2 rounded-lg text-left text-[11px] transition"
              >
                📈 Etki, DEC & IP Planı
              </button>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-indigo-900/60">
              <button
                type="button"
                onClick={() => setActiveDrawer(null)}
                className="px-4 py-2 rounded-xl text-muted hover:text-white transition text-xs font-semibold"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleGenerateAi}
                disabled={isAiGenerating}
                className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-bold px-5 py-2.5 rounded-xl transition text-xs shadow-lg flex items-center gap-2 disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>{isAiGenerating ? 'Taslak Üretiliyor (2 Kredi)...' : 'Bölüm Taslağını Üret & Editöre Aktar'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
