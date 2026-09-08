'use client';

import React, { useState, useTransition, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { Gate } from '@prisma/client';
import {
  moveOpportunityStage,
  createOpportunity,
  assignOpportunityOwner,
  addOpportunityNote,
  getOpportunityFormMembers,
  getSuggestedTopics
} from './actions';
import type { NoteEntry, OpportunityItem, WorkspaceMember } from '@/lib/k5-pipeline/pipelineStore';
import { errorMessage } from '@/lib/errors';

interface KanbanBoardProps {
  /**
   * OpportunityItem, not the bare Opportunity row: the board reads `ownerName`
   * and `notesList`, which the pipeline store adds and the table does not have.
   * The page feeds it DB rows and in-memory rows merged into this one shape.
   */
  opportunities: OpportunityItem[];
  workspace?: string;
  locale?: string;
}

/**
 * Identity for a toast, so its dismiss timer can tell it apart from a later
 * one. A counter rather than `Date.now()`: the clock is impure during render,
 * and two toasts raised in the same millisecond would have collided.
 */
let toastSequence = 0;
const nextToastId = () => (toastSequence += 1);

/** The intended-role filter above the board; matches the <option> values. */
type RoleFilter = 'all' | 'coordinator' | 'partner';

const GATES: { key: Gate; subtitle: string; color: string }[] = [
  { key: 'G0', subtitle: 'Stratejik Uygunluk & Filtre', color: 'border-t-blue-500' },
  { key: 'G1', subtitle: 'Konsept Notu & Mimari', color: 'border-t-teal-500' },
  { key: 'G2', subtitle: 'Partner Eşleştirme & Bütçe', color: 'border-t-purple-500' },
  { key: 'G3', subtitle: 'Part A & B / Hakem Simülasyonu', color: 'border-t-amber-500' },
  { key: 'G4', subtitle: 'AB Portalına Teslim & Onay', color: 'border-t-emerald-500' },
];

export default function KanbanBoard({
  opportunities: initialOpps,
  workspace = 'default',
  locale = 'tr',
}: KanbanBoardProps) {
  const [opps, setOpps] = useState<OpportunityItem[]>(initialOpps);
  const [isPending, startTransition] = useTransition();

  // Real tenant members and live call topics — fetched once on mount, since this
  // client component has no server context of its own to read them with.
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [suggestedTopics, setSuggestedTopics] = useState<{ identifier: string; title: string }[]>([]);

  useEffect(() => {
    getOpportunityFormMembers().then((res) => {
      if (res.success) setMembers(res.members);
    });
    getSuggestedTopics().then((res) => {
      if (res.success) setSuggestedTopics(res.topics);
    });
  }, []);

  // Expanded cards state (default minimized for clean high-density view)
  const [expandedCardIds, setExpandedCardIds] = useState<Record<string, boolean>>({});
  const [allExpanded, setAllExpanded] = useState(false);

  // New Note Input State per Card
  const [noteInputs, setNoteInputs] = useState<Record<string, { text: string; authorId: string }>>({});

  const toggleExpand = (oppId: string) => {
    setExpandedCardIds((prev) => ({ ...prev, [oppId]: !prev[oppId] }));
  };

  const toggleAllExpand = () => {
    const nextState = !allExpanded;
    setAllExpanded(nextState);
    const newMap: Record<string, boolean> = {};
    opps.forEach((o) => {
      newMap[o.id] = nextState;
    });
    setExpandedCardIds(newMap);
  };

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalStage, setModalStage] = useState<Gate>('G0');

  // New Opportunity Form
  const [formData, setFormData] = useState({
    title: '',
    topicId: '',
    intendedRole: 'coordinator',
    ownerId: '',
    stage: 'G0' as Gate,
    notes: '',
  });

  // The owner the form will actually submit. The member list is fetched after
  // mount, so `formData.ownerId` starts empty and cannot default to `members[0]`
  // the way the old fixed array did — this derives the fallback at render time
  // instead of writing it back into state from an effect (which would be a
  // cascading render, and is what `react-hooks/set-state-in-effect` forbids).
  const selectedOwnerId = formData.ownerId || members[0]?.id || '';

  // Toasts
  const [toast, setToast] = useState<{ id: number; text: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    const id = nextToastId();
    setToast({ id, text, type });
    setTimeout(() => {
      setToast((prev) => (prev?.id === id ? null : prev));
    }, 4000);
  };

  // Drag & Drop
  const handleDragStart = (e: React.DragEvent, oppId: string) => {
    e.dataTransfer.setData('oppId', oppId);
  };

  const handleDrop = async (e: React.DragEvent, newStage: Gate) => {
    e.preventDefault();
    const oppId = e.dataTransfer.getData('oppId');
    if (!oppId) return;

    const opp = opps.find((o) => o.id === oppId);
    if (!opp || opp.stage === newStage) return;

    setOpps((prev) => prev.map((o) => (o.id === oppId ? { ...o, stage: newStage } : o)));

    startTransition(async () => {
      try {
        await moveOpportunityStage(oppId, newStage);
        showToast(`Fırsat ${newStage} aşamasına taşındı.`, 'info');
      } catch (err) {
        console.error(err);
        showToast('Aşama güncellenirken hata oluştu.', 'error');
        setOpps(initialOpps);
      }
    });
  };

  const allowDrop = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // Quick Change Owner / Assign Responsible User
  const handleAssignOwner = (oppId: string, memberId: string) => {
    const member = members.find((m) => m.id === memberId);
    const ownerName = member ? member.name : 'Atanmadı';

    setOpps((prev) =>
      prev.map((o) => (o.id === oppId ? { ...o, ownerId: memberId, ownerName } : o))
    );

    startTransition(async () => {
      try {
        await assignOpportunityOwner({ opportunityId: oppId, ownerId: memberId, ownerName });
        showToast(`Fırsat ${ownerName} kişisine atandı!`, 'success');
      } catch (err) {
        console.error(err);
        showToast('Atama sırasında hata oluştu.', 'error');
      }
    });
  };

  // Add Note to Card
  const handleAddNote = (oppId: string) => {
    const cardInput = noteInputs[oppId];
    if (!cardInput || !cardInput.text.trim()) return;

    const author = members.find((m) => m.id === cardInput.authorId) || members[0];
    if (!author) {
      showToast('Kullanıcı listesi henüz yüklenmedi, lütfen tekrar deneyin.', 'error');
      return;
    }
    const text = cardInput.text.trim();

    startTransition(async () => {
      try {
        const res = await addOpportunityNote({
          opportunityId: oppId,
          text,
          authorName: author.name,
          authorAvatar: author.avatar,
        });

        if (res.success && res.note) {
          setOpps((prev) =>
            prev.map((o) => {
              if (o.id === oppId) {
                const existingNotes = o.notesList || [];
                return { ...o, notesList: [...existingNotes, res.note] };
              }
              return o;
            })
          );

          // Clear note input text for this card
          setNoteInputs((prev) => ({
            ...prev,
            [oppId]: { ...prev[oppId], text: '' },
          }));

          showToast(`${author.name} kullanıcısının notu eklendi!`, 'success');
        }
      } catch (err) {
        console.error(err);
        showToast('Not eklenirken hata oluştu.', 'error');
      }
    });
  };

  // Form Submit: Create Opportunity
  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    const targetStage = formData.stage || modalStage || 'G0';
    const member = members.find((m) => m.id === selectedOwnerId);

    startTransition(async () => {
      try {
        const res = await createOpportunity({
          workspaceSlug: workspace,
          title: formData.title.trim(),
          topicId: formData.topicId.trim() || undefined,
          intendedRole: formData.intendedRole,
          ownerId: selectedOwnerId || undefined,
          ownerName: member?.name || undefined,
          stage: targetStage,
          notes: formData.notes.trim() || undefined,
        });

        if (res.success && res.opportunity) {
          setOpps((prev) => [res.opportunity, ...prev]);
          setExpandedCardIds((prev) => ({ ...prev, [res.opportunity.id]: true }));
          setIsModalOpen(false);
          setFormData({
            title: '',
            topicId: '',
            intendedRole: 'coordinator',
            ownerId: '',
            stage: 'G0',
            notes: '',
          });
          showToast(`"${res.opportunity.title}" fırsatı ${member?.name || ''} üzerine atanarak oluşturuldu!`, 'success');
        }
      } catch (err) {
        showToast(errorMessage(err, 'Fırsat oluşturulurken hata meydana geldi.'), 'error');
      }
    });
  };

  // Filtered list
  const filteredOpps = useMemo(() => {
    return opps.filter((opp) => {
      const matchesSearch =
        opp.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (opp.topicId && opp.topicId.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (opp.ownerName && opp.ownerName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (opp.notesList && opp.notesList.some((n) => n.text.toLowerCase().includes(searchQuery.toLowerCase())));

      if (!matchesSearch) return false;

      if (roleFilter !== 'all') {
        const role = (opp.intendedRole || 'coordinator').toLowerCase();
        if (roleFilter === 'coordinator' && role !== 'coordinator') return false;
        if (roleFilter === 'partner' && role !== 'partner') return false;
      }

      if (ownerFilter !== 'all') {
        if (opp.ownerId !== ownerFilter) return false;
      }

      return true;
    });
  }, [opps, searchQuery, roleFilter, ownerFilter]);

  const openCreateModalForStage = (gate: Gate) => {
    setModalStage(gate);
    setFormData((prev) => ({ ...prev, stage: gate }));
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6" data-testid="pipeline-board">
      {/* Toast */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 animate-in slide-in-from-top-2">
          <div
            className={`px-4 py-3 rounded-xl shadow-lg border text-sm font-semibold flex items-center gap-2 ${
              toast.type === 'success'
                ? 'bg-ok/15 text-ok border-ok/30'
                : toast.type === 'error'
                ? 'bg-bad/15 text-bad border-bad/30'
                : 'bg-surface text-ink border-border shadow-xl'
            }`}
          >
            <span>{toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : 'ℹ'}</span>
            <span>{toast.text}</span>
          </div>
        </div>
      )}

      {/* Top Header & Action Bar */}
      <div className="bg-surface border border-border rounded-2xl p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-muted mb-1">
            <Link href={`/${locale}/${workspace}/dashboard`} className="hover:text-ink transition-colors">
              Dashboard
            </Link>
            <span>/</span>
            <span className="text-accent-ink font-semibold">Stage-Gate Pipeline</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold font-heading text-ink">
            Fırsat & Teklif Boru Hattı
          </h1>
          <p className="text-xs md:text-sm text-muted mt-0.5">
            G0 Triage fizibilitesinden G4 nihai başvuru teslimine kadar çalışma grubunuzdaki kullanıcılarla tekliflerinizi yönetin.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end flex-wrap">
          {/* Expand / Collapse All Toggle */}
          <button
            onClick={toggleAllExpand}
            className="text-xs bg-ground border border-border hover:bg-surface text-ink-2 font-medium px-3 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
            title="Tüm kartları genişlet veya küçült"
          >
            <span>{allExpanded ? '▲ Tümünü Küçült' : '▼ Tümünü Genişlet'}</span>
          </button>

          {/* Search Input */}
          <div className="relative w-44 sm:w-56">
            <input
              type="text"
              placeholder="Fırsat, not veya kişi ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs bg-ground border border-border rounded-xl px-3 py-2.5 pl-8 text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <span className="absolute left-2.5 top-2.5 text-muted text-xs">🔍</span>
          </div>

          {/* User Filter */}
          <select
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            className="text-xs bg-ground border border-border rounded-xl px-3 py-2.5 font-medium text-ink focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="all">👥 Tüm Kullanıcılar</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.avatar} {m.name}
              </option>
            ))}
          </select>

          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
            className="text-xs bg-ground border border-border rounded-xl px-3 py-2.5 font-medium text-ink focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="all">Tüm Roller</option>
            <option value="coordinator">👑 Koordinatör</option>
            <option value="partner">🤝 Ortak</option>
          </select>

          {/* + New Opportunity Main Trigger Button */}
          <button
            onClick={() => openCreateModalForStage('G0')}
            className="bg-accent hover:opacity-90 text-white font-semibold text-xs md:text-sm px-4 py-2.5 rounded-xl shadow-2xs transition-all flex items-center gap-2 shrink-0 cursor-pointer"
          >
            <span className="text-base leading-none font-bold">+</span>
            <span>Yeni Fırsat Ekle</span>
          </button>
        </div>
      </div>

      {/* Kanban Board Column Container */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 overflow-x-auto pb-6 min-h-[calc(100vh-280px)]">
        {GATES.map(({ key, subtitle, color }) => {
          const stageOpps = filteredOpps.filter((o) => o.stage === key);

          return (
            <div
              key={key}
              className={`bg-ground/50 border border-border rounded-2xl flex flex-col border-t-4 ${color} transition-all shadow-2xs`}
              onDragOver={allowDrop}
              onDrop={(e) => handleDrop(e, key)}
            >
              {/* Column Header */}
              <div className="p-4 border-b border-border bg-surface/80 rounded-t-xl flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-xs text-ink uppercase tracking-wider">{key}</h3>
                    <span className="bg-ground text-ink-2 border border-border font-mono text-[11px] font-bold px-2 py-0.5 rounded-full">
                      {stageOpps.length}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted font-medium mt-0.5">{subtitle}</div>
                </div>

                {/* Quick Add Button per Column */}
                <button
                  onClick={() => openCreateModalForStage(key)}
                  title={`${key} aşamasına yeni fırsat ekle`}
                  className="w-6 h-6 rounded-lg bg-ground hover:bg-accent/15 text-muted hover:text-accent-ink border border-border flex items-center justify-center font-bold text-sm transition"
                >
                  +
                </button>
              </div>

              {/* Column Cards Drop Area */}
              <div className="p-3 flex-1 overflow-y-auto space-y-3 min-h-[160px]">
                {stageOpps.map((opp) => {
                  const isCoord = (opp.intendedRole || 'coordinator').toLowerCase() === 'coordinator';
                  const currentMember = members.find((m) => m.id === opp.ownerId) || {
                    name: opp.ownerName || 'Atanmadı',
                    avatar: '👤',
                  };
                  const isExpanded = !!expandedCardIds[opp.id];

                  const notesList: NoteEntry[] = opp.notesList || [];
                  const cardNoteInput = noteInputs[opp.id] || { text: '', authorId: members[0]?.id ?? '' };

                  return (
                    <div
                      key={opp.id}
                      data-testid={`pipeline-card-${opp.id}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, opp.id)}
                      className={`bg-surface rounded-xl shadow-2xs border border-border cursor-grab active:cursor-grabbing hover:border-accent hover:shadow-md transition-all ${
                        isPending ? 'opacity-60' : ''
                      } ${isExpanded ? 'p-4 space-y-3' : 'p-3 space-y-2'}`}
                    >
                      {/* Top Bar / Header of Card (Always Visible & Clickable to Toggle Expand) */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0 ${
                              isCoord
                                ? 'bg-purple-500/15 text-purple-400 border border-purple-500/20'
                                : 'bg-accent/15 text-accent-ink border border-accent/20'
                            }`}
                          >
                            <span>{isCoord ? '👑' : '🤝'}</span>
                            <span>{isCoord ? 'Koordinatör' : 'Ortak'}</span>
                          </span>

                          {/* Minimized User Badge */}
                          {!isExpanded && (
                            <span
                              className="text-[10px] font-semibold bg-ground border border-border text-ink-2 px-1.5 py-0.5 rounded flex items-center gap-1 truncate max-w-[90px]"
                              title={`Atanan: ${currentMember.name}`}
                            >
                              <span>{currentMember.avatar}</span>
                              <span className="truncate">{currentMember.name.split(' ')[0]}</span>
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Notes Count Badge */}
                          {notesList.length > 0 && (
                            <span
                              className="text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"
                              title={`${notesList.length} Not Var`}
                            >
                              <span>💬</span>
                              <span>{notesList.length}</span>
                            </span>
                          )}

                          {opp.g0Score !== null && opp.g0Score !== undefined && (
                            <span
                              data-testid={`pipeline-card-g0-${opp.id}`}
                              className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full ${
                                opp.g0Score >= 80
                                  ? 'bg-ok/15 text-ok border border-ok/30'
                                  : 'bg-amber/15 text-amber border border-amber/30'
                              }`}
                              title="AI Gate Uyum Skoru"
                            >
                              ⭐ {opp.g0Score}
                            </span>
                          )}

                          {/* Toggle Expand Arrow Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpand(opp.id);
                            }}
                            className="text-[10px] bg-ground hover:bg-accent/15 text-muted hover:text-accent-ink border border-border px-1.5 py-0.5 rounded font-bold transition cursor-pointer"
                            title={isExpanded ? 'Kartı Küçült' : 'Detaylar İçin Genişlet'}
                          >
                            {isExpanded ? '▲' : '▼'}
                          </button>
                        </div>
                      </div>

                      {/* Title (Clicking title expands/collapses) */}
                      <h4
                        onClick={() => toggleExpand(opp.id)}
                        className={`font-bold text-xs text-ink leading-snug cursor-pointer hover:text-accent transition-colors ${
                          isExpanded ? 'line-clamp-none' : 'line-clamp-1'
                        }`}
                        title={opp.title}
                      >
                        {opp.title}
                      </h4>

                      {/* ─── EXPANDED DETAILS CONTENT ─── */}
                      {isExpanded && (
                        <div className="space-y-3 pt-2 border-t border-border/60 animate-in fade-in duration-150">
                          {/* Topic Identifier */}
                          {opp.topicId && (
                            <div className="text-[10px] bg-ground border border-border text-muted px-2 py-1 rounded font-mono truncate max-w-full">
                              {opp.topicId}
                            </div>
                          )}

                          {/* Full Assigned User Dropdown Pill */}
                          <div className="flex items-center justify-between bg-ground/80 border border-border rounded-lg px-2.5 py-1 text-[11px] min-w-0 overflow-hidden">
                            <span className="text-muted text-[10px] font-semibold shrink-0">Atanan:</span>
                            <div className="flex items-center gap-1 min-w-0 overflow-hidden max-w-[170px]">
                              <span className="text-xs shrink-0">{currentMember.avatar}</span>
                              <select
                                value={opp.ownerId || ''}
                                onChange={(e) => handleAssignOwner(opp.id, e.target.value)}
                                className="bg-transparent font-bold text-ink text-[11px] focus:outline-none cursor-pointer hover:text-blue-600 truncate max-w-full"
                                title="Sorumlu kullanıcıyı değiştir"
                              >
                                {members.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {/* ─── USER-ATTRIBUTED NOTES LIST ─── */}
                          <div className="space-y-2 pt-1 border-t border-border/40">
                            <div className="flex items-center justify-between text-[11px] font-bold text-ink">
                              <span>💬 Notlar & Güncellemeler</span>
                              <span className="text-[10px] text-muted font-normal">
                                ({notesList.length} Not)
                              </span>
                            </div>

                            {notesList.length > 0 ? (
                              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                                {notesList.map((note) => (
                                  <div
                                    key={note.id}
                                    className="bg-ground/70 border border-border rounded-lg p-2 text-[11px] space-y-1"
                                  >
                                    <div className="flex items-center justify-between text-[10px] text-muted font-medium">
                                      <span className="font-bold text-ink flex items-center gap-1">
                                        <span>{note.authorAvatar || '👤'}</span>
                                        <span>{note.authorName}</span>
                                      </span>
                                      <span className="font-mono text-[9px]">{note.createdAt}</span>
                                    </div>
                                    <p className="text-ink-2 leading-tight">{note.text}</p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-[10px] text-muted italic">
                                Henüz not eklenmedi.
                              </p>
                            )}

                            {/* Add New Note Inline Input */}
                            <div className="bg-ground border border-border rounded-xl p-2 space-y-2">
                              <div className="flex items-center justify-between gap-1 text-[10px]">
                                <span className="text-muted font-semibold">Not Yazan:</span>
                                <select
                                  value={cardNoteInput.authorId}
                                  onChange={(e) =>
                                    setNoteInputs((prev) => ({
                                      ...prev,
                                      [opp.id]: {
                                        ...cardNoteInput,
                                        authorId: e.target.value,
                                      },
                                    }))
                                  }
                                  className="bg-surface border border-border rounded px-1.5 py-0.5 text-ink font-bold focus:outline-none"
                                >
                                  {members.map((m) => (
                                    <option key={m.id} value={m.id}>
                                      {m.avatar} {m.name}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  placeholder="Not veya güncelleme yazın..."
                                  value={cardNoteInput.text}
                                  onChange={(e) =>
                                    setNoteInputs((prev) => ({
                                      ...prev,
                                      [opp.id]: {
                                        ...cardNoteInput,
                                        text: e.target.value,
                                      },
                                    }))
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      handleAddNote(opp.id);
                                    }
                                  }}
                                  className="w-full text-[11px] bg-surface border border-border rounded-lg px-2.5 py-1.5 text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleAddNote(opp.id)}
                                  disabled={!cardNoteInput.text.trim()}
                                  className="bg-accent hover:opacity-90 disabled:opacity-40 text-white font-bold text-[10px] px-2.5 py-1.5 rounded-lg transition shrink-0 cursor-pointer"
                                >
                                  Ekle
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Card Bottom: Action Links */}
                          <div className="pt-2 border-t border-border flex items-center justify-between text-[11px]">
                            <Link
                              href={`/${locale}/${workspace}/pipeline/${opp.id}`}
                              className="text-accent hover:underline font-semibold flex items-center gap-1"
                            >
                              <span>İncele</span>
                              <span>→</span>
                            </Link>

                            <Link
                              href={`/${locale}/${workspace}/pipeline/${opp.id}/consortium`}
                              className="text-muted hover:text-ink font-medium flex items-center gap-1"
                              title="Konsorsiyum Masası"
                            >
                              <span>👥</span>
                              <span>Konsorsiyum</span>
                            </Link>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {stageOpps.length === 0 && (
                  <div
                    onClick={() => openCreateModalForStage(key)}
                    className="h-28 text-center text-xs text-muted flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl hover:border-accent hover:bg-surface/50 cursor-pointer transition"
                  >
                    <span className="text-base mb-1">+</span>
                    <span>Buraya sürükleyin veya ekleyin</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── NEW OPPORTUNITY MODAL ─── */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-surface rounded-2xl max-w-lg w-full p-6 md:p-8 shadow-2xl space-y-6 border border-border">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-border pb-4">
              <div>
                <div className="text-xs font-bold text-accent uppercase tracking-wider mb-1">
                  Stage-Gate Yönetimi
                </div>
                <h2 className="text-xl font-bold font-heading text-ink">
                  Yeni Fonlama Fırsatı / Teklif Ekle
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  Fırsatı boru hattına ekleyin, çalışma grubunuzdan bir kullanıcıya atayın ve G0 Triage sürecini başlatın.
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-muted hover:text-ink text-lg font-bold p-1 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-bold text-ink mb-1">
                  Proje / Teklif Başlığı <span className="text-bad">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Örn: AI-Optimized Battery Systems for Heavy Transport"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full text-xs bg-ground border border-border rounded-xl p-3 text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              {/* Assigned Responsible User */}
              <div>
                <label className="block text-xs font-bold text-ink mb-1">
                  Sorumlu Kullanıcı / Atanan Kişi <span className="text-accent">*</span>
                </label>
                <select
                  value={selectedOwnerId}
                  onChange={(e) => setFormData({ ...formData, ownerId: e.target.value })}
                  className="w-full text-xs bg-ground border border-border rounded-xl p-3 text-ink font-semibold focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  {members.length === 0 && <option value="">Yükleniyor…</option>}
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.avatar} {m.name} — ({m.role})
                    </option>
                  ))}
                </select>
              </div>

              {/* Topic ID */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-ink">
                    Hedef Çağrı / Topic Kodu
                  </label>
                  <span className="text-[10px] text-muted">Opsiyonel</span>
                </div>
                <input
                  type="text"
                  placeholder="Örn: HORIZON-CL5-2026-D3-01-01"
                  value={formData.topicId}
                  onChange={(e) => setFormData({ ...formData, topicId: e.target.value })}
                  className="w-full text-xs bg-ground border border-border rounded-xl p-3 font-mono text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                />

                {/* Quick Topic Chips — sourced live from `Topic` (open calls first); the
                    block renders nothing when there is nothing real to suggest. */}
                {suggestedTopics.length > 0 && (
                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-muted">Önerilenler:</span>
                    {suggestedTopics.map((t) => (
                      <button
                        key={t.identifier}
                        type="button"
                        onClick={() => setFormData({ ...formData, topicId: t.identifier })}
                        title={t.title}
                        className="text-[10px] bg-ground hover:bg-accent/15 hover:text-accent-ink text-ink-2 px-2 py-0.5 rounded border border-border transition"
                      >
                        {t.identifier}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Role & Stage selection grid */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink mb-1">
                    Hedeflenen Rol
                  </label>
                  <select
                    value={formData.intendedRole}
                    onChange={(e) => setFormData({ ...formData, intendedRole: e.target.value })}
                    className="w-full text-xs bg-ground border border-border rounded-xl p-3 text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option value="coordinator">👑 Koordinatör (Lead)</option>
                    <option value="partner">🤝 Konsorsiyum Ortağı</option>
                    <option value="tech_provider">🔬 Teknoloji Sağlayıcı</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink mb-1">
                    Başlangıç Kapısı
                  </label>
                  <select
                    value={formData.stage}
                    onChange={(e) => setFormData({ ...formData, stage: e.target.value as Gate })}
                    className="w-full text-xs bg-ground border border-border rounded-xl p-3 text-ink focus:outline-none focus:ring-2 focus:ring-accent font-mono"
                  >
                    <option value="G0">G0: Triage & Fizibilite</option>
                    <option value="G1">G1: Konsept & Mimari</option>
                    <option value="G2">G2: Konsorsiyum</option>
                    <option value="G3">G3: Tam Başvuru</option>
                    <option value="G4">G4: Nihai Teslim</option>
                  </select>
                </div>
              </div>

              {/* Initial Note */}
              <div>
                <label className="block text-xs font-bold text-ink mb-1">
                  İlk Not / Stratejiniz
                </label>
                <textarea
                  rows={2}
                  placeholder="Projenin temel amacı, hedef TRL aralığı veya ortak profili..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full text-xs bg-ground border border-border rounded-xl p-3 text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              {/* Modal Footer Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-semibold border border-border rounded-xl hover:bg-surface-hover text-ink-2 transition"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={isPending || !formData.title.trim()}
                  className="px-5 py-2.5 text-xs font-bold bg-accent hover:opacity-90 text-white rounded-xl shadow-2xs transition disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                >
                  {isPending ? (
                    <>
                      <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>Oluşturuluyor...</span>
                    </>
                  ) : (
                    <span>Fırsatı Oluştur & Ata</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
