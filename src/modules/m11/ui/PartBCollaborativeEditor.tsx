'use client';

import React, { useCallback, useState, useEffect } from 'react';
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
import { isPilotExpired } from '@/lib/pilot-expired';
import { isForbiddenRole } from '@/lib/forbidden-role';
import { useNow } from '@/lib/hooks/use-now';
import { useActionErrorText } from '@/lib/hooks/use-action-error-text';
import { useOptionalSession } from '@/lib/hooks/use-optional-session';
import { displayUserName } from '@/lib/user-display';
import { useLocale, useTranslations } from 'next-intl';

/**
 * The signed-in user, from the session record.
 *
 * Nothing under `src/app` renders a `<SessionProvider>`, so `useOptionalSession()` alone is
 * always `null` inside the workspace tree and every author would be labelled "unnamed user".
 * NextAuth's own `/api/auth/session` route returns exactly the record a provider would have
 * put in context, so it is fetched directly when the context is empty. Either way the
 * identity comes from the session — never from a constant in this file.
 */
function useSessionUser(): SessionUser | null {
  const contextUser = useOptionalSession()?.user ?? null;
  const [fetchedUser, setFetchedUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    if (contextUser) return;
    let cancelled = false;
    fetch('/api/auth/session')
      .then((res) => (res.ok ? res.json() : null))
      .then((session: { user?: SessionUser } | null) => {
        if (!cancelled && session?.user) setFetchedUser(session.user);
      })
      .catch(() => {
        // A failed lookup leaves the identity unknown, which the UI states plainly.
      });
    return () => {
      cancelled = true;
    };
  }, [contextUser]);

  return contextUser ?? fetchedUser;
}

interface SessionUser {
  id?: string;
  name?: string | null;
  email?: string | null;
}

/** A section lock the server hands out is honoured for this long, then treated as abandoned. */
const LOCK_TTL_SECONDS = 60;
/** How often the lock badge re-checks the clock. Well under the TTL, cheap enough to leave on. */
const LOCK_TICK_MS = 5000;

/**
 * The short "who owns this section" line in the section list.
 *
 * A section has a lead author only once a real person has been recorded against it. The
 * template ships none, so an unowned section says so plainly instead of rendering
 * `Lider: undefined (undefined)` — which is what the invented template authors used to hide.
 * An author whose organisation is unknown is printed without a stand-in organisation.
 */
function shortLeadLabel(section: PartBSectionItem, unassigned: string): string {
  const author = section.leadAuthor?.trim();
  if (!author) return unassigned;
  const firstName = author.split(' ')[0] || author;
  const org = section.leadAuthorOrg?.trim().split(' ')[0];
  return org ? `${firstName} (${org})` : firstName;
}

interface PartBCollaborativeEditorProps {
  partId: string;
  opportunityTitle: string;
  /**
   * Passed by the application page, deliberately not read here: every server action in this
   * module resolves the tenant from the session (`requireTenantAction`), so a tenant id
   * arriving from the client would be an authority the browser must not hold. Kept on the
   * props so the call site stays explicit about which tenant's part is on screen.
   */
  tenantId: string;
  initialSections?: PartBSectionItem[];
  initialRevisions?: SectionRevisionItem[];
  initialComments?: SectionCommentItem[];
}

