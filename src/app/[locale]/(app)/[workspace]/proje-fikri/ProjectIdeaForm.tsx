'use client';

import React, { useId, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  PROJECT_IDEA_LIMITS,
  TARGET_PROGRAMS,
  TRL_MAX,
  TRL_MIN,
  parseKeywords,
  validateProjectIdea,
  type ProjectIdeaErrorCode,
  type ProjectIdeaField,
} from '@/lib/project-ideas/validate';
import { saveProjectIdea } from './actions';

const FIELD_ORDER: ProjectIdeaField[] = [
  'title',
  'summary',
  'keywords',
  'trl',
  'targetPrograms',
];

/**
 * Project idea entry (NG-14). A valid submit goes to `saveProjectIdea` (NG-38 /
 * BE-05 `createProjectIdea`); the saved row then appears in the list the page renders.
 * The form has no "kurum" field: NG-38's table has no column for it (K-579963).
 */
export default function ProjectIdeaForm() {
  const t = useTranslations('projectIdea');
  const router = useRouter();
  const uid = useId();
  const errorSummaryRef = useRef<HTMLDivElement>(null);

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [keywordsRaw, setKeywordsRaw] = useState('');
  const [trl, setTrl] = useState<string>('');
  const [programs, setPrograms] = useState<string[]>([]);

  const [errors, setErrors] = useState<Partial<Record<ProjectIdeaField, ProjectIdeaErrorCode>>>({});
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'failed'>('idle');
  const [savedTitle, setSavedTitle] = useState('');
  const [saving, startSaving] = useTransition();

  const errorText: Record<ProjectIdeaErrorCode, string> = {
    required: t('errorRequired'),
    tooLong: t('errorTooLong'),
    trlRequired: t('errorTrlRequired'),
    trlNotInteger: t('errorTrlRange'),
    trlOutOfRange: t('errorTrlRange'),
    keywordsTooMany: t('errorKeywordsTooMany'),
    keywordTooLong: t('errorKeywordTooLong'),
    programRequired: t('errorProgramRequired'),
    programUnknown: t('errorProgramUnknown'),
  };

  const fieldId = (f: ProjectIdeaField | `${ProjectIdeaField}-hint`) => `${uid}-${f}`;
  const errorId = (f: ProjectIdeaField) => `${uid}-${f}-error`;

  const toggleProgram = (p: string) => {
    setPrograms((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trlNumber = trl === '' ? null : Number(trl);
    const result = validateProjectIdea({
      title,
      summary,
      keywords: parseKeywords(keywordsRaw),
      trl: trlNumber,
      targetPrograms: programs,
    });
    setErrors(result.errors);
    setSaveState('idle');
    if (!result.ok) {
      // Move focus to the summary so a keyboard or screen-reader user hears the errors.
      requestAnimationFrame(() => errorSummaryRef.current?.focus());
      return;
    }
    const payload = {
      title: title.trim(),
      summary: summary.trim() || null,
      keywords: parseKeywords(keywordsRaw),
      trl: trlNumber as number,
      targetPrograms: programs,
    };
    startSaving(async () => {
      const res = await saveProjectIdea(payload);
      if (!res.ok) {
        setSaveState('failed');
        return;
      }
      setSavedTitle(res.idea.title);
      setSaveState('saved');
      setTitle('');
      setSummary('');
      setKeywordsRaw('');
      setTrl('');
      setPrograms([]);
      router.refresh();
    });
  };

  const firstErrorFields = FIELD_ORDER.filter((f) => errors[f]);
  const hasErrors = firstErrorFields.length > 0;

  const inputClass =
    'w-full bg-ground border border-border p-2.5 rounded-lg text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent';
  const labelClass = 'block text-xs font-semibold text-ink mb-1';
  const errorClass = 'mt-1 text-xs text-danger';

  return (
    <form
      id="proje-fikri-form"
      onSubmit={handleSubmit}
      noValidate
      aria-labelledby={`${uid}-heading`}
      className="space-y-5"
    >
      <h2 id={`${uid}-heading`} className="text-lg font-semibold text-ink">
        {t('formHeading')}
      </h2>

      {hasErrors && (
        <div
          ref={errorSummaryRef}
          tabIndex={-1}
          role="alert"
          aria-labelledby={`${uid}-summary-title`}
          className="rounded-lg border border-danger p-3 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <p id={`${uid}-summary-title`} className="font-semibold">
            {t('errorSummaryTitle')}
          </p>
          <ul className="list-disc pl-5 mt-1">
            {firstErrorFields.map((f) => (
              <li key={f}>
                <a href={`#${fieldId(f)}`} className="underline">
                  {t(`field_${f}`)}: {errorText[errors[f] as ProjectIdeaErrorCode]}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <label htmlFor={fieldId('title')} className={labelClass}>
          {t('fieldTitle')}
        </label>
        <input
          id={fieldId('title')}
          name="title"
          type="text"
          value={title}
          maxLength={PROJECT_IDEA_LIMITS.title + 50}
          onChange={(e) => setTitle(e.target.value)}
          aria-invalid={!!errors.title}
          aria-describedby={errors.title ? errorId('title') : undefined}
          className={inputClass}
        />
        {errors.title && (
          <p id={errorId('title')} className={errorClass}>
            {errorText[errors.title]}
          </p>
        )}
      </div>

      <div>
        <label htmlFor={fieldId('summary')} className={labelClass}>
          {t('fieldSummary')}
        </label>
        <textarea
          id={fieldId('summary')}
          name="summary"
          rows={4}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          aria-invalid={!!errors.summary}
          aria-describedby={`${fieldId('summary-hint')}${errors.summary ? ` ${errorId('summary')}` : ''}`}
          className={inputClass}
        />
        <p id={fieldId('summary-hint')} className="mt-1 text-[11px] text-muted">
          {t('hintCount', { count: summary.length, max: PROJECT_IDEA_LIMITS.summary })}
        </p>
        {errors.summary && (
          <p id={errorId('summary')} className={errorClass}>
            {errorText[errors.summary]}
          </p>
        )}
      </div>

      <div>
        <label htmlFor={fieldId('keywords')} className={labelClass}>
          {t('fieldKeywords')}
        </label>
        <input
          id={fieldId('keywords')}
          name="keywords"
          type="text"
          value={keywordsRaw}
          onChange={(e) => setKeywordsRaw(e.target.value)}
          aria-invalid={!!errors.keywords}
          aria-describedby={`${fieldId('keywords-hint')}${errors.keywords ? ` ${errorId('keywords')}` : ''}`}
          className={inputClass}
          placeholder={t('keywordsPlaceholder')}
        />
        <p id={fieldId('keywords-hint')} className="mt-1 text-[11px] text-muted">
          {t('keywordsHint', { max: PROJECT_IDEA_LIMITS.keywords })}
        </p>
        {errors.keywords && (
          <p id={errorId('keywords')} className={errorClass}>
            {errorText[errors.keywords]}
          </p>
        )}
      </div>

      <div>
        <label htmlFor={fieldId('trl')} className={labelClass}>
          {t('fieldTrl')}
        </label>
        <select
          id={fieldId('trl')}
          name="trl"
          value={trl}
          onChange={(e) => setTrl(e.target.value)}
          aria-invalid={!!errors.trl}
          aria-describedby={`${fieldId('trl-hint')}${errors.trl ? ` ${errorId('trl')}` : ''}`}
          className={inputClass}
        >
          <option value="">{t('trlPlaceholder')}</option>
          {Array.from({ length: TRL_MAX - TRL_MIN + 1 }, (_, i) => TRL_MIN + i).map((n) => (
            <option key={n} value={n}>
              {t('trlOption', { n })}
            </option>
          ))}
        </select>
        <p id={fieldId('trl-hint')} className="mt-1 text-[11px] text-muted">
          {t('trlHint')}
        </p>
        {errors.trl && (
          <p id={errorId('trl')} className={errorClass}>
            {errorText[errors.trl]}
          </p>
        )}
      </div>

      <fieldset
        aria-describedby={errors.targetPrograms ? errorId('targetPrograms') : undefined}
        aria-invalid={!!errors.targetPrograms}
      >
        <legend className={labelClass}>{t('fieldTargetPrograms')}</legend>
        <div className="flex flex-wrap gap-2" id={fieldId('targetPrograms')}>
          {TARGET_PROGRAMS.map((p) => {
            const checked = programs.includes(p);
            return (
              <label
                key={p}
                className={`inline-flex items-center gap-2 border rounded-lg px-3 py-2 text-xs cursor-pointer ${
                  checked ? 'border-accent text-ink' : 'border-border text-ink-2'
                }`}
              >
                <input
                  type="checkbox"
                  name="targetPrograms"
                  value={p}
                  checked={checked}
                  onChange={() => toggleProgram(p)}
                  className="accent-accent"
                />
                {t(`program_${p}`)}
              </label>
            );
          })}
        </div>
        {errors.targetPrograms && (
          <p id={errorId('targetPrograms')} className={errorClass}>
            {errorText[errors.targetPrograms]}
          </p>
        )}
      </fieldset>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          aria-disabled={saving}
          className="px-5 py-2 bg-accent text-white rounded-lg text-xs font-semibold hover:opacity-90 transition disabled:opacity-60"
        >
          {saving ? t('saving') : t('submit')}
        </button>
        {saveState === 'saved' && (
          <p role="status" className="text-xs text-ink-2">
            {t('savedMessage', { title: savedTitle })}
          </p>
        )}
        {saveState === 'failed' && (
          <p role="alert" className="text-xs text-danger">
            {t('saveFailed')}
          </p>
        )}
      </div>
    </form>
  );
}
