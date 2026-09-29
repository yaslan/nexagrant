'use client';

import React, { useEffect, useRef, useState } from 'react';
import { 
  FileText, 
  Sparkles,
  Plus, 
  Printer, 
  Building2, 
  ArrowLeft,
  Clock,
  Send,
  MessageSquare,
  Download,
  AlertCircle,
  AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { generateMeetingBrief, savePostMeetingNotes } from '@/modules/m9/server/actions';
import { generateIcsContent } from '@/lib/calendar';
import { resolveMeetingSchedule } from '@/modules/m9/meeting-schedule';
import { isTemplateDraft, stripTemplateMarker } from '@/modules/m9/brief-template';

export interface BriefItem {
  id: string;
  interactionId: string;
  // Nullable, not just absent: these are nullable columns on MeetingBrief.
  partnerName?: string | null;
  content: string;
  meetingScheduledAt?: string | Date | null;
  meetingScheduledTz?: string | null;
  createdAt: string | Date;
}

interface MeetingBriefsClientProps {
  opportunityId: string;
  locale: string;
  workspace: string;
  opportunityTitle: string;
  /** Briefs linked to this opportunity. */
  briefs: BriefItem[];
  /** The tenant's briefs linked to no opportunity (written before the link existed). */
  unlinkedBriefs?: BriefItem[];
}

const formatBrusselsTime = (date: Date | string | null, dateLocale: string): string => {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  try {
    const brussels = new Intl.DateTimeFormat(dateLocale, {
      timeZone: 'Europe/Brussels',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(d);
    return brussels;
  } catch {
    return '';
  }
};

/**
 * The one error band this screen uses. It existed inline for the calendar
 * failure (P3-14); the brief generator needs the same surface, so the markup
 * is shared instead of copied — one visual language, one set of tokens, one
 * a11y contract (`role="alert"`, so it is announced the moment it appears).
 *
 * `action` carries the recovery affordance. An error the user can do something
 * about should say so next to the sentence that reports it.
 */
function AlertBanner({
  id,
  testId,
  message,
  dismissLabel,
  onDismiss,
  action,
}: {
  id?: string;
  testId: string;
  message: string;
  dismissLabel: string;
  onDismiss: () => void;
  action?: React.ReactNode;
}) {
  return (
    <div
      id={id}
      role="alert"
      data-testid={testId}
      className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 flex items-start gap-2"
    >
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
      <div className="flex-1 space-y-2">
        <p>{message}</p>
        {action}
      </div>
      {/* min-h-6 keeps the hit area at 24px (WCAG 2.2 SC 2.5.8) — the label
          text alone is only 16px tall. */}
      <button
        type="button"
        onClick={onDismiss}
        className="ml-auto shrink-0 min-h-6 px-1 text-xs font-bold text-rose-700 hover:text-rose-900 underline underline-offset-2"
      >
        {dismissLabel}
      </button>
    </div>
  );
}

const dateToUTC = (dateStr: string, timeStr: string): Date => {
  const local = new Date(`${dateStr}T${timeStr}`);
  return new Date(local.getTime());
};

export function MeetingBriefsClient({
  opportunityId,
  locale,
  workspace,
  opportunityTitle,
  briefs: initialBriefs,
  unlinkedBriefs: initialUnlinkedBriefs = [],
}: MeetingBriefsClientProps) {
  const t = useTranslations('m9');
  const dateLocale = locale === 'tr' ? 'tr-TR' : 'en-US';
  const [briefs, setBriefs] = useState<BriefItem[]>(initialBriefs);
  const [unlinkedBriefs, setUnlinkedBriefs] = useState<BriefItem[]>(initialUnlinkedBriefs);
  const [partnerName, setPartnerName] = useState('');
  const [meetingDate, setMeetingDate] = useState('');
  const [meetingTime, setMeetingTime] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const [activeBriefId, setActiveBriefId] = useState<string>(
    initialBriefs[0]?.id || initialUnlinkedBriefs[0]?.id || ''
  );

  const [meetingNotes, setMeetingNotes] = useState('');
  const [meetingDecisions, setMeetingDecisions] = useState('');
  const [actionItemInput, setActionItemInput] = useState('');
  const [actionItems, setActionItems] = useState<string[]>([]);
  const [nextMeetingDate, setNextMeetingDate] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  // Inline error surfaces. `scheduleError` belongs to the date/time pair in the
  // generator form; `icsError` is a page-level failure that used to be an
  // `alert()` (dogfood findings P2-9 and P3-14).
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [icsError, setIcsError] = useState<string | null>(null);
  // Post-meeting notes failure surface. Prevents silent data loss when save fails.
  const [notesError, setNotesError] = useState<string | null>(null);
    // Every way brief generation can fail lands here. It used to have no surface
  // at all: the throw went to `console.error` and an empty `res.brief` went
  // nowhere, so the user pressed the button, watched the spinner, and was told
  // nothing (dogfood finding P0, TASK-MTQURC2H4E0WF).
  const [generateError, setGenerateError] = useState<string | null>(null);
  const meetingDateRef = useRef<HTMLInputElement>(null);
  const meetingTimeRef = useRef<HTMLInputElement>(null);
  const generateButtonRef = useRef<HTMLButtonElement>(null);
  const focusOrphanedRef = useRef(false);

  const activeBrief =
    briefs.find((b) => b.id === activeBriefId) ||
    unlinkedBriefs.find((b) => b.id === activeBriefId) ||
    briefs[0] ||
    unlinkedBriefs[0];
  /**
   * A brief the model never wrote is a blank working document, not a briefing.
   * The marker is stored with the content so this survives a reload, a print and
   * an .ics export; it is machine text and is stripped everywhere the body is
   * shown or exported.
   */
  const activeIsDraft = activeBrief ? isTemplateDraft(activeBrief.content) : false;
  const activeBody = activeBrief ? stripTemplateMarker(activeBrief.content) : '';

  /**
   * Both controls inside the error band unmount when the band closes, so a
   * keyboard user who pressed one is left with focus on <body> and no place in
   * the page (WCAG 2.4.3). Focus goes back to the button the band belongs to —
   * but only once that button is enabled again, since focusing a disabled
   * element does nothing, and only if nothing else has claimed focus meanwhile.
   */
  useEffect(() => {
    if (isGenerating || !focusOrphanedRef.current) return;
    focusOrphanedRef.current = false;
    if (document.activeElement === document.body) generateButtonRef.current?.focus();
  }, [isGenerating, generateError]);

  /**
   * One entry point for both the form submit and the "try again" button in the
   * error band, so a retry runs exactly the validation and the request the
   * first attempt did — and so no branch can return without saying why.
   *
   * The user's input is never cleared on a failure path: the fields are reset
   * only after a brief actually comes back, which is what makes retrying cheap.
   */
  const attemptGenerateBrief = async () => {
    if (!partnerName.trim()) {
      setGenerateError(t('generate.partnerRequired'));
      return;
    }

    // A half-filled date/time pair is rejected here rather than silently
    // dropped, and focus is moved to the field the user still has to fill.
    const schedule = resolveMeetingSchedule(meetingDate, meetingTime);
    if (!schedule.ok) {
      setScheduleError(schedule.message);
      const target = schedule.field === 'date' ? meetingDateRef : meetingTimeRef;
      target.current?.focus();
      return;
    }
    setScheduleError(null);
    setGenerateError(null);

    setIsGenerating(true);
    try {
      const interactionId = `int-${Date.now()}`;
      const meetingScheduledAt = schedule.scheduledAt;

      const res = await generateMeetingBrief({
        interactionId,
        partnerName: partnerName.trim(),
        callTopic: opportunityTitle,
        meetingScheduledAt,
        meetingScheduledTz: 'Europe/Brussels',
        opportunityId,
      });

      if (!res.brief) {
        // "Succeeded" with nothing to show: the action reports this when the
        // brief was written but the DB row was not persisted. Reporting it as a
        // failure is the honest reading — there is no brief on the screen.
        console.error('[M9] generateMeetingBrief returned no brief:', res);
        setGenerateError(t('generate.notSaved'));
        return;
      }

      const newBrief: BriefItem = {
        id: res.brief.id,
        interactionId: res.brief.interactionId,
        partnerName: res.brief.partnerName,
        content: res.brief.content,
        meetingScheduledAt: res.brief.meetingScheduledAt,
        meetingScheduledTz: res.brief.meetingScheduledTz,
        createdAt: res.brief.createdAt,
      };
      setBriefs((prev) => [newBrief, ...prev]);
      setActiveBriefId(newBrief.id);
      setPartnerName('');
      setMeetingDate('');
      setMeetingTime('');
    } catch (err) {
      // The raw reason stays in the console. On screen the user gets a sentence
      // they can act on — never a stack trace or an HTTP status.
      console.error('Error generating brief:', err);
      setGenerateError(t('generate.failed'));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateBrief = async (e: React.FormEvent) => {
    e.preventDefault();
    await attemptGenerateBrief();
  };

  const handleDownloadIcs = () => {
    // Reported through the page alert region instead of a blocking,
    // untranslatable `alert()` — which was also unreachable, because the button
    // used to be hidden in exactly the case that raises this.
    if (!activeBrief?.meetingScheduledAt) {
      setIcsError(t('ics.noScheduleError'));
      return;
    }
    setIcsError(null);

    const startDate = new Date(activeBrief.meetingScheduledAt);
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 1 hour

    const icsContent = generateIcsContent(
      t('ics.eventTitle', { partner: activeBrief.partnerName || t('ics.defaultPartner') }),
      stripTemplateMarker(activeBrief.content).substring(0, 200),
      startDate,
      endDate,
      // The brief row's own id, so re-downloading one meeting updates the event
      // the user already imported instead of adding a duplicate. The UID used to
      // be a fresh `randomUUID()` on every click (RFC 5545 3.8.4.7). The row id
      // survives regeneration: generateMeetingBrief updates the existing row
      // matched on (interactionId, tenantId) rather than inserting a new one.
      `brief-${activeBrief.id}@fabrika.app`
    );

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `brief-${activeBrief.interactionId}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
    setNotesError(null);
    try {
      const res = await savePostMeetingNotes({
        briefId: activeBrief.id,
        partnerName: activeBrief.partnerName || t('postMeeting.defaultPartnerName'),
        notes: meetingNotes,
        decisions: meetingDecisions,
        actionItems,
        nextMeetingDate,
      });

      // Critical: check success flag. Without this check, failed saves silently
      // cleared the form, causing data loss (dogfood finding P1-3, TASK-MTQURC2H4E0WF).
      if (!res.success) {
        setNotesError(t('postMeeting.notesError'));
        console.error('[M9] savePostMeetingNotes failed:', res);
        return;  // Do NOT clear the form on failure.
      }

      // Only clear form after confirmed success
      if (res.formattedPostNotes) {
        // The active brief sits in one of the two lists; the other map is a no-op.
        const appendNotes = (prev: BriefItem[]) =>
          prev.map((b) =>
            b.id === activeBrief.id
              ? { ...b, content: b.content + res.formattedPostNotes }
              : b
          );
        setBriefs(appendNotes);
        setUnlinkedBriefs(appendNotes);
        // Now safe to clear form input
        setMeetingNotes('');
        setMeetingDecisions('');
        setActionItems([]);
        setNextMeetingDate('');
      }
    } catch (err) {
      console.error('Error saving post-meeting notes:', err);
      setNotesError(t('postMeeting.notesError'));
    } finally {
      setIsSavingNotes(false);
    }
  };


  /** One entry of a brief list — shared by this opportunity's list and the unlinked one. */
  const renderBriefButton = (b: BriefItem) => (
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
          {b.partnerName || b.interactionId}
        </span>
        <span className="text-[10px] text-muted font-mono flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {new Date(b.createdAt).toLocaleDateString(dateLocale)}
        </span>
      </div>
      {b.meetingScheduledAt && (
        <div className="text-[11px] text-muted font-mono">
          📅 {formatBrusselsTime(b.meetingScheduledAt, dateLocale)}
        </div>
      )}
      {isTemplateDraft(b.content) && (
        <span className="self-start rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
          {t('brief.draftBadge')}
        </span>
      )}
      <p className="text-[11px] text-muted line-clamp-2">
        {stripTemplateMarker(b.content).substring(0, 100)}...
      </p>
    </button>
  );

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {icsError && (
        <AlertBanner
          testId="m9-ics-error"
          message={icsError}
          dismissLabel={t('alerts.dismiss')}
          onDismiss={() => setIcsError(null)}
        />
      )}

      {/* HEADER BANNER */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 rounded-2xl p-6 text-white shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Link
                href={`/${locale}/${workspace}/pipeline`}
                className="text-xs text-blue-400 hover:text-blue-300 transition flex items-center gap-1 font-semibold"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{t('nav.backToPipeline')}</span>
              </Link>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-blue-400 font-semibold tracking-wider uppercase mb-1">
              <FileText className="w-4 h-4 text-blue-400" />
              <span>{t('header.moduleLabel')}</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight font-heading text-white">
              {t('header.title')}
            </h1>
            <p className="text-muted text-xs md:text-sm mt-1 max-w-2xl">
              {t('header.opportunityLabel')}: <strong className="text-slate-200">{opportunityTitle}</strong>
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs bg-indigo-950 text-indigo-300 border border-indigo-700 px-3 py-1.5 rounded-full font-mono font-bold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>{t('header.aiCreditBadge')}</span>
            </span>

            {activeBrief && (
              <div className="flex gap-2">
                <button
                  onClick={handlePrint}
                  className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{t('actions.print')}</span>
                </button>
                {/* Rendered for every brief, not only dated ones. It used to
                    vanish when the brief had no meeting time, which left the
                    user with no control and no reason; the guard in
                    handleDownloadIcs now explains the reason instead. */}
                <button
                  onClick={handleDownloadIcs}
                  data-testid="m9-ics-download"
                  className="bg-green-700 hover:bg-green-800 border border-green-600 text-white px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{t('actions.downloadIcs')}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* GENERATOR FORM */}
      <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Building2 className="w-4 h-4 text-blue-600" />
          <h2 className="font-bold text-sm text-ink">{t('form.heading')}</h2>
        </div>

        <form onSubmit={handleGenerateBrief} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="text"
              value={partnerName}
              onChange={(e) => setPartnerName(e.target.value)}
              placeholder={t('form.partnerPlaceholder')}
              required
              className="border border-border rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none bg-ground"
            />
            <div className="flex gap-2">
              <input
                ref={meetingDateRef}
                type="date"
                value={meetingDate}
                onChange={(e) => {
                  setMeetingDate(e.target.value);
                  setScheduleError(null);
                }}
                aria-label={t('form.dateAriaLabel')}
                aria-invalid={scheduleError ? true : undefined}
                aria-describedby={scheduleError ? 'm9-schedule-error' : undefined}
                data-testid="m9-meeting-date"
                className={`flex-1 border rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:outline-none bg-ground font-mono ${
                  scheduleError
                    ? 'border-rose-400 focus:ring-rose-500'
                    : 'border-border focus:ring-blue-500'
                }`}
              />
              <input
                ref={meetingTimeRef}
                type="time"
                value={meetingTime}
                onChange={(e) => {
                  setMeetingTime(e.target.value);
                  setScheduleError(null);
                }}
                aria-label={t('form.timeAriaLabel')}
                aria-invalid={scheduleError ? true : undefined}
                aria-describedby={scheduleError ? 'm9-schedule-error' : undefined}
                data-testid="m9-meeting-time"
                className={`flex-1 border rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:outline-none bg-ground font-mono ${
                  scheduleError
                    ? 'border-rose-400 focus:ring-rose-500'
                    : 'border-border focus:ring-blue-500'
                }`}
              />
            </div>
          </div>

          {scheduleError && (
            <p
              id="m9-schedule-error"
              role="alert"
              data-testid="m9-schedule-error"
              className="flex items-start gap-1.5 text-[11px] font-semibold text-rose-700"
            >
              <AlertCircle className="w-3.5 h-3.5 mt-px shrink-0" />
              <span>{scheduleError}</span>
            </p>
          )}

          {meetingDate && meetingTime && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900 space-y-1">
              <div className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                <strong>{t('form.brusselsTimeLabel')}</strong>
              </div>
              <div className="font-mono text-blue-800">
                {formatBrusselsTime(dateToUTC(meetingDate, meetingTime), dateLocale)}
              </div>
              <div className="text-[11px] text-blue-700 mt-1">{t('form.utcNote')}</div>
            </div>
          )}

          {/* The band sits with the control that raised it, right above the
              button the user just pressed — not at the top of the page, where a
              scrolled-down user would never see it. */}
          {generateError && (
            <AlertBanner
              id="m9-generate-error"
              testId="m9-generate-error"
              message={generateError}
              dismissLabel={t('alerts.dismiss')}
              onDismiss={() => {
                focusOrphanedRef.current = true;
                setGenerateError(null);
              }}
              action={
                <button
                  type="button"
                  onClick={() => {
                    focusOrphanedRef.current = true;
                    void attemptGenerateBrief();
                  }}
                  disabled={isGenerating}
                  data-testid="m9-generate-retry"
                  className="min-h-6 rounded-lg border border-rose-300 bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-900 transition hover:bg-rose-200 focus:outline-none focus:ring-2 focus:ring-rose-600 disabled:opacity-50"
                >
                  {t('generate.retry')}
                </button>
              }
            />
          )}

          <button
            ref={generateButtonRef}
            type="submit"
            disabled={isGenerating}
            aria-describedby={generateError ? 'm9-generate-error' : undefined}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-5 rounded-xl transition text-xs shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <Sparkles className="w-4 h-4 animate-spin" />
                <span>{t('generate.generating')}</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>{t('generate.submit')}</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* MAIN CONTENT & BRIEFS FEED */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Brief Selector */}
        <div className="lg:col-span-4 space-y-3">
          <h3 className="font-bold text-xs text-ink-2 uppercase tracking-wider px-1">
            {t('list.heading', { count: briefs.length })}
          </h3>

          <div className="space-y-2">
            {briefs.map(renderBriefButton)}

            {briefs.length === 0 && (
              <div className="bg-surface border border-border rounded-xl p-6 text-center text-muted text-xs">
                {t('list.empty')}
              </div>
            )}
          </div>

          {unlinkedBriefs.length > 0 && (
            <section aria-labelledby="m9-unlinked-briefs" className="space-y-2 pt-3">
              <h3 id="m9-unlinked-briefs" className="font-bold text-xs text-ink-2 uppercase tracking-wider px-1">
                {t('list.unlinkedHeading', { count: unlinkedBriefs.length })}
              </h3>
              <p className="text-[11px] text-muted px-1">{t('list.unlinkedHint')}</p>
              <div className="space-y-2">{unlinkedBriefs.map(renderBriefButton)}</div>
            </section>
          )}
        </div>

        {/* Right: Brief Viewer & Post-Meeting Form */}
        <div className="lg:col-span-8 space-y-6">
          {activeBrief ? (
            <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm space-y-6">
              {/* Brief Header */}
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div>
                  <span className="text-xs font-mono font-bold bg-surface-hover text-ink-2 px-2.5 py-1 rounded-md">
                    {activeBrief.partnerName || `ID: ${activeBrief.interactionId}`}
                  </span>
                </div>
                <span className="text-xs text-muted font-mono">
                  {t('brief.createdLabel')} {new Date(activeBrief.createdAt).toLocaleDateString(dateLocale)}
                </span>
              </div>

              {/* The first thing in the card, above the meeting-time band: it
                  qualifies the whole document, so it cannot sit below the body
                  it is warning about. Amber like that band — this is a caution,
                  not an error — but with a heavier left edge so two amber blocks
                  do not read as one. `role="status"`, not "alert": a standing
                  property of the document, not something that just happened,
                  which is also why it has no dismiss control. */}
              {activeIsDraft && (
                <div
                  role="status"
                  data-testid="m9-template-draft-notice"
                  className="bg-amber-50 border border-amber-200 border-l-4 border-l-amber-500 rounded-lg p-3 text-xs text-amber-900 flex items-start gap-2"
                >
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <strong className="block">{t('brief.draftTitle')}</strong>
                    <span>{t('brief.draftNotice')}</span>
                  </div>
                </div>
              )}

              {activeBrief.meetingScheduledAt && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  <div>
                    <strong>{t('brief.meetingDateUtcLabel')}</strong> {new Date(activeBrief.meetingScheduledAt).toISOString()}
                    <br />
                    <strong>{t('brief.brusselsLabel')}</strong> {formatBrusselsTime(activeBrief.meetingScheduledAt, dateLocale)}
                  </div>
                </div>
              )}

              {/* Structured Markdown Viewer */}
              <div className="prose prose-sm max-w-none text-ink whitespace-pre-wrap font-sans leading-relaxed space-y-4">
                {activeBody}
              </div>

              {/* POST-MEETING NOTES FORM */}
              <div className="pt-6 border-t border-border space-y-4">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-emerald-600" />
                  <h3 className="font-bold text-sm text-ink">
                    {t('postMeeting.heading')}
                  </h3>
                </div>

                {notesError && (
                  <AlertBanner
                    testId="m9-notes-error"
                    message={notesError}
                    dismissLabel={t('alerts.dismiss')}
                    onDismiss={() => setNotesError(null)}
                  />
                )}

                <form onSubmit={handleSavePostMeetingNotes} className="space-y-4 text-xs">
                  <div>
                    <label className="font-semibold text-ink-2 block mb-1">{t('postMeeting.decisionsLabel')}</label>
                    <input
                      type="text"
                      value={meetingDecisions}
                      onChange={(e) => setMeetingDecisions(e.target.value)}
                      placeholder={t('postMeeting.decisionsPlaceholder')}
                      className="w-full border border-border rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none bg-ground"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-ink-2 block mb-1">{t('postMeeting.notesLabel')}</label>
                    <textarea
                      rows={3}
                      value={meetingNotes}
                      onChange={(e) => setMeetingNotes(e.target.value)}
                      placeholder={t('postMeeting.notesPlaceholder')}
                      className="w-full border border-border rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none bg-ground"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-ink-2 block mb-1">{t('postMeeting.actionItemsLabel')}</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={actionItemInput}
                        onChange={(e) => setActionItemInput(e.target.value)}
                        placeholder={t('postMeeting.actionItemPlaceholder')}
                        className="flex-1 border border-border rounded-xl p-2 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none bg-ground"
                      />
                      <button
                        type="button"
                        onClick={handleAddActionItem}
                        className="bg-slate-800 hover:bg-slate-900 text-white font-semibold px-3 py-2 rounded-xl transition text-xs flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{t('postMeeting.addButton')}</span>
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
                              {t('postMeeting.removeButton')}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div>
                    <label className="font-semibold text-ink-2 block mb-1">{t('postMeeting.nextMeetingLabel')}</label>
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
                    <span>{isSavingNotes ? t('postMeeting.saving') : t('postMeeting.submit')}</span>
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="bg-surface border border-border rounded-2xl p-12 text-center text-muted text-xs">
              {t('brief.emptyState')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