export function PartBCollaborativeEditor({
  partId,
  opportunityTitle,
  initialSections = DEFAULT_PART_B_SECTIONS,
  initialRevisions = [],
  initialComments = [],
}: PartBCollaborativeEditorProps) {
  // Who is actually editing, from the session — never a hard-coded person. Locks, revisions,
  // comments and presence are all attributed with these three values, so the old
  // `'usr-me' / 'Dr. Mehmet Yılmaz'` constants signed every tenant's saved revision history
  // with the same invented author. `displayUserName` is the shared honest-identity fallback
  // (real name -> e-mail local part -> translated "unnamed user"); there is no such fallback
  // for the organisation, so an unknown one is labelled as unknown.
  const sessionUser = useSessionUser();
  const locale = useLocale();
  const tIdentity = useTranslations('UserIdentity');
  const tEditor = useTranslations('PartBEditor');
  const currentUserId = sessionUser?.id || sessionUser?.email || '';
  const currentUserName = displayUserName(
    sessionUser?.name,
    sessionUser?.email,
    tIdentity('unnamedUser')
  );
  // The session carries no organisation. An empty string means "not known", and every place
  // that renders an author's organisation omits it rather than printing a stand-in.
  const currentUserOrg = '';

  const [sections, setSections] = useState<PartBSectionItem[]>(
    initialSections && initialSections.length > 0 ? initialSections : DEFAULT_PART_B_SECTIONS
  );
  const [activeSectionKey, setActiveSectionKey] = useState<string>('1.1_objectives');
  const activeSection = sections.find((s) => s.key === activeSectionKey) || sections[0]!;

  /**
   * The unsaved edit buffer, tagged with the section it belongs to. Tagging it is what lets the
   * editor text be *derived* during render: selecting another section makes the tag stale, so
   * that section's saved content shows through on its own. The effect that used to copy the
   * content across on every selection change — and the cascading render it caused — is gone.
   */
  const [editorDraft, setEditorDraft] = useState<{ sectionKey: string; text: string } | null>(null);
  const editorText =
    editorDraft?.sectionKey === activeSectionKey ? editorDraft.text : activeSection.content || '';
  const setEditorText = useCallback(
    (text: string) => setEditorDraft({ sectionKey: activeSectionKey, text }),
    [activeSectionKey]
  );

  const [viewMode, setViewMode] = useState<'EDIT' | 'PREVIEW'>('EDIT');
  const [isSaving, setIsSaving] = useState(false);
  // A refused write is said above the editor only when the pilot has ended; other failures
  // stay in the console, as before (TASK-MUMT3HQI1ILAR, İNCELEME-24 B-1). Without it an
  // expired pilot's save, lock and comment calls were rejected with nothing on screen.
  const [actionError, setActionError] = useState<string | null>(null);
  const errorText = useActionErrorText();

  /**
   * Derived, not stored. A save in flight is SAVING; a buffer that differs from the section's
   * saved content is UNSAVED; anything else is SAVED. A failed save leaves the section row
   * untouched, so the indicator falls back to UNSAVED without an error branch setting it.
   */
  const saveStatus: 'SAVED' | 'UNSAVED' | 'SAVING' = isSaving
    ? 'SAVING'
    : editorText !== (activeSection.content || '')
      ? 'UNSAVED'
      : 'SAVED';

  const [activeDrawer, setActiveDrawer] = useState<'COMMENTS' | 'HISTORY' | 'AI' | null>(null);

  // Stored rows only. A part with no review history used to be seeded with comments from
  // "Prof. Klaus Müller" and a revision by "Dr. Mehmet Yılmaz" — invented collaborators the
  // user cannot tell apart from their own consortium. An empty section now reads as empty.
  const [comments, setComments] = useState<SectionCommentItem[]>(initialComments);
  const [newCommentText, setNewCommentText] = useState('');

  const [revisions, setRevisions] = useState<SectionRevisionItem[]>(initialRevisions);

  // Starts with nobody: the bar used to open showing "Prof. Klaus Müller" and "Dr. Sofia
  // Rossi" as live co-authors of every part, in every tenant. `updatePresenceHeartbeat`
  // already returns the real, de-staled presence rows — the heartbeat below now keeps them.
  const [presenceList, setPresenceList] = useState<CollaboratorPresence[]>([]);

  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiPromptNotes, setAiPromptNotes] = useState('');

  useEffect(() => {
    // Nothing is announced until the session says who is here: a heartbeat under an empty id
    // would put an anonymous row in every part's presence list.
    if (!currentUserId) return;
    let cancelled = false;
    const beat = async () => {
      try {
        const live = await updatePresenceHeartbeat(
          partId,
          currentUserId,
          currentUserName,
          currentUserOrg,
          activeSectionKey
        );
        if (!cancelled && Array.isArray(live)) setPresenceList(live);
      } catch (e) {
        // An expired pilot, or a role without `edit_proposal`, refuses every
        // beat; asking again every 20 s only fills the server log
        // (TASK-MUN4H2RL79D8B, TASK-MUN80UOUPB2A4). Other failures retry.
        if (isPilotExpired(e) || isForbiddenRole(e)) clearInterval(interval);
      }
    };
    const interval = setInterval(() => void beat(), 20000);
    void beat();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [partId, activeSectionKey, currentUserId, currentUserName, currentUserOrg]);

  const calculateWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
  const currentSectionWords = calculateWords(editorText);
  const currentSectionEstimatedPages = (currentSectionWords / 450).toFixed(1);

  // Wrapped in useCallback because the autosave effect below depends on it: as a plain
  // function it was a new value on every render, so the effect tore down and re-armed its
  // 2.5s timer on every keystroke-driven render instead of once per edit.
  const handleSaveContent = useCallback(async (isManual: boolean = true) => {
    setIsSaving(true);
    setActionError(null);
    try {
      await updateSectionContent(
        partId,
        activeSectionKey,
        editorText,
        currentUserId,
        currentUserName,
        currentUserOrg,
        isManual ? tEditor('summaryManual') : tEditor('summaryAutoBackground')
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
        id: 'rev-' + Date.now(),
        sectionKey: activeSectionKey,
        authorName: currentUserName,
        authorOrg: currentUserOrg,
        timestamp: new Date().toISOString(),
        wordCount: currentSectionWords,
        summary: isManual ? tEditor('summaryManual') : tEditor('summaryAutoSync'),
        content: editorText,
      };
      setRevisions((prev) => [newRev, ...prev.slice(0, 20)]);
    } catch (err) {
      console.error('Error saving content:', err);
      setActionError(errorText(err, null));
    } finally {
      setIsSaving(false);
    }
  }, [partId, activeSectionKey, editorText, currentUserId, currentUserName, currentUserOrg, currentSectionWords, errorText, tEditor]);

  // Autosave only. The dirty indicator is derived above, so this effect no longer sets state
  // in its body — it just arms the 2.5s timer and disarms it on the next keystroke.
  useEffect(() => {
    if (editorText === (activeSection.content || '')) return;

    const timer = setTimeout(() => {
      void handleSaveContent(false);
    }, 2500);

    return () => clearTimeout(timer);
  }, [editorText, activeSection.content, handleSaveContent]);

  const totalWords = sections.reduce((acc, s) => {
    const content = s.key === activeSectionKey ? editorText : s.content;
    return acc + calculateWords(content || '');
  }, 0);
  const totalEstimatedPages = parseFloat((totalWords / 450).toFixed(1));
  const MAX_PAGE_LIMIT = 45;

  const isLockedByMe = activeSection.lockedBy === currentUserId;

  // A lock goes stale 60s after it was taken. Reading `Date.now()` during render made that an
  // impure render that also never re-ran, so an expired lock kept the section greyed out until
  // something unrelated re-rendered the tree. Ticking the clock makes the badge expire on time.
  const now = useNow(LOCK_TICK_MS);
  const isLockedByOther = Boolean(
    activeSection.lockedBy &&
      activeSection.lockedBy !== currentUserId &&
      activeSection.lockedAt &&
      now !== null &&
      (now - new Date(activeSection.lockedAt).getTime()) / 1000 < LOCK_TTL_SECONDS
  );

  const handleAcquireLock = async () => {
    setActionError(null);
    let res: Awaited<ReturnType<typeof acquireSectionLock>>;
    try {
      res = await acquireSectionLock(
        partId,
        activeSectionKey,
        currentUserId,
        currentUserName,
        currentUserOrg
      );
    } catch (err) {
      console.error('Error acquiring section lock:', err);
      setActionError(errorText(err, null));
      return;
    }
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
      alert(res.message || tEditor('lockTaken'));
    }
  };

  const handleReleaseLock = async () => {
    setActionError(null);
    try {
      await releaseSectionLock(partId, activeSectionKey, currentUserId);
    } catch (err) {
      console.error('Error releasing section lock:', err);
      setActionError(errorText(err, null));
      return;
    }
    setSections((prev) =>
      prev.map((s) =>
        s.key === activeSectionKey
          ? { ...s, lockedBy: null, lockedByName: null, lockedByOrg: null, lockedAt: null }
          : s
      )
    );
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;

    setActionError(null);
    let cmt: Awaited<ReturnType<typeof addSectionComment>>;
    try {
      cmt = await addSectionComment(
        partId,
        activeSectionKey,
        currentUserName,
        currentUserOrg,
        newCommentText.trim()
      );
    } catch (err) {
      console.error('Error adding comment:', err);
      setActionError(errorText(err, null));
      return;
    }

    setComments((prev) => [cmt, ...prev]);
    setNewCommentText('');
  };

  const handleToggleResolveComment = async (commentId: string) => {
    setActionError(null);
    try {
      await resolveSectionComment(partId, activeSectionKey, commentId);
    } catch (err) {
      console.error('Error resolving comment:', err);
      setActionError(errorText(err, null));
      return;
    }
    setComments((prev) =>
      prev.map((c) => (c.id === commentId ? { ...c, resolved: !c.resolved } : c))
    );
  };

  const handleRestoreRevision = async (rev: SectionRevisionItem) => {
    if (
      confirm(
        tEditor('restoreConfirm', {
          author: rev.authorName,
          time: new Date(rev.timestamp).toLocaleTimeString(locale),
        })
      )
    ) {
      setActionError(null);
      setEditorText(rev.content);
      try {
        await restoreSectionRevision(partId, activeSectionKey, rev.id);
      } catch (err) {
        console.error('Error restoring revision:', err);
        setActionError(errorText(err, null));
      }
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
      alert(tEditor('aiFailed', { message: errorMessage(e) }));
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
              <span>{tEditor('presenceTitle', { count: presenceList.length })}</span>
            </h3>
            <p className="text-[11px] text-muted mt-0.5">
              {tEditor('presenceHint')}
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
              {user.org ? (
                <span className="text-[10px] text-muted font-mono hidden sm:inline max-w-32 truncate">
                  ({user.org})
                </span>
              ) : null}
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
              <span>{tEditor('pageBudget')}</span>
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
              {tEditor('pageBudgetValue', {
                pages: totalEstimatedPages,
                max: MAX_PAGE_LIMIT,
                words: totalWords.toLocaleString(locale),
              })}
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
              <span>{tEditor('pageLimitExceeded', { over: (totalEstimatedPages - MAX_PAGE_LIMIT).toFixed(1) })}</span>
            </span>
          )}

          <a
            href={`/api/documents/export?type=PART_B&format=docx&partId=${partId}&title=Part_B_Technical_Proposal&locale=${locale}`}
            target="_blank"
            rel="noreferrer"
            className="bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 shadow-xs text-xs"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{tEditor('downloadDocx')}</span>
          </a>
        </div>
      </div>

      {/* ──────────────────────── MAIN EDITOR GRID ──────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* LEFT COLUMN: Section Tree Navigation (4 cols) */}
        <div className="lg:col-span-4 space-y-3">
          <div className="bg-surface border border-border rounded-2xl p-4 shadow-2xs space-y-3">
            <h4 className="font-bold text-xs uppercase tracking-wider text-muted font-mono flex items-center justify-between">
              <span>{tEditor('sectionTree')}</span>
              <span className="text-muted font-normal">{tEditor('sectionCount', { count: sections.length })}</span>
            </h4>

            <div className="space-y-2">
              {/* Group 1: Excellence */}
              <div>
                <div className="text-[11px] font-bold text-blue-900 bg-blue-50 px-2.5 py-1 rounded-lg mb-1 flex items-center justify-between">
                  <span>{tEditor('groupExcellence')}</span>
                  <span className="font-mono text-[10px] text-blue-700">{tEditor('groupPages', { count: 18 })}</span>
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
                              {tEditor('leadShort')}: {shortLeadLabel(s, tEditor('leadUnassigned'))}
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
                              {tEditor('sectionPagesShort', { pages: estPages, target: s.targetPages })}
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
                  <span>{tEditor('groupImpact')}</span>
                  <span className="font-mono text-[10px] text-emerald-700">{tEditor('groupPages', { count: 14 })}</span>
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
                              {tEditor('leadShort')}: {shortLeadLabel(s, tEditor('leadUnassigned'))}
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
                              {tEditor('sectionPagesShort', { pages: estPages, target: s.targetPages })}
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
                  <span>{tEditor('groupImplementation')}</span>
                  <span className="font-mono text-[10px] text-purple-700">{tEditor('groupPages', { count: 13 })}</span>
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
                              {tEditor('leadShort')}: {shortLeadLabel(s, tEditor('leadUnassigned'))}
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
                              {tEditor('sectionPagesShort', { pages: estPages, target: s.targetPages })}
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
          {actionError && (
            <p role="alert" className="bg-bad/10 border border-bad/30 rounded-xl p-4 text-sm font-semibold text-bad">
              {actionError}
            </p>
          )}
          <div className="bg-surface border border-border rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
              <div>
                <h3 className="font-bold text-base text-ink flex items-center gap-2">
                  <span>{activeSection.title}</span>
                </h3>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted mt-1 font-mono">
                  <span>
                    {tEditor('leadAuthorLabel')}:{' '}
                    <strong>{activeSection.leadAuthor?.trim() || tEditor('leadUnassigned')}</strong>
                    {activeSection.leadAuthorOrg?.trim()
                      ? ` (${activeSection.leadAuthorOrg.trim()})`
                      : ''}
                  </span>
                  <span>•</span>
                  <span>{tEditor('targetPages', { count: activeSection.targetPages })}</span>
                  <span>•</span>
                  <span className="text-blue-600 font-semibold">
                    {tEditor('currentPages', { pages: currentSectionEstimatedPages, words: currentSectionWords })}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {saveStatus === 'SAVING' && (
                  <span className="text-[11px] font-mono text-amber-600 bg-amber-50 px-2 py-1 rounded flex items-center gap-1">
                    <Clock className="w-3 h-3 animate-spin" />
                    <span>{tEditor('saving')}</span>
                  </span>
                )}
                {saveStatus === 'SAVED' && (
                  <span className="text-[11px] font-mono text-emerald-600 bg-emerald-50 px-2 py-1 rounded flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    <span>{tEditor('synced')}</span>
                  </span>
                )}
                {saveStatus === 'UNSAVED' && (
                  <span className="text-[11px] font-mono text-muted bg-surface-hover px-2 py-1 rounded">
                    {tEditor('unsaved')}
                  </span>
                )}

                {isLockedByMe ? (
                  <button
                    onClick={handleReleaseLock}
                    className="bg-emerald-50 border border-emerald-300 text-emerald-700 hover:bg-emerald-100 px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>{tEditor('releaseLock')}</span>
                  </button>
                ) : isLockedByOther ? (
                  <div className="bg-red-50 border border-red-300 text-red-700 px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" />
                    <span>{tEditor('lockedBy', { name: activeSection.lockedByName?.split(' ')[0] ?? '' })}</span>
                  </div>
                ) : (
                  <button
                    onClick={handleAcquireLock}
                    className="bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>{tEditor('acquireLock')}</span>
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
                  <span>{tEditor('editMarkdown')}</span>
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
                  <span>{tEditor('preview')}</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setActiveDrawer('AI')}
                  className="bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>{tEditor('aiAssistant')}</span>
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
                  <span>{tEditor('reviewComments', { count: activeSectionComments.length })}</span>
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
                  <span>{tEditor('history')}</span>
                </button>

                <button
                  onClick={() => handleSaveContent(true)}
                  disabled={isSaving}
                  className="bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{tEditor('save')}</span>
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
                    placeholder={tEditor('contentPlaceholder')}
                    className="w-full rounded-xl border border-border p-4 font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none bg-ground/50 leading-relaxed"
                  />
                  <div className="absolute bottom-3 right-3 text-[10px] font-mono bg-surface/90 border border-border px-2 py-0.5 rounded text-muted shadow-2xs">
                    {tEditor('editorStats', { words: currentSectionWords, pages: currentSectionEstimatedPages })}
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
                {tEditor('commentsTitle', { section: activeSection.title })}
              </h4>
            </div>
            <button
              onClick={() => setActiveDrawer(null)}
              aria-label={tEditor('close')}
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
              placeholder={tEditor('commentPlaceholder')}
              className="flex-1 border border-border rounded-xl p-2.5 text-xs bg-ground focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{tEditor('send')}</span>
            </button>
          </form>

          <div className="space-y-3 pt-2">
            {activeSectionComments.length === 0 ? (
              <p className="text-xs text-muted py-4 text-center">
                {tEditor('noComments')}
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
                      {cmt.authorOrg ? (
                        <span className="text-[11px] text-muted font-mono">
                          ({cmt.authorOrg})
                        </span>
                      ) : null}
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
                      <span>{cmt.resolved ? tEditor('reopen') : tEditor('markResolved')}</span>
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
                {tEditor('historyTitle', { section: activeSection.title })}
              </h4>
            </div>
            <button
              onClick={() => setActiveDrawer(null)}
              aria-label={tEditor('close')}
              className="p-1 text-muted hover:text-ink-2 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3">
            {activeSectionRevisions.length === 0 && (
              <p className="text-xs text-muted py-4 text-center">{tEditor('noRevisions')}</p>
            )}
            {activeSectionRevisions.map((rev, idx) => (
              <div
                key={rev.id || idx}
                className="bg-ground border border-border p-3.5 rounded-xl flex items-center justify-between gap-4 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-ink">{rev.authorName}</span>
                    {rev.authorOrg ? (
                      <span className="text-[10px] text-muted font-mono">
                        ({rev.authorOrg})
                      </span>
                    ) : null}
                    <span className="bg-purple-100 text-purple-800 text-[10px] font-mono px-1.5 py-0.5 rounded">
                      {tEditor('revisionWords', { count: rev.wordCount })}
                    </span>
                  </div>
                  <p className="text-[11px] text-ink-2">{rev.summary}</p>
                  <span className="text-[10px] text-muted font-mono block">
                    {new Date(rev.timestamp).toLocaleString(locale)}
                  </span>
                </div>

                <button
                  onClick={() => handleRestoreRevision(rev)}
                  className="bg-surface border border-border hover:bg-surface-hover text-ink px-3 py-1.5 rounded-lg font-semibold text-[11px] transition flex items-center gap-1 shrink-0 shadow-2xs"
                >
                  <RotateCcw className="w-3 h-3 text-purple-600" />
                  <span>{tEditor('restoreRevision')}</span>
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
                  {tEditor('aiTitle')}
                </h4>
                <p className="text-xs text-indigo-300 mt-0.5">
                  {tEditor('aiSelectedSection')} <strong>{activeSection.title}</strong>
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveDrawer(null)}
              aria-label={tEditor('close')}
              className="p-1 text-muted hover:text-white rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-3 text-xs">
            <label className="font-semibold text-slate-200 block">
              {tEditor('aiNotesLabel')}
            </label>
            <textarea
              rows={3}
              value={aiPromptNotes}
              onChange={(e) => setAiPromptNotes(e.target.value)}
              placeholder={tEditor('aiPromptPlaceholder')}
              className="w-full border border-indigo-700/60 rounded-xl p-3 bg-slate-950/80 text-xs text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-indigo-400 focus:outline-none font-mono"
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setAiPromptNotes(tEditor('aiPresetSmartNotes'))}
                className="bg-indigo-950/80 border border-indigo-800 hover:border-indigo-600 text-indigo-200 p-2 rounded-lg text-left text-[11px] transition"
              >
                {tEditor('aiPresetSmart')}
              </button>
              <button
                type="button"
                onClick={() => setAiPromptNotes(tEditor('aiPresetOpenScienceNotes'))}
                className="bg-indigo-950/80 border border-indigo-800 hover:border-indigo-600 text-indigo-200 p-2 rounded-lg text-left text-[11px] transition"
              >
                {tEditor('aiPresetOpenScience')}
              </button>
              <button
                type="button"
                onClick={() => setAiPromptNotes(tEditor('aiPresetImpactNotes'))}
                className="bg-indigo-950/80 border border-indigo-800 hover:border-indigo-600 text-indigo-200 p-2 rounded-lg text-left text-[11px] transition"
              >
                {tEditor('aiPresetImpact')}
              </button>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-indigo-900/60">
              <button
                type="button"
                onClick={() => setActiveDrawer(null)}
                className="px-4 py-2 rounded-xl text-muted hover:text-white transition text-xs font-semibold"
              >
                {tEditor('cancel')}
              </button>
              <button
                type="button"
                onClick={handleGenerateAi}
                disabled={isAiGenerating}
                className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-bold px-5 py-2.5 rounded-xl transition text-xs shadow-lg flex items-center gap-2 disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>{isAiGenerating ? tEditor('aiGenerating') : tEditor('aiGenerate')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
