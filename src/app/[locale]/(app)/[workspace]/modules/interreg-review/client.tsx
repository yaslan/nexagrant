'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertCircle, CheckCircle2, Download, FileUp, Loader2, RotateCcw, SearchCheck } from 'lucide-react';

import {
  INTERREG_ERROR_ARGS,
  INTERREG_UPLOAD_LIMITS,
  formatFromFileName,
  type InterregDocKind,
} from '@/modules/m17/limits';
import { inlineTokens, parseReportSections, type ReportBlock } from '@/modules/m17/report-blocks';
import type { InterregResultView } from '@/modules/m17/result-view';
import type { InterregAnalysisView, InterregDocumentView } from '@/modules/m17/server/analyses';

import styles from './interreg-review.module.css';

/**
 * M17 Interreg pre-assessment screen (FO-189): upload the call guide, upload the
 * project file, check, read the four-section report, download it, reset.
 *
 * Talks only to the module's own API (src/app/api/interreg-review/**); every
 * refusal is a code translated under InterregReview.errors. The newest analysis
 * of the user is picked up again on load, so a refresh does not lose the files
 * or the report. "Reset" deletes it — the extracted texts go with it.
 */

const API = '/api/interreg-review/analyses';
const ACCEPT = '.pdf,.docx,.md,.markdown,.txt';
/** How often an analysis left running (another tab, a refresh mid-run) is looked at again. */
const POLL_MS = 5_000;
/** After this many looks (10 minutes) the page stops asking and says so; a refresh starts over. */
const MAX_POLLS = 120;

type Slot = { busy: boolean; error: string | null };
const IDLE: Slot = { busy: false, error: null };

/** One size for both kinds of button: the owner asked for pink and blue to be symmetric. */
const BUTTON =
  'inline-flex h-11 w-56 max-w-full items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold text-white ' +
  'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ' +
  'focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50';
const PINK = `${BUTTON} bg-(--m17-pink) enabled:hover:bg-(--m17-pink-hover) focus-visible:ring-(--m17-pink-line)`;
const BLUE = `${BUTTON} bg-(--m17-blue) enabled:hover:bg-(--m17-blue-hover) focus-visible:ring-(--m17-blue)`;

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    return typeof body.error === 'string' ? body.error : 'unknown';
  } catch {
    return 'unknown';
  }
}

