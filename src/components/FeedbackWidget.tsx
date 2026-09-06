'use client';

/**
 * E11.2 — the beta feedback entry point.
 *
 * A floating button on every workspace page, opening a modal that posts to
 * /api/feedback. Kept deliberately short: two selects, two text fields, one
 * optional screenshot. Every extra field is a report we do not get.
 *
 * Accessibility: the dialog traps nothing exotic — it is a labelled
 * role="dialog" with aria-modal, focus moved to the first field on open, Escape
 * to close, and a backdrop click to dismiss. Every control has a visible label.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { MessageSquarePlus, X, Paperclip, CheckCircle2, AlertTriangle } from 'lucide-react';

const CATEGORIES = ['BUG', 'FEATURE_REQUEST', 'UX', 'PERFORMANCE', 'DATA_QUALITY', 'OTHER'] as const;
const IMPACTS = ['BLOCKER', 'MAJOR', 'MINOR', 'IDEA'] as const;

const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

type Category = (typeof CATEGORIES)[number];
type Impact = (typeof IMPACTS)[number];

type Translate = (key: string, values?: Record<string, string | number>) => string;

/**
 * Literal keys, not `t(\`category${c}\`)`. scripts/i18n-check.ts scans call
 * sites for a literal argument; an interpolated key is invisible to it and
 * shows up as a missing translation in both languages.
 */
function categoryLabel(t: Translate, category: Category): string {
  switch (category) {
    case 'BUG':
      return t('categoryBUG');
    case 'FEATURE_REQUEST':
      return t('categoryFEATURE_REQUEST');
    case 'UX':
      return t('categoryUX');
    case 'PERFORMANCE':
      return t('categoryPERFORMANCE');
    case 'DATA_QUALITY':
      return t('categoryDATA_QUALITY');
    case 'OTHER':
      return t('categoryOTHER');
  }
}

function impactLabel(t: Translate, impact: Impact): string {
  switch (impact) {
    case 'BLOCKER':
      return t('impactBLOCKER');
    case 'MAJOR':
      return t('impactMAJOR');
    case 'MINOR':
      return t('impactMINOR');
    case 'IDEA':
      return t('impactIDEA');
  }
}

interface Props {
  locale: string;
  workspace?: string;
}

interface SuccessState {
  priority: string;
  slaHours: number;
}

