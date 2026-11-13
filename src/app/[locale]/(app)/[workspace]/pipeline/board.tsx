'use client';

import React, { useState, useTransition, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
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
import { useActionErrorText } from '@/lib/hooks/use-action-error-text';
import { useGateReasonText } from '@/lib/hooks/use-gate-reason-text';

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

const GATES: { key: Gate; color: string }[] = [
  { key: 'G0', color: 'border-t-blue-500' },
  { key: 'G1', color: 'border-t-teal-500' },
  { key: 'G2', color: 'border-t-purple-500' },
  { key: 'G3', color: 'border-t-amber-500' },
  { key: 'G4', color: 'border-t-emerald-500' },
];

/**
 * One card's note draft. `authorId` is REQUIRED, deliberately: the author
 * `<select>` below is controlled on this field, and React downgrades a
 * controlled select to an uncontrolled one the moment its `value` is
 * `undefined`. Making the field optional would legalise that; keeping it total
 * pushes the burden onto whoever writes the record — which is where it belongs.
 */
export type NoteInput = { text: string; authorId: string };

/**
 * Colour of the card's G0 score badge, decided by the latest G0 gate decision (NG-69).
 *
 * Green only when that decision passed. A refused opportunity keeps its number on the card, but
 * a green badge next to "GEÇME" on the detail page told the user the opposite of the gate. No
 * decision on file is not a pass either, so it gets the neutral tone.
 */
export function g0BadgeTone(g0Passed: boolean | null | undefined): 'ok' | 'amber' {
  return g0Passed === true ? 'ok' : 'amber';
}

/**
 * Clear a card's note text after the note has been posted, without dropping who
 * was writing it.
 *
 * This used to be `{ ...prev[oppId], text: '' }` inline. `prev[oppId]` is
 * `NoteInput | undefined`, and spreading the undefined case produced
 * `{ text: '' }` with no `authorId`. That object is truthy, so the
 * `noteInputs[opp.id] || { text: '', authorId: ... }` repair further down never
 * fired; the missing field reached the controlled select as `value={undefined}`
 * and made the card's next note fall back to `members[0]` — silently posting it
 * under the wrong name.
 */
export function clearNoteText(
  prev: Record<string, NoteInput>,
  oppId: string,
  fallbackAuthorId: string
): Record<string, NoteInput> {
  return {
    ...prev,
    [oppId]: { text: '', authorId: prev[oppId]?.authorId ?? fallbackAuthorId },
  };
}

export default function KanbanBoard({
  opportunities: initialOpps,
  workspace = 'default',
  locale = 'tr',
}: KanbanBoardProps) {
  const t = useTranslations('pipeline');
  const tBoard = useTranslations('pipelineBoard');
  const [opps, setOpps] = useState<OpportunityItem[]>(initialOpps);
  const [isPending, startTransition] = useTransition();
  const errorText = useActionErrorText();
  const reasonText = useGateReasonText();

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

  // Full-Window Modal State
  const [selectedOppId, setSelectedOppId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const closeModal = () => setSelectedOppId(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedOppId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (selectedOppId) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [selectedOppId]);

  const getMilestonesForStage = (gate: Gate): string[] => {
    switch (gate) {
      case 'G0':
        return [t('modal.milestoneG0_1'), t('modal.milestoneG0_2'), t('modal.milestoneG0_3')];
      case 'G1':
        return [t('modal.milestoneG1_1'), t('modal.milestoneG1_2'), t('modal.milestoneG1_3')];
      case 'G2':
        return [t('modal.milestoneG2_1'), t('modal.milestoneG2_2'), t('modal.milestoneG2_3')];
      case 'G3':
        return [t('modal.milestoneG3_1'), t('modal.milestoneG3_2'), t('modal.milestoneG3_3')];
      case 'G4':
        return [t('modal.milestoneG4_1'), t('modal.milestoneG4_2'), t('modal.milestoneG4_3')];
      default:
        return [];
    }
  };

  // New Opportunity Form
  const [formData, setFormData] = useState({
    title: '',
    topicId: '',
    intendedRole: 'coordinator',
    ownerId: '',
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

  // Why the gate kept a card where it was. A panel, not a toast: the reasons are what the user
  // has to act on, and a four-second toast would take them away.
  const [moveRefusal, setMoveRefusal] = useState<{ title: string; stage: Gate; reasons: string[] } | null>(null);

  // Drag & Drop
  const handleDragStart = (e: React.DragEvent, oppId: string) => {
    e.dataTransfer.setData('oppId', oppId);
  };

  // One move path for drag-and-drop and the modal's stage stepper, so both go through the gate.
  const moveStage = (oppId: string, newStage: Gate) => {
    const opp = opps.find((o) => o.id === oppId);
    if (!opp || opp.stage === newStage) return;

    setMoveRefusal(null);

    // Not optimistic: the card leaves its column only after the gate said so, so a refusal has
    // nothing to undo and nothing else on the board is touched.
    startTransition(async () => {
      try {
        const res = await moveOpportunityStage(oppId, newStage);
        if (!res.success) {
          showToast(t(`moveError.${res.error}`), 'error');
          return;
        }
        if (!res.passed) {
          // The refusal panel sits on the board, behind the full-window modal: close the modal.
          setSelectedOppId(null);
          setMoveRefusal({
            title: opp.title,
            stage: newStage,
            reasons:
              res.refusal === 'STAGE_SKIP'
                ? [t('moveSkipped', { from: opp.stage, to: newStage, next: res.nextStage ?? '' })]
                : (res.reasonDetails?.map(reasonText) ?? res.reasons),
          });
          return;
        }
        setOpps((prev) => prev.map((o) => (o.id === oppId ? { ...o, stage: newStage } : o)));
        showToast(t('moved', { stage: newStage }), 'success');
      } catch (err) {
        console.error(err);
        showToast(errorText(err, t('moveError.STAGE_MOVE_FAILED')), 'error');
      }
    });
  };

  const handleDrop = (e: React.DragEvent, newStage: Gate) => {
    e.preventDefault();
    const oppId = e.dataTransfer.getData('oppId');
    if (!oppId) return;
    moveStage(oppId, newStage);
  };

  const allowDrop = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // Quick Change Owner / Assign Responsible User
  const handleAssignOwner = (oppId: string, memberId: string) => {
    const member = members.find((m) => m.id === memberId);
    const ownerName = member ? member.name : tBoard('unassigned');

    setOpps((prev) =>
      prev.map((o) => (o.id === oppId ? { ...o, ownerId: memberId, ownerName } : o))
    );

    startTransition(async () => {
      try {
        await assignOpportunityOwner({ opportunityId: oppId, ownerId: memberId, ownerName });
        showToast(t('board.assignedToast', { owner: ownerName }), 'success');
      } catch (err) {
        console.error(err);
        showToast(errorText(err, t('board.assignFailed')), 'error');
      }
    });
  };

  // Add Note to Card
  const handleAddNote = (oppId: string) => {
    const cardInput = noteInputs[oppId];
    if (!cardInput || !cardInput.text.trim()) return;

    const author = members.find((m) => m.id === cardInput.authorId) || members[0];
    if (!author) {
      showToast(t('board.membersNotLoaded'), 'error');
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
          setNoteInputs((prev) => clearNoteText(prev, oppId, author.id));

          showToast(t('board.noteAdded', { author: author.name }), 'success');
        }
      } catch (err) {
        console.error(err);
        showToast(errorText(err, t('board.noteFailed')), 'error');
      }
    });
  };

  // Form Submit: Create Opportunity
  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

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
            notes: '',
          });
          showToast(t('board.createdToast', { title: res.opportunity.title, owner: member?.name || '' }), 'success');
        } else if (!res.success) {
          // e.g. WORKSPACE_NOT_FOUND (TASK-MUO12A7NHANOT): a refusal is a value, not a throw.
          showToast(t('createRefused'), 'error');
        }
      } catch (err) {
        showToast(errorText(err, () => errorMessage(err, t('board.createFailed'))), 'error');
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

  const openCreateModal = () => setIsModalOpen(true);

  return (
    <div className="space-y-6" data-testid="pipeline-board">
      {moveRefusal && (
        <div
          role="alert"
          data-testid="pipeline-move-refused"
          className="rounded-xl border border-bad/30 bg-bad/15 px-4 py-3 text-sm text-bad flex items-start justify-between gap-4"
        >
          <div className="space-y-1 min-w-0">
            <p className="font-semibold">
              {t('moveRefused', { title: moveRefusal.title, stage: moveRefusal.stage })}
            </p>
            <ul className="list-disc list-inside text-xs break-words">
              {moveRefusal.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
          <button
            type="button"
            onClick={() => setMoveRefusal(null)}
            data-testid="pipeline-move-refused-dismiss"
            className="shrink-0 font-semibold underline cursor-pointer"
          >
            {t('moveRefusedDismiss')}
          </button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 animate-in slide-in-from-top-2">
          <div
            className={`px-4 py-3 rounded-xl shadow-lg border text-sm font-semibold flex items-center gap-2 ${
              toast.type === 'success'
                ? 'bg-ok/15 text-ok-ink border-ok/30'
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
              {t('breadcrumb.dashboard')}
            </Link>
            <span>/</span>
            <span className="text-accent-ink font-semibold">{t('breadcrumb.current')}</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold font-heading text-ink">{t('heading')}</h1>
          <p className="text-xs md:text-sm text-muted mt-0.5">{t('subtitle')}</p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end flex-wrap">
          {/* Expand / Collapse All Toggle */}
          <button
            onClick={toggleAllExpand}
            className="text-xs bg-ground border border-border hover:bg-surface text-ink-2 font-medium px-3 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
            title={t('board.toggleAllTitle')}
          >
            <span>{allExpanded ? t('board.collapseAll') : t('board.expandAll')}</span>
          </button>

          {/* Search Input */}
          <div className="relative w-44 sm:w-56">
            <input
              type="text"
              placeholder={t('board.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs bg-ground border border-border rounded-xl px-3 py-2.5 pl-8 text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <span className="absolute left-2.5 top-2.5 text-muted text-xs">🔍</span>
          </div>

          {/* User Filter. A fixed width: members load after mount, and a select sized by its
              longest option would wrap this toolbar then and push the board down under the
              pointer, losing a click on a card (FO-336). */}
          <select
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            aria-label={t('board.ownerFilterLabel')}
            className="w-40 truncate text-xs bg-ground border border-border rounded-xl px-3 py-2.5 font-medium text-ink focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="all">{t('board.allUsers')}</option>
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
            aria-label={t('board.roleFilterLabel')}
            className="text-xs bg-ground border border-border rounded-xl px-3 py-2.5 font-medium text-ink focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="all">{t('board.allRoles')}</option>
            <option value="coordinator">{t('board.roleCoordinator')}</option>
            <option value="partner">{t('board.rolePartner')}</option>
          </select>

          {/* + New Opportunity Main Trigger Button */}
          <button
            onClick={openCreateModal}
            className="bg-accent hover:opacity-90 text-white font-semibold text-xs md:text-sm px-4 py-2.5 rounded-xl shadow-2xs transition-all flex items-center gap-2 shrink-0 cursor-pointer"
          >
            <span className="text-base leading-none font-bold">+</span>
            <span>{t('board.addOpportunity')}</span>
          </button>
        </div>
      </div>

      {/* Kanban Board Column Container */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 overflow-x-auto pb-6 min-h-[calc(100vh-280px)]">
        {GATES.map(({ key, color }) => {
          const stageOpps = filteredOpps.filter((o) => o.stage === key);

          return (
            <div
              key={key}
              data-testid={`pipeline-column-${key}`}
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
                  <div className="text-[11px] text-muted font-medium mt-0.5">{t(`board.gateSubtitle.${key}`)}</div>
                </div>

                {/* A new opportunity starts at G0; the later columns are reached through the gates. */}
                {key === 'G0' && (
                  <button
                    onClick={openCreateModal}
                    title={t('addToG0')}
                    aria-label={t('addToG0')}
                    data-testid="pipeline-add-G0"
                    className="w-6 h-6 rounded-lg bg-ground hover:bg-accent/15 text-muted hover:text-accent-ink border border-border flex items-center justify-center font-bold text-sm transition"
                  >
                    +
                  </button>
                )}
              </div>

              {/* Column Cards Drop Area */}
              <div className="p-3 flex-1 overflow-y-auto space-y-3 min-h-[160px]">
                {stageOpps.map((opp) => {
                  const isCoord = (opp.intendedRole || 'coordinator').toLowerCase() === 'coordinator';
                  const currentMember = members.find((m) => m.id === opp.ownerId) || {
                    name: opp.ownerName || t('board.unassigned'),
                    avatar: '👤',
                  };
                  const isExpanded = !!expandedCardIds[opp.id];
                  const isSelected = selectedOppId === opp.id;

                  const notesList: NoteEntry[] = opp.notesList || [];
                  const cardNoteInput = noteInputs[opp.id] || { text: '', authorId: members[0]?.id ?? '' };

                  return (
                    <div
                      key={opp.id}
                      data-testid={`pipeline-card-${opp.id}`}
                      draggable
                      onDragStart={(e) => {
                        setIsDragging(true);
                        handleDragStart(e, opp.id);
                      }}
                      onDragEnd={() => {
                        setTimeout(() => setIsDragging(false), 50);
                      }}
                      onClick={() => {
                        if (!isDragging) {
                          setSelectedOppId(opp.id);
                        }
                      }}
                      className={`bg-surface rounded-xl shadow-2xs border border-border cursor-pointer hover:border-accent hover:shadow-md transition-all ${
                        isPending ? 'opacity-60' : ''
                      } ${isExpanded ? 'p-4 space-y-3' : 'p-3 space-y-2'}`}
                    >
                      {/* Top Bar / Header of Card (Always Visible) */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0 ${
                              isCoord
                                ? 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/20'
                                : 'bg-accent/15 text-accent-ink border border-accent/20'
                            }`}
                          >
                            <span>{isCoord ? '👑' : '🤝'}</span>
                            <span>{isCoord ? t('board.coordinatorBadge') : t('board.partnerBadge')}</span>
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
                              data-g0-tone={g0BadgeTone(opp.g0Passed)}
                              className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full ${
                                g0BadgeTone(opp.g0Passed) === 'ok'
                                  ? 'bg-ok/15 text-ok-ink border border-ok/30'
                                  : 'bg-amber/15 text-amber border border-amber/30'
                              }`}
                              title={
                                opp.g0Passed === false
                                  ? t('board.g0RefusedTitle')
                                  : opp.g0Passed === true
                                    ? t('board.g0ScoreTitle')
                                    : t('board.g0NoDecisionTitle')
                              }
                            >
                              ⭐ {opp.g0Score}
                            </span>
                          )}

                          {/* Open Full Window Modal Button */}
                          <button
                            type="button"
                            data-testid={`pipeline-card-expand-modal-${opp.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedOppId(opp.id);
                            }}
                            className="text-[10px] bg-ground hover:bg-accent/15 text-muted hover:text-accent-ink border border-border px-1.5 py-0.5 rounded font-bold transition cursor-pointer"
                            title={t('modal.openModal')}
                          >
                            ⛶
                          </button>

                          {/* Toggle Expand Arrow Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpand(opp.id);
                            }}
                            className="text-[10px] bg-ground hover:bg-accent/15 text-muted hover:text-accent-ink border border-border px-1.5 py-0.5 rounded font-bold transition cursor-pointer"
                            title={isExpanded ? t('board.collapseCard') : t('board.expandCard')}
                          >
                            {isExpanded ? '▲' : '▼'}
                          </button>
                        </div>
                      </div>

                      {/* Title (Clicking title opens full-window modal) */}
                      <h4
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedOppId(opp.id);
                        }}
                        className={`font-bold text-xs text-ink leading-snug cursor-pointer hover:text-accent transition-colors ${
                          isExpanded ? 'line-clamp-none' : 'line-clamp-1'
                        }`}
                        title={opp.title}
                      >
                        {opp.title}
                      </h4>

                      {/* ─── EXPANDED DETAILS CONTENT (INLINE) ─── */}
                      {isExpanded && !isSelected && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="space-y-3 pt-2 border-t border-border/60 animate-in fade-in duration-150"
                        >
                          {/* Topic Identifier */}
                          {opp.topicId && (
                            <div className="text-[10px] bg-ground border border-border text-muted px-2 py-1 rounded font-mono truncate max-w-full">
                              {opp.topicId}
                            </div>
                          )}

                          {/* Full Assigned User Dropdown Pill */}
                          <div className="flex items-center justify-between bg-ground/80 border border-border rounded-lg px-2.5 py-1 text-[11px] min-w-0 overflow-hidden">
                            <span className="text-muted text-[10px] font-semibold shrink-0">{t('board.assignee')}</span>
                            <div className="flex items-center gap-1 min-w-0 overflow-hidden max-w-[170px]">
                              <span className="text-xs shrink-0">{currentMember.avatar}</span>
                              <select
                                value={opp.ownerId || ''}
                                onChange={(e) => handleAssignOwner(opp.id, e.target.value)}
                                className="bg-transparent font-bold text-ink text-[11px] focus:outline-none cursor-pointer hover:text-blue-600 truncate max-w-full"
                                title={t('board.changeOwnerTitle')}
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
                              <span>{t('board.notesHeading')}</span>
                              <span className="text-[10px] text-muted font-normal">
                                {t('board.noteCount', { count: notesList.length })}
                              </span>
                            </div>

                            {notesList.length > 0 ? (
                              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                                {notesList.map((note) => (
                                  <div
                                    key={note.id}
                                    data-testid={`pipeline-note-item-${opp.id}`}
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
                                {t('board.noNotes')}
                              </p>
                            )}

                            {/* Add New Note Inline Input */}
                            <div className="bg-ground border border-border rounded-xl p-2 space-y-2">
                              <div className="flex items-center justify-between gap-1 text-[10px]">
                                <span className="text-muted font-semibold">{t('board.noteAuthor')}</span>
                                <select
                                  data-testid={`pipeline-note-author-${opp.id}`}
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
                                  data-testid={`pipeline-note-text-${opp.id}`}
                                  type="text"
                                  placeholder={t('board.notePlaceholder')}
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
                                  data-testid={`pipeline-note-add-${opp.id}`}
                                  type="button"
                                  onClick={() => handleAddNote(opp.id)}
                                  disabled={!cardNoteInput.text.trim()}
                                  className="bg-accent hover:opacity-90 disabled:opacity-40 text-white font-bold text-[10px] px-2.5 py-1.5 rounded-lg transition shrink-0 cursor-pointer"
                                >
                                  {t('board.addNote')}
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
                              <span>{t('board.review')}</span>
                              <span>→</span>
                            </Link>

                            <Link
                              href={`/${locale}/${workspace}/pipeline/${opp.id}/consortium`}
                              className="text-muted hover:text-ink font-medium flex items-center gap-1"
                              title={t('board.consortiumTitle')}
                            >
                              <span>👥</span>
                              <span>{t('board.consortium')}</span>
                            </Link>
                          </div>
                        </div>
                      )}

                      {/* ─── FULL-WINDOW STAGE-GATE TASK MODAL ─── */}
                      {isSelected && (
                        <div
                          role="dialog"
                          aria-modal="true"
                          aria-labelledby={`pipeline-modal-title-${opp.id}`}
                          data-testid={`pipeline-modal-${opp.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            closeModal();
                          }}
                          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 lg:p-8 animate-in fade-in duration-200 cursor-default text-ink"
                        >
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="bg-surface border border-border/80 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
                          >
                            {/* Modal Header */}
                            <div className="p-5 border-b border-border bg-ground/40 flex items-start justify-between gap-4">
                              <div className="space-y-1.5 flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-[11px] font-bold uppercase tracking-wider text-accent bg-accent/10 px-2 py-0.5 rounded-md border border-accent/20">
                                    {t('modal.tag')}
                                  </span>
                                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-ground border border-border text-ink-2">
                                    {opp.stage} • {t(`board.gateSubtitle.${opp.stage}`)}
                                  </span>
                                  <span
                                    className={`text-[11px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 ${
                                      isCoord
                                        ? 'bg-purple-500/15 text-purple-400 border border-purple-500/20'
                                        : 'bg-accent/15 text-accent-ink border border-accent/20'
                                    }`}
                                  >
                                    <span>{isCoord ? '👑' : '🤝'}</span>
                                    <span>{isCoord ? t('modal.coordinator') : t('modal.partner')}</span>
                                  </span>
                                  {opp.g0Score !== null && opp.g0Score !== undefined ? (
                                    <span
                                      className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-md ${
                                        opp.g0Score >= 80
                                          ? 'bg-ok/15 text-ok border border-ok/30'
                                          : 'bg-amber/15 text-amber border border-amber/30'
                                      }`}
                                      title={t('modal.g0Score')}
                                    >
                                      ⭐ {opp.g0Score} / 100
                                    </span>
                                  ) : (
                                    <span className="text-[11px] text-muted font-medium bg-ground border border-border px-2 py-0.5 rounded-md">
                                      {t('modal.g0Unscored')}
                                    </span>
                                  )}
                                </div>
                                <h2
                                  id={`pipeline-modal-title-${opp.id}`}
                                  className="text-xl sm:text-2xl font-bold font-heading text-ink leading-snug"
                                >
                                  {opp.title}
                                </h2>
                                <div className="flex items-center gap-2 text-xs text-muted">
                                  <span className="font-semibold">{t('modal.topic')}:</span>
                                  {opp.topicId ? (
                                    <span className="font-mono bg-ground border border-border px-2 py-0.5 rounded text-ink text-[11px]">
                                      {opp.topicId}
                                    </span>
                                  ) : (
                                    <span className="italic">{t('modal.noTopic')}</span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  data-testid={`pipeline-modal-close-${opp.id}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    closeModal();
                                  }}
                                  className="w-9 h-9 rounded-xl bg-ground hover:bg-surface border border-border text-muted hover:text-ink flex items-center justify-center text-base font-bold transition cursor-pointer"
                                  title={t('modal.close')}
                                >
                                  ✕
                                </button>
                              </div>
                            </div>

                            {/* Stage-Gate Visual Progress Stepper */}
                            <div className="px-5 py-3 border-b border-border/70 bg-surface">
                              <div className="flex items-center justify-between text-xs text-muted font-medium mb-2">
                                <span>{t('modal.stageSelector')}</span>
                                <span className="font-semibold text-accent-ink">{opp.stage}</span>
                              </div>
                              <div className="grid grid-cols-5 gap-2">
                                {GATES.map((g, idx) => {
                                  const isCurrent = opp.stage === g.key;
                                  const gateIdx = GATES.findIndex((item) => item.key === opp.stage);
                                  const isPast = idx < gateIdx;
                                  return (
                                    <button
                                      key={g.key}
                                      type="button"
                                      onClick={() => moveStage(opp.id, g.key)}
                                      className={`px-3 py-2 rounded-xl text-left border transition-all cursor-pointer flex flex-col justify-between ${
                                        isCurrent
                                          ? 'bg-accent/15 border-accent text-accent-ink ring-2 ring-accent/30 font-bold shadow-xs'
                                          : isPast
                                          ? 'bg-surface border-border text-ink hover:border-accent/50'
                                          : 'bg-ground/40 border-border/60 text-muted hover:text-ink hover:border-border'
                                      }`}
                                      title={`${g.key}: ${t(`board.gateSubtitle.${g.key}`)}`}
                                    >
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="font-bold">{g.key}</span>
                                        <span>{isPast ? '✓' : isCurrent ? '●' : '○'}</span>
                                      </div>
                                      <div className="text-[10px] truncate mt-1 opacity-80">{t(`board.gateSubtitle.${g.key}`)}</div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Modal Two-Column Content Body */}
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-5 sm:p-6 overflow-y-auto flex-1">
                              {/* Left Column: Tasks & Notes */}
                              <div className="lg:col-span-7 space-y-5">
                                {/* Gate Milestones */}
                                <div className="bg-ground/40 border border-border rounded-xl p-4 space-y-3">
                                  <div className="flex items-center justify-between text-xs font-bold text-ink">
                                    <span>{t('modal.tasksTitle')}</span>
                                    <span className="text-[10px] font-mono text-muted bg-surface border border-border px-1.5 py-0.5 rounded">
                                      {opp.stage}
                                    </span>
                                  </div>
                                  <div className="space-y-2">
                                    {getMilestonesForStage(opp.stage).map((item, mIdx) => (
                                      <div
                                        key={mIdx}
                                        className="flex items-start gap-2.5 bg-surface border border-border/70 rounded-lg p-2.5 text-xs"
                                      >
                                        <span className="text-ok font-bold text-sm leading-none mt-0.5">☑</span>
                                        <div className="flex-1 min-w-0">
                                          <span className="font-medium text-ink leading-tight">{item}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                {/* Team Notes Stream */}
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between text-xs font-bold text-ink">
                                    <span>💬 {t('modal.notesTitle')}</span>
                                    <span className="text-xs text-muted font-medium">
                                      {t('modal.notesCount', { count: notesList.length })}
                                    </span>
                                  </div>

                                  {notesList.length > 0 ? (
                                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                                      {notesList.map((note) => (
                                        <div
                                          key={note.id}
                                          data-testid={`pipeline-note-item-${opp.id}`}
                                          className="bg-ground/70 border border-border rounded-xl p-3 text-xs space-y-1.5"
                                        >
                                          <div className="flex items-center justify-between text-[11px] text-muted">
                                            <span className="font-bold text-ink flex items-center gap-1.5">
                                              <span className="text-sm">{note.authorAvatar || '👤'}</span>
                                              <span>{note.authorName}</span>
                                            </span>
                                            <span className="font-mono text-[10px]">{note.createdAt}</span>
                                          </div>
                                          <p className="text-ink-2 leading-relaxed">{note.text}</p>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-xs text-muted italic bg-ground/30 border border-border/50 rounded-xl p-3">
                                      {t('modal.noNotes')}
                                    </p>
                                  )}

                                  {/* Add Note Composer in Modal */}
                                  <div className="bg-ground border border-border rounded-xl p-3 space-y-2.5">
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="text-muted font-semibold">{t('modal.noteAuthor')}:</span>
                                      <select
                                        data-testid={`pipeline-note-author-${opp.id}`}
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
                                        className="bg-surface border border-border rounded-lg px-2 py-1 text-xs text-ink font-bold focus:outline-none"
                                      >
                                        {members.map((m) => (
                                          <option key={m.id} value={m.id}>
                                            {m.avatar} {m.name}
                                          </option>
                                        ))}
                                      </select>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <input
                                        data-testid={`pipeline-note-text-${opp.id}`}
                                        type="text"
                                        placeholder={t('modal.notePlaceholder')}
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
                                        className="w-full text-xs bg-surface border border-border rounded-xl px-3 py-2 text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                                      />
                                      <button
                                        data-testid={`pipeline-note-add-${opp.id}`}
                                        type="button"
                                        onClick={() => handleAddNote(opp.id)}
                                        disabled={!cardNoteInput.text.trim()}
                                        className="bg-accent hover:opacity-90 disabled:opacity-40 text-white font-bold text-xs px-4 py-2 rounded-xl transition shrink-0 cursor-pointer"
                                      >
                                        {t('modal.addNote')}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Right Column: Member Assignment & Module Links */}
                              <div className="lg:col-span-5 space-y-5">
                                {/* Responsible User Card */}
                                <div className="bg-ground/50 border border-border rounded-xl p-4 space-y-3">
                                  <div className="text-xs font-bold text-ink">{t('modal.assignedTo')}</div>
                                  <div className="flex items-center gap-2.5 bg-surface border border-border rounded-xl p-3">
                                    <span className="text-2xl">{currentMember.avatar}</span>
                                    <div className="flex-1 min-w-0">
                                      <select
                                        value={opp.ownerId || ''}
                                        onChange={(e) => handleAssignOwner(opp.id, e.target.value)}
                                        className="w-full bg-transparent font-bold text-ink text-xs focus:outline-none cursor-pointer hover:text-accent truncate"
                                        title={t('board.changeOwnerTitle')}
                                      >
                                        {members.map((m) => (
                                          <option key={m.id} value={m.id}>
                                            {m.name}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                </div>

                                {/* Quick Info Box */}
                                <div className="bg-ground/50 border border-border rounded-xl p-4 space-y-2.5 text-xs">
                                  <div className="flex items-center justify-between py-1 border-b border-border/50">
                                    <span className="text-muted">{t('modal.role')}:</span>
                                    <span className="font-bold text-ink">
                                      {isCoord ? t('modal.coordinator') : t('modal.partner')}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between py-1 border-b border-border/50">
                                    <span className="text-muted">{t('modal.stage')}:</span>
                                    <span className="font-mono font-bold text-accent-ink">{opp.stage}</span>
                                  </div>
                                  <div className="flex items-center justify-between py-1">
                                    <span className="text-muted">{t('modal.g0Score')}:</span>
                                    <span className="font-mono font-bold text-ink">
                                      {opp.g0Score !== null && opp.g0Score !== undefined
                                        ? `${opp.g0Score} / 100`
                                        : t('modal.g0Unscored')}
                                    </span>
                                  </div>
                                </div>

                                {/* Related Modules */}
                                <div className="bg-ground/50 border border-border rounded-xl p-4 space-y-2.5">
                                  <div className="text-xs font-bold text-ink">{t('modal.modulesTitle')}</div>
                                  <div className="grid grid-cols-1 gap-1.5">
                                    <Link
                                      href={`/${locale}/${workspace}/pipeline/${opp.id}/concept-note`}
                                      className="text-xs bg-surface border border-border hover:border-accent hover:text-accent-ink rounded-lg p-2.5 flex items-center justify-between transition font-medium"
                                    >
                                      <span className="flex items-center gap-2">
                                        <span>📝</span>
                                        <span>{t('modal.conceptNote')}</span>
                                      </span>
                                      <span>→</span>
                                    </Link>
                                    <Link
                                      href={`/${locale}/${workspace}/pipeline/${opp.id}/consortium`}
                                      className="text-xs bg-surface border border-border hover:border-accent hover:text-accent-ink rounded-lg p-2.5 flex items-center justify-between transition font-medium"
                                    >
                                      <span className="flex items-center gap-2">
                                        <span>👥</span>
                                        <span>{t('modal.consortium')}</span>
                                      </span>
                                      <span>→</span>
                                    </Link>
                                    <Link
                                      href={`/${locale}/${workspace}/pipeline/${opp.id}/evaluations`}
                                      className="text-xs bg-surface border border-border hover:border-accent hover:text-accent-ink rounded-lg p-2.5 flex items-center justify-between transition font-medium"
                                    >
                                      <span className="flex items-center gap-2">
                                        <span>⚖️</span>
                                        <span>{t('modal.evaluations')}</span>
                                      </span>
                                      <span>→</span>
                                    </Link>
                                    <Link
                                      href={`/${locale}/${workspace}/pipeline/${opp.id}/documents`}
                                      className="text-xs bg-surface border border-border hover:border-accent hover:text-accent-ink rounded-lg p-2.5 flex items-center justify-between transition font-medium"
                                    >
                                      <span className="flex items-center gap-2">
                                        <span>📁</span>
                                        <span>{t('modal.documents')}</span>
                                      </span>
                                      <span>→</span>
                                    </Link>
                                    <Link
                                      href={`/${locale}/${workspace}/pipeline/${opp.id}/application`}
                                      className="text-xs bg-surface border border-border hover:border-accent hover:text-accent-ink rounded-lg p-2.5 flex items-center justify-between transition font-medium"
                                    >
                                      <span className="flex items-center gap-2">
                                        <span>📑</span>
                                        <span>{t('modal.application')}</span>
                                      </span>
                                      <span>→</span>
                                    </Link>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Modal Footer */}
                            <div className="p-4 border-t border-border bg-ground/50 flex items-center justify-between gap-3 flex-wrap">
                              <div className="flex items-center gap-3 text-[11px] text-muted">
                                <span className="bg-surface border border-border px-2 py-0.5 rounded font-mono">
                                  {t('modal.escHint')}
                                </span>
                                <span className="bg-surface border border-border px-2 py-0.5 rounded font-mono">
                                  {t('modal.enterHint')}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={closeModal}
                                  className="text-xs px-4 py-2 border border-border rounded-xl hover:bg-surface text-ink-2 font-semibold transition cursor-pointer"
                                >
                                  {t('modal.close')}
                                </button>
                                <Link
                                  href={`/${locale}/${workspace}/pipeline/${opp.id}`}
                                  role="link"
                                  className="text-xs bg-accent hover:opacity-90 text-white font-bold px-4 py-2 rounded-xl transition flex items-center gap-1.5 shadow-2xs"
                                >
                                  <span>{t('modal.openFullPage')}</span>
                                  <span>→</span>
                                </Link>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {stageOpps.length === 0 &&
                  (key === 'G0' ? (
                    <div
                      onClick={openCreateModal}
                      data-testid="pipeline-empty-G0"
                      className="h-28 text-center text-xs text-muted flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl hover:border-accent hover:bg-surface/50 cursor-pointer transition"
                    >
                      <span className="text-base mb-1">+</span>
                      <span>{t('emptyG0')}</span>
                    </div>
                  ) : (
                    <div
                      data-testid={`pipeline-empty-${key}`}
                      className="h-28 px-3 text-center text-xs text-muted flex items-center justify-center border-2 border-dashed border-border rounded-xl"
                    >
                      <span>{t('emptyLater')}</span>
                    </div>
                  ))}
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
                  {t('board.modalEyebrow')}
                </div>
                <h2 className="text-xl font-bold font-heading text-ink">
                  {t('board.modalTitle')}
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  {t('board.modalDescription')}
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
            <form onSubmit={handleCreateSubmit} data-testid="pipeline-create-form" className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-bold text-ink mb-1">
                  {t('board.titleLabel')} <span className="text-bad">*</span>
                </label>
                <input
                  type="text"
                  required
                  data-testid="pipeline-create-title"
                  placeholder={t('board.titlePlaceholder')}
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full text-xs bg-ground border border-border rounded-xl p-3 text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              {/* Assigned Responsible User */}
              <div>
                <label className="block text-xs font-bold text-ink mb-1">
                  {t('board.ownerLabel')} <span className="text-accent">*</span>
                </label>
                <select
                  value={selectedOwnerId}
                  onChange={(e) => setFormData({ ...formData, ownerId: e.target.value })}
                  className="w-full text-xs bg-ground border border-border rounded-xl p-3 text-ink font-semibold focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  {members.length === 0 && <option value="">{t('board.membersLoading')}</option>}
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
                    {t('board.topicLabel')}
                  </label>
                  <span className="text-[10px] text-muted">{t('board.optional')}</span>
                </div>
                <input
                  type="text"
                  placeholder={t('board.topicPlaceholder')}
                  value={formData.topicId}
                  onChange={(e) => setFormData({ ...formData, topicId: e.target.value })}
                  className="w-full text-xs bg-ground border border-border rounded-xl p-3 font-mono text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                />

                {/* Quick Topic Chips — sourced live from `Topic` (open calls first); the
                    block renders nothing when there is nothing real to suggest. */}
                {suggestedTopics.length > 0 && (
                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-muted">{t('board.suggested')}</span>
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

              {/* Role */}
              <div>
                <label className="block text-xs font-bold text-ink mb-1">
                  {t('board.roleLabel')}
                </label>
                <select
                  value={formData.intendedRole}
                  onChange={(e) => setFormData({ ...formData, intendedRole: e.target.value })}
                  className="w-full text-xs bg-ground border border-border rounded-xl p-3 text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="coordinator">{t('board.roleLead')}</option>
                  <option value="partner">{t('board.roleConsortiumPartner')}</option>
                  <option value="tech_provider">{t('board.roleTechProvider')}</option>
                </select>
              </div>

              {/* Initial Note */}
              <div>
                <label className="block text-xs font-bold text-ink mb-1">
                  {t('board.initialNoteLabel')}
                </label>
                <textarea
                  rows={2}
                  placeholder={t('board.initialNotePlaceholder')}
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
                  {t('board.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isPending || !formData.title.trim()}
                  className="px-5 py-2.5 text-xs font-bold bg-accent hover:opacity-90 text-white rounded-xl shadow-2xs transition disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                >
                  {isPending ? (
                    <>
                      <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>{t('board.creating')}</span>
                    </>
                  ) : (
                    <span>{t('board.create')}</span>
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