export function InterregReviewClient() {
  const t = useTranslations('InterregReview');
  const [analysis, setAnalysis] = useState<InterregAnalysisView | null>(null);
  const [result, setResult] = useState<InterregResultView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [slots, setSlots] = useState<Record<InterregDocKind, Slot>>({ call: IDLE, project: IDLE });
  const [checking, setChecking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const reportRef = useRef<HTMLHeadingElement>(null);

  const message = useCallback(
    (code: string) => (t.has(`errors.${code}`) ? t(`errors.${code}`, INTERREG_ERROR_ARGS) : t('ui.genericError')),
    [t],
  );

  const fetchResult = useCallback(async (id: string): Promise<InterregResultView | null> => {
    const res = await fetch(`${API}/${id}/result`);
    return res.ok ? ((await res.json()) as { result: InterregResultView }).result : null;
  }, []);

  /** The newest analysis and its report, or an error code; sets no state itself. */
  const fetchLatest = useCallback(async (): Promise<
    { analysis: InterregAnalysisView | null; result: InterregResultView | null } | { error: string }
  > => {
    try {
      const res = await fetch(API);
      if (!res.ok) return { error: await readError(res) };
      const { analyses } = (await res.json()) as { analyses: InterregAnalysisView[] };
      const newest = analyses[0] ?? null;
      return { analysis: newest, result: newest?.status === 'DONE' ? await fetchResult(newest.id) : null };
    } catch {
      return { error: 'unknown' };
    }
  }, [fetchResult]);

  const load = useCallback(
    () =>
      fetchLatest().then((loaded) => {
        if ('error' in loaded) setLoadError(message(loaded.error));
        else {
          setAnalysis(loaded.analysis);
          setResult(loaded.result);
        }
        setLoading(false);
      }),
    [fetchLatest, message],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // A run this page did not start (another tab, or a refresh during the run): look again
  // until it ends, then show what it produced.
  const runningElsewhere = analysis?.status === 'ANALYZING' && !checking;
  useEffect(() => {
    if (!runningElsewhere || !analysis) return;
    const id = analysis.id;
    let polls = 0;
    const timer = setInterval(async () => {
      polls += 1;
      if (polls > MAX_POLLS) {
        clearInterval(timer);
        setActionError(t('ui.stillRunning'));
        return;
      }
      // A failed look (offline, a deploy) is not the run's end: the next tick tries again.
      try {
        const res = await fetch(`${API}/${id}`);
        if (!res.ok) return;
        const next = ((await res.json()) as { analysis: InterregAnalysisView }).analysis;
        if (next.status === 'ANALYZING') return;
        clearInterval(timer);
        setAnalysis(next);
        if (next.status === 'DONE') setResult(await fetchResult(id));
      } catch {
        // Counted above; nothing else to do until the next tick.
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [runningElsewhere, analysis, fetchResult, t]);

  const setSlot = (kind: InterregDocKind, slot: Slot) => setSlots((s) => ({ ...s, [kind]: slot }));

  /** The analysis the files go into; created on the first upload. */
  async function ensureAnalysis(): Promise<{ id: string } | { error: string }> {
    if (analysis) return { id: analysis.id };
    const res = await fetch(API, { method: 'POST' });
    if (!res.ok) return { error: await readError(res) };
    const created = ((await res.json()) as { analysis: InterregAnalysisView }).analysis;
    setAnalysis(created);
    return { id: created.id };
  }

  async function upload(kind: InterregDocKind, file: File) {
    setActionError(null);
    // The route checks all of this again; refusing here saves sending the bytes.
    const refused = !formatFromFileName(file.name)
      ? 'unsupported_type'
      : file.size === 0
        ? 'no_file'
        : file.size > INTERREG_UPLOAD_LIMITS.maxFileBytes
          ? 'too_large'
          : null;
    if (refused) {
      setSlot(kind, { busy: false, error: message(refused) });
      return;
    }
    setSlot(kind, { busy: true, error: null });
    setAnnounce(t('ui.uploading'));
    try {
      const target = await ensureAnalysis();
      if ('error' in target) {
        setSlot(kind, { busy: false, error: message(target.error) });
        return;
      }
      const form = new FormData();
      form.set('kind', kind);
      form.set('file', file);
      const res = await fetch(`${API}/${target.id}/documents`, { method: 'POST', body: form });
      if (!res.ok) {
        const error = message(await readError(res));
        setSlot(kind, { busy: false, error });
        setAnnounce(error);
        return;
      }
      setAnalysis(((await res.json()) as { analysis: InterregAnalysisView }).analysis);
      // A new file clears the earlier result on the server (FO-186); the screen follows.
      setResult(null);
      setSlot(kind, IDLE);
      setAnnounce(kind === 'call' ? t('ui.callReady') : t('ui.projectReady'));
    } catch {
      setSlot(kind, { busy: false, error: t('ui.genericError') });
    }
  }

  async function check() {
    if (!analysis) return;
    setActionError(null);
    setChecking(true);
    setAnnounce(t('ui.analyzing'));
    try {
      const res = await fetch(`${API}/${analysis.id}/evaluate`, { method: 'POST' });
      if (!res.ok) {
        const error = message(await readError(res));
        setActionError(error);
        setAnnounce(error);
        // FAILED keeps the documents; read the status back so the button says what it can do.
        const back = await fetch(`${API}/${analysis.id}`);
        if (back.ok) setAnalysis(((await back.json()) as { analysis: InterregAnalysisView }).analysis);
        return;
      }
      setResult(((await res.json()) as { result: InterregResultView }).result);
      setAnalysis({ ...analysis, status: 'DONE' });
      setAnnounce(t('ui.reportReady'));
      // Move focus to the report so a keyboard or screen-reader user lands on it.
      requestAnimationFrame(() => reportRef.current?.focus());
    } catch {
      setActionError(t('ui.genericError'));
    } finally {
      setChecking(false);
    }
  }

  async function reset() {
    if (!analysis) return;
    // Uploaded files are the user's own data: deleting them is asked first, with or
    // without a report.
    const confirmKey = result ? 'ui.resetConfirm' : analysis.call || analysis.project ? 'ui.resetConfirmFiles' : null;
    if (confirmKey && !window.confirm(t(confirmKey))) return;
    setActionError(null);
    const res = await fetch(`${API}/${analysis.id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) {
      setActionError(message(await readError(res)));
      return;
    }
    setAnalysis(null);
    setResult(null);
    setSlots({ call: IDLE, project: IDLE });
    setAnnounce(t('ui.resetDone'));
  }

  function download() {
    if (!result) return;
    const blob = new Blob([result.reportMarkdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${t('ui.downloadName')}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const running = checking || analysis?.status === 'ANALYZING';
  const uploading = slots.call.busy || slots.project.busy;
  const ready = Boolean(analysis?.call && analysis?.project);

  return (
    <div className={`${styles.root} space-y-6`} data-testid="m17-review">
      <header className="space-y-3">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight font-heading text-ink">{t('ui.title')}</h1>
        <p className="text-sm text-ink-2 max-w-3xl">{t('ui.intro')}</p>
        <NoticePill text={t('assessmentNotice')} />
      </header>

      {/* One polite live region for every status change: uploads, the run, the report. */}
      <p className="sr-only" role="status" aria-live="polite" data-testid="m17-live">
        {announce}
      </p>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted" data-testid="m17-loading">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          {t('ui.loading')}
        </p>
      ) : loadError ? (
        <div role="alert" className="rounded-xl border border-bad/40 bg-bad/10 p-4 text-sm text-ink">
          <p className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-bad" aria-hidden="true" />
            {loadError}
          </p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setLoadError(null);
              void load();
            }}
            className={`${BLUE} mt-3`}
          >
            {t('ui.retry')}
          </button>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <UploadStep
              kind="call"
              step={1}
              title={t('ui.step1Title')}
              hint={t('ui.step1Hint')}
              doc={analysis?.call ?? null}
              doneLabel={t('ui.callReady')}
              slot={slots.call}
              disabled={running}
              onFile={(f) => void upload('call', f)}
            />
            <UploadStep
              kind="project"
              step={2}
              title={t('ui.step2Title')}
              hint={t('ui.step2Hint')}
              doc={analysis?.project ?? null}
              doneLabel={t('ui.projectReady')}
              slot={slots.project}
              disabled={running}
              onFile={(f) => void upload('project', f)}
            />
          </div>

          <section
            aria-labelledby="m17-actions-title"
            className="rounded-xl border border-line bg-surface p-4 sm:p-5 space-y-3"
          >
            <h2 id="m17-actions-title" className="sr-only">
              {t('ui.actionsTitle')}
            </h2>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:flex-wrap sm:items-start">
              <button
                type="button"
                className={BLUE}
                onClick={() => void check()}
                disabled={!ready || running || uploading}
                aria-describedby={!ready ? 'm17-check-hint' : undefined}
                data-testid="m17-check"
              >
                {running ? (
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                ) : (
                  <SearchCheck className="h-4 w-4" aria-hidden="true" />
                )}
                {running ? t('ui.analyzingShort') : t('ui.check')}
              </button>
              {result && (
                <button type="button" className={BLUE} onClick={download} data-testid="m17-download">
                  <Download className="h-4 w-4" aria-hidden="true" />
                  {t('ui.download')}
                </button>
              )}
              <button
                type="button"
                className={BLUE}
                onClick={() => void reset()}
                disabled={!analysis || running || uploading}
                data-testid="m17-reset"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                {t('ui.reset')}
              </button>
            </div>
            {!ready && (
              <p id="m17-check-hint" className="text-xs text-muted">
                {t('ui.checkHint')}
              </p>
            )}
            {running && (
              <div className="flex items-start gap-3 rounded-lg bg-ground p-3" data-testid="m17-analyzing">
                <Loader2
                  className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-(--m17-blue) motion-reduce:animate-none"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-sm font-medium text-ink">{t('ui.analyzing')}</p>
                  <p className="text-xs text-muted">{t('ui.analyzingHint')}</p>
                </div>
              </div>
            )}
            {actionError && (
              <p role="alert" className="flex items-start gap-2 text-sm text-bad" data-testid="m17-action-error">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {actionError}
              </p>
            )}
          </section>

          {result && <ReportView result={result} rubricLabel={analysis?.rubric.label ?? ''} headingRef={reportRef} />}
        </>
      )}
    </div>
  );
}

function NoticePill({ text }: { text: string }) {
  return (
    <p
      className="inline-flex items-center rounded-full border border-amber/40 bg-amber/10 px-3 py-1 text-xs font-semibold text-ink"
      data-testid="m17-notice"
    >
      {text}
    </p>
  );
}

interface UploadStepProps {
  kind: InterregDocKind;
  step: number;
  title: string;
  hint: string;
  doc: InterregDocumentView | null;
  doneLabel: string;
  slot: Slot;
  disabled: boolean;
  onFile: (file: File) => void;
}

function UploadStep({ kind, step, title, hint, doc, doneLabel, slot, disabled, onFile }: UploadStepProps) {
  const t = useTranslations('InterregReview');
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const titleId = `m17-${kind}-title`;
  const blocked = disabled || slot.busy;

  function take(files: FileList | null) {
    const file = files?.[0];
    if (file) onFile(file);
  }

  return (
    <section
      aria-labelledby={titleId}
      className="rounded-xl border border-line bg-surface p-4 sm:p-5 flex flex-col gap-3"
      data-testid={`m17-step-${kind}`}
    >
      <div>
        <p className="text-xs font-mono font-semibold uppercase tracking-wider text-(--m17-pink-ink)">
          {t('ui.stepLabel', { n: step })}
        </p>
        <h2 id={titleId} className="mt-0.5 text-lg font-semibold text-ink">
          {title}
        </h2>
        <p className="text-sm text-muted">{hint}</p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!blocked) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!blocked) take(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-(--m17-pink-line) px-4 py-6 text-center transition-colors ${
          over ? 'bg-(--m17-pink-zone-active)' : 'bg-(--m17-pink-zone)'
        }`}
        data-testid={`m17-drop-${kind}`}
      >
        <FileUp className="h-7 w-7 text-(--m17-pink-ink)" aria-hidden="true" />
        <p className="text-sm text-(--m17-pink-ink)">{t('ui.dropHere')}</p>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            take(e.target.files);
            e.target.value = '';
          }}
          data-testid={`m17-input-${kind}`}
        />
        <button
          type="button"
          className={PINK}
          disabled={blocked}
          onClick={() => input.current?.click()}
          aria-describedby={`m17-${kind}-accepted`}
          data-testid={`m17-choose-${kind}`}
        >
          {slot.busy ? (
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <FileUp className="h-4 w-4" aria-hidden="true" />
          )}
          {slot.busy ? t('ui.uploadingShort') : doc ? t('ui.replaceFile') : t('ui.chooseFile')}
        </button>
        <p id={`m17-${kind}-accepted`} className="text-xs text-muted">
          {t('ui.accepted', { maxMb: INTERREG_ERROR_ARGS.maxMb })}
        </p>
      </div>

      {doc && !slot.busy && (
        <div
          className="flex items-start gap-2 rounded-lg border border-(--m17-ok-line) bg-(--m17-ok-zone) p-3"
          data-testid={`m17-badge-${kind}`}
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-(--m17-ok)" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-(--m17-ok)">{doneLabel}</p>
            <p className="truncate text-xs text-ink-2" title={doc.fileName}>
              {doc.fileName}
            </p>
            <p className="text-xs text-muted">
              {doc.pages === null
                ? t('ui.fileMeta', { chars: doc.chars })
                : t('ui.fileMetaPages', { chars: doc.chars, pages: doc.pages })}
            </p>
          </div>
        </div>
      )}
      {slot.error && (
        <p role="alert" className="flex items-start gap-2 text-sm text-bad" data-testid={`m17-error-${kind}`}>
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {slot.error}
        </p>
      )}
    </section>
  );
}

function ReportView({
  result,
  rubricLabel,
  headingRef,
}: {
  result: InterregResultView;
  rubricLabel: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const t = useTranslations('InterregReview');
  const sections = parseReportSections(result.reportMarkdown);

  return (
    <section aria-labelledby="m17-report-title" className="space-y-4" data-testid="m17-report">
      <div className="rounded-xl border border-line bg-surface p-4 sm:p-5">
        <h2
          id="m17-report-title"
          ref={headingRef}
          tabIndex={-1}
          className="text-xl font-semibold font-heading text-ink focus:outline-none"
        >
          {t('ui.reportTitle')}
        </h2>
        {rubricLabel && <p className="mt-1 text-xs text-muted">{t('ui.rubric', { label: rubricLabel })}</p>}
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="rounded-xl bg-ground px-5 py-4 text-center sm:min-w-44" data-testid="m17-score">
            <p className="text-xs text-muted">{t('ui.scoreLabel')}</p>
            <p className="font-mono text-4xl font-bold text-ink">
              {t('ui.score100', { score: result.score100 })}
            </p>
            <p className="text-xs text-muted">{t('ui.rawScore', { raw: result.rawScore, maxRaw: result.maxRaw })}</p>
          </div>
          <div className="flex flex-col items-start gap-2">
            <NoticePill text={t('assessmentNotice')} />
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                result.passesThresholds ? 'bg-ok/10 text-ok' : 'bg-bad/10 text-bad'
              }`}
              data-testid="m17-threshold"
            >
              {result.passesThresholds ? (
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {result.passesThresholds ? t('ui.passes') : t('ui.belowThreshold')}
            </span>
            <span className="text-xs text-ink-2">{t('ui.knockouts', { count: result.knockouts.length })}</span>
          </div>
        </div>
      </div>

      {sections.map((s, i) => (
        <article
          key={i}
          aria-labelledby={`m17-section-${i}`}
          className="rounded-xl border border-line bg-surface p-4 sm:p-5"
          data-testid="m17-section"
        >
          <h3 id={`m17-section-${i}`} className="text-lg font-semibold text-ink">
            {s.title}
          </h3>
          <div className="mt-3 space-y-3 text-sm text-ink-2">
            {s.blocks.map((b, j) => (
              <Block key={j} block={b} />
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}

function Inline({ text }: { text: string }) {
  return (
    <>
      {inlineTokens(text).map((tok, i) =>
        tok.kind === 'strong' ? (
          <strong key={i} className="font-semibold text-ink">
            {tok.text}
          </strong>
        ) : tok.kind === 'em' ? (
          <em key={i}>{tok.text}</em>
        ) : (
          <React.Fragment key={i}>{tok.text}</React.Fragment>
        ),
      )}
    </>
  );
}

function Block({ block }: { block: ReportBlock }) {
  switch (block.type) {
    case 'heading':
      return (
        <h4 className="pt-2 text-sm font-semibold text-ink">
          <Inline text={block.text} />
        </h4>
      );
    case 'paragraph':
      return (
        <p>
          <Inline text={block.text} />
        </p>
      );
    case 'quote':
      return (
        <blockquote className="whitespace-pre-line border-l-4 border-line pl-3 text-ink">
          {block.lines.join('\n')}
        </blockquote>
      );
    case 'list':
      return (
        <ul className="list-disc space-y-1.5 pl-5">
          {block.items.map((item, i) => (
            <li key={i}>
              <Inline text={item.text} />
              {item.children.length > 0 && (
                <ul className="mt-1 list-[circle] space-y-1 pl-5">
                  {item.children.map((c, j) => (
                    <li key={j}>
                      <Inline text={c} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      );
    case 'table':
      return (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                {block.header.map((h, i) => (
                  <th key={i} scope="col" className={`py-2 pr-3 font-semibold text-ink ${i === block.header.length - 1 ? 'text-right' : ''}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i} className="border-b border-line/60">
                  {row.map((c, j) => (
                    <td
                      key={j}
                      className={`py-1.5 pr-3 align-top ${j === 0 ? 'font-mono text-xs' : ''} ${j === row.length - 1 ? 'text-right font-mono' : ''}`}
                    >
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}