export default function FeedbackWidget({ locale, workspace }: Props) {
  const t = useTranslations('feedback');
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category>('BUG');
  const [impact, setImpact] = useState<Impact>('MINOR');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const firstFieldRef = useRef<HTMLSelectElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setCategory('BUG');
    setImpact('MINOR');
    setTitle('');
    setBody('');
    setScreenshot(null);
    setError(null);
    setSuccess(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    reset();
  }, [reset]);

  useEffect(() => {
    if (!open) return;
    firstFieldRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setError(null);
    if (!file) {
      setScreenshot(null);
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError(t('screenshotBadType'));
      e.target.value = '';
      setScreenshot(null);
      return;
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      setError(t('screenshotTooLarge'));
      e.target.value = '';
      setScreenshot(null);
      return;
    }
    setScreenshot(file);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (title.trim().length < 4 || body.trim().length < 10) {
      setError(t('errorValidation'));
      return;
    }

    setSubmitting(true);
    try {
      const form = new FormData();
      form.set('category', category);
      form.set('impact', impact);
      form.set('title', title.trim());
      form.set('body', body.trim());
      form.set('locale', locale === 'en' ? 'en' : 'tr');
      form.set('pageUrl', pathname || '');
      if (workspace) form.set('workspaceSlug', workspace);
      if (screenshot) form.set('screenshot', screenshot);

      const res = await fetch('/api/feedback', { method: 'POST', body: form });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(payload?.error === 'validation_failed' ? t('errorValidation') : t('errorGeneric'));
        return;
      }

      setSuccess({ priority: payload.priority, slaHours: payload.slaHours });
    } catch {
      setError(t('errorGeneric'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('openAria')}
        data-testid="feedback-open"
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white dark:focus-visible:outline-slate-100"
      >
        <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">{t('button')}</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-0 sm:items-center sm:p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-dialog-title"
            data-testid="feedback-dialog"
            className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-2xl sm:max-w-lg sm:rounded-2xl"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 id="feedback-dialog-title" className="text-lg font-bold text-ink">
                  {t('title')}
                </h2>
                <p className="mt-1 text-xs text-muted">{t('subtitle')}</p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label={t('close')}
                className="rounded-md p-1.5 text-muted transition hover:bg-surface-hover hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {success ? (
              <div data-testid="feedback-success" className="space-y-4">
                <div className="flex items-start gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold">{t('successTitle')}</p>
                    <p className="mt-1 text-sm">
                      {t('successBody', { priority: success.priority, hours: success.slaHours })}
                    </p>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={reset}
                    className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-ink transition hover:bg-surface-hover"
                  >
                    {t('successAnother')}
                  </button>
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900"
                  >
                    {t('close')}
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="feedback-category" className="mb-1 block text-xs font-semibold text-ink">
                      {t('categoryLabel')}
                    </label>
                    <select
                      id="feedback-category"
                      ref={firstFieldRef}
                      value={category}
                      onChange={(e) => setCategory(e.target.value as Category)}
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {categoryLabel(t, c)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="feedback-impact" className="mb-1 block text-xs font-semibold text-ink">
                      {t('impactLabel')}
                    </label>
                    <select
                      id="feedback-impact"
                      value={impact}
                      onChange={(e) => setImpact(e.target.value as Impact)}
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
                    >
                      {IMPACTS.map((i) => (
                        <option key={i} value={i}>
                          {impactLabel(t, i)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="feedback-title" className="mb-1 block text-xs font-semibold text-ink">
                    {t('titleLabel')}
                  </label>
                  <input
                    id="feedback-title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t('titlePlaceholder')}
                    maxLength={160}
                    required
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted"
                  />
                </div>

                <div>
                  <label htmlFor="feedback-body" className="mb-1 block text-xs font-semibold text-ink">
                    {t('bodyLabel')}
                  </label>
                  <textarea
                    id="feedback-body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder={t('bodyPlaceholder')}
                    rows={5}
                    maxLength={4000}
                    required
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted"
                  />
                </div>

                <div>
                  <label htmlFor="feedback-screenshot" className="mb-1 block text-xs font-semibold text-ink">
                    {t('screenshotLabel')}
                  </label>
                  <input
                    id="feedback-screenshot"
                    ref={fileInputRef}
                    type="file"
                    accept={ALLOWED_TYPES.join(',')}
                    onChange={onPickFile}
                    aria-describedby="feedback-screenshot-hint"
                    className="block w-full text-xs text-ink file:mr-3 file:rounded-md file:border-0 file:bg-surface-hover file:px-3 file:py-2 file:text-xs file:font-semibold file:text-ink"
                  />
                  <p id="feedback-screenshot-hint" className="mt-1 text-[11px] text-muted">
                    {t('screenshotHint')}
                  </p>
                  {screenshot && (
                    <p className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-2">
                      <Paperclip className="h-3 w-3" aria-hidden="true" />
                      <span>{screenshot.name}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setScreenshot(null);
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                        className="ml-1 underline"
                      >
                        {t('screenshotRemove')}
                      </button>
                    </p>
                  )}
                </div>

                <p className="rounded-lg bg-surface-hover p-3 text-[11px] leading-relaxed text-ink-2">
                  {t('privacyNote')}
                </p>

                {error && (
                  <p
                    role="alert"
                    data-testid="feedback-error"
                    className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-xs font-semibold text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100"
                  >
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{error}</span>
                  </p>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-ink transition hover:bg-surface-hover"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    data-testid="feedback-submit"
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                  >
                    {submitting ? t('submitting') : t('submit')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
