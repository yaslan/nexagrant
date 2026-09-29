'use client';

import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { analytics } from '@/lib/analytics';
import { PUBLIC_SECTOR_PROGRAMMES } from '@/lib/public-sector/catalog';
import {
  ANSWER_VALUES,
  READINESS_DIMENSIONS,
  questionsOf,
  type AnswerValue,
  type ReadinessAnswers,
} from '@/lib/readiness/questions';
import {
  READINESS_ORG_TYPES,
  scoreReadiness,
  type ReadinessOrgType,
  type ReadinessResult,
} from '@/lib/readiness/score';
import { TR_PROVINCES, type TrProvince } from '@/lib/readiness/provinces';
import {
  buildShareQuery,
  encodeReadinessCode,
  parseProvince,
  municipalCallsPath,
  readinessPath,
  readinessSignupPath,
} from '@/lib/readiness/share';
import LeadForm from './lead-form';

type Phase = { kind: 'intro' } | { kind: 'step'; index: number } | { kind: 'result' };

interface ReadinessCheckProps {
  locale: string;
  /** A decoded share link; opens straight on the result. */
  shared: {
    orgType: ReadinessOrgType;
    answers: ReadinessAnswers;
    province: TrProvince | null;
  } | null;
}

const STEP_COUNT = READINESS_DIMENSIONS.length;

const noSubscribe = () => () => {};

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
const primaryButton = `inline-flex min-h-11 items-center justify-center rounded-lg bg-accent-strong px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 ${focusRing}`;
const secondaryButton = `inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-surface px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-surface-hover ${focusRing}`;

export default function ReadinessCheck({ locale, shared }: ReadinessCheckProps) {
  const t = useTranslations('readiness');
  const [phase, setPhase] = useState<Phase>(shared ? { kind: 'result' } : { kind: 'intro' });
  const [orgType, setOrgType] = useState<ReadinessOrgType | null>(shared?.orgType ?? null);
  const [answers, setAnswers] = useState<ReadinessAnswers>(shared?.answers ?? {});
  const [province, setProvince] = useState<TrProvince | null>(shared?.province ?? null);
  const [error, setError] = useState<string | null>(null);
  const [isShared, setIsShared] = useState(shared !== null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // Move focus to the new heading on every screen change (not on first paint), so a
  // keyboard or screen-reader user lands at the top of the new step.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
    window.scrollTo({ top: 0 });
  }, [phase]);

  const result = useMemo<ReadinessResult | null>(
    () => (phase.kind === 'result' && orgType ? scoreReadiness(answers, orgType, { province }) : null),
    [phase.kind, orgType, answers, province],
  );

  function start() {
    if (!orgType) {
      setError(t('orgType_required'));
      document.getElementById('orgType-fieldset')?.focus();
      return;
    }
    setError(null);
    analytics.track('readiness_started', { orgType });
    setPhase({ kind: 'step', index: 0 });
  }

  function goNext(index: number) {
    const dimension = READINESS_DIMENSIONS[index];
    if (!dimension) return;
    const missing = questionsOf(dimension).find((q) => answers[q.id] === undefined);
    if (missing) {
      setError(t('unanswered'));
      document.getElementById(`q-${missing.id}`)?.focus();
      return;
    }
    setError(null);
    if (index + 1 < STEP_COUNT) {
      setPhase({ kind: 'step', index: index + 1 });
      return;
    }
    finish();
  }

  function finish() {
    if (!orgType) return;
    const query = buildShareQuery(orgType, answers, province);
    if (query) window.history.replaceState(null, '', `${readinessPath(locale)}?${query}`);
    const scored = scoreReadiness(answers, orgType, { province });
    // No PII: org type is a closed category, the rest are numbers.
    analytics.track('readiness_completed', {
      orgType,
      total: scored.total0to100,
      level: scored.level,
    });
    setIsShared(false);
    setPhase({ kind: 'result' });
  }

  function restart() {
    setAnswers({});
    setOrgType(null);
    setProvince(null);
    setError(null);
    setIsShared(false);
    window.history.replaceState(null, '', readinessPath(locale));
    setPhase({ kind: 'intro' });
  }

  if (phase.kind === 'result' && result && orgType) {
    return (
      <ResultView
        locale={locale}
        orgType={orgType}
        province={province}
        answers={answers}
        result={result}
        isShared={isShared}
        headingRef={headingRef}
        onRestart={restart}
      />
    );
  }

  if (phase.kind === 'step') {
    const dimension = READINESS_DIMENSIONS[phase.index];
    if (!dimension) return null;
    const isLast = phase.index === STEP_COUNT - 1;
    return (
      <section aria-labelledby="step-heading">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-2">
          {t('step_of', { current: phase.index + 1, total: STEP_COUNT })}
        </p>
        <div
          role="progressbar"
          aria-label={t('progress_label')}
          aria-valuemin={1}
          aria-valuemax={STEP_COUNT}
          aria-valuenow={phase.index + 1}
          aria-valuetext={t('step_of', {
            current: phase.index + 1,
            total: STEP_COUNT,
          })}
          className="mt-2 h-2 w-full overflow-hidden rounded-full bg-line"
        >
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${((phase.index + 1) / STEP_COUNT) * 100}%` }}
          />
        </div>

        <h1
          id="step-heading"
          ref={headingRef}
          tabIndex={-1}
          className="mt-6 font-heading text-2xl font-semibold text-ink outline-none sm:text-3xl"
        >
          {t(`dimensions.${dimension}`)}
        </h1>
        <p className="mt-1 text-sm text-ink-2">{t(`dimension_hint.${dimension}`)}</p>

        <form
          className="mt-6 space-y-6"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            goNext(phase.index);
          }}
        >
          {questionsOf(dimension).map((q, qi) => (
            <fieldset
              key={q.id}
              id={`q-${q.id}`}
              tabIndex={-1}
              className="rounded-xl border border-border bg-surface p-4 outline-none sm:p-5"
            >
              <legend className="float-left mb-3 w-full text-sm font-semibold text-ink sm:text-base">
                <span className="mr-1 text-muted">{phase.index * 3 + qi + 1}.</span>
                {t(`questions.${q.id}.label`)}
              </legend>
              <div className="clear-both grid gap-2">
                {ANSWER_VALUES.map((v) => {
                  const id = `q-${q.id}-${v}`;
                  const checked = answers[q.id] === v;
                  return (
                    <label
                      key={v}
                      htmlFor={id}
                      className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
                        checked
                          ? 'border-accent bg-accent-light text-ink'
                          : 'border-border text-ink hover:bg-surface-hover'
                      }`}
                    >
                      <input
                        id={id}
                        type="radio"
                        name={q.id}
                        value={v}
                        checked={checked}
                        onChange={() => {
                          setAnswers((prev) => ({
                            ...prev,
                            [q.id]: v as AnswerValue,
                          }));
                          setError(null);
                        }}
                        className="h-4 w-4 shrink-0 accent-[var(--accent-strong)]"
                      />
                      <span>{t(`questions.${q.id}.options.${v}`)}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}

          <p
            role="alert"
            className={`min-h-5 text-sm font-medium text-bad ${error ? 'rounded-lg border border-bad bg-surface px-3 py-2' : ''}`}
          >
            {error}
          </p>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <button
              type="button"
              className={secondaryButton}
              onClick={() => {
                setError(null);
                setPhase(phase.index === 0 ? { kind: 'intro' } : { kind: 'step', index: phase.index - 1 });
              }}
            >
              {t('back')}
            </button>
            <button type="submit" className={primaryButton}>
              {isLast ? t('finish') : t('next')}
            </button>
          </div>
        </form>
      </section>
    );
  }

  return (
    <section aria-labelledby="intro-heading">
      <span className="inline-block rounded-full border border-accent/30 bg-accent-light px-3 py-1 text-xs font-semibold text-accent-ink">
        {t('badge')}
      </span>
      <h1
        id="intro-heading"
        ref={headingRef}
        tabIndex={-1}
        className="mt-4 font-heading text-3xl font-semibold text-ink outline-none sm:text-4xl"
      >
        {t('title')}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-2 sm:text-base">{t('intro')}</p>

      <form
        className="mt-8"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          start();
        }}
      >
        <fieldset
          id="orgType-fieldset"
          tabIndex={-1}
          className="rounded-xl border border-border bg-surface p-4 outline-none sm:p-5"
        >
          <legend className="float-left mb-3 w-full text-sm font-semibold text-ink sm:text-base">
            {t('orgType_legend')}
          </legend>
          <div className="clear-both grid gap-2 sm:grid-cols-2">
            {READINESS_ORG_TYPES.map((o) => {
              const id = `org-${o}`;
              const checked = orgType === o;
              return (
                <label
                  key={o}
                  htmlFor={id}
                  className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
                    checked
                      ? 'border-accent bg-accent-light text-ink'
                      : 'border-border text-ink hover:bg-surface-hover'
                  }`}
                >
                  <input
                    id={id}
                    type="radio"
                    name="orgType"
                    value={o}
                    checked={checked}
                    onChange={() => {
                      setOrgType(o);
                      setError(null);
                    }}
                    className="h-4 w-4 shrink-0 accent-[var(--accent-strong)]"
                  />
                  <span>{t(`orgTypes.${o}`)}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-4 rounded-xl border border-border bg-surface p-4 sm:p-5">
          <label htmlFor="province" className="block text-sm font-semibold text-ink sm:text-base">
            {t('province_label')}
          </label>
          <p id="province-hint" className="mt-1 text-sm text-muted">
            {t('province_hint')}
          </p>
          <select
            id="province"
            aria-describedby="province-hint"
            value={province ?? ''}
            onChange={(e) => setProvince(parseProvince(e.target.value))}
            className={`mt-2 min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink sm:w-72 ${focusRing}`}
          >
            <option value="">{t('province_none')}</option>
            {TR_PROVINCES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <p
          role="alert"
          className={`mt-3 min-h-5 text-sm font-medium text-bad ${error ? 'rounded-lg border border-bad bg-surface px-3 py-2' : ''}`}
        >
          {error}
        </p>

        <button type="submit" className={`${primaryButton} mt-2 w-full sm:w-auto`}>
          {t('start')}
        </button>
      </form>
    </section>
  );
}

// ── Result ─────────────────────────────────────────────────────────────────────────

interface ResultViewProps {
  locale: string;
  orgType: ReadinessOrgType;
  province: TrProvince | null;
  answers: ReadinessAnswers;
  result: ReadinessResult;
  isShared: boolean;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onRestart: () => void;
}

function ResultView({
  locale,
  orgType,
  province,
  answers,
  result,
  isShared,
  headingRef,
  onRestart,
}: ResultViewProps) {
  const t = useTranslations('readiness');
  const [copied, setCopied] = useState(false);
  // The absolute link needs the browser's origin; the server render gets '' and the
  // field fills in on hydration.
  const origin = useSyncExternalStore(
    noSubscribe,
    () => window.location.origin,
    () => '',
  );
  const query = buildShareQuery(orgType, answers, province);
  const shareUrl = origin && query ? `${origin}${readinessPath(locale)}?${query}` : '';

  const programmes = result.recommended
    .map((key) => PUBLIC_SECTOR_PROGRAMMES.find((p) => p.key === key))
    .filter((p): p is (typeof PUBLIC_SECTOR_PROGRAMMES)[number] => p !== undefined);

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      // Clipboard blocked (http, permissions): the link stays selectable in the field.
      (document.getElementById('share-url') as HTMLInputElement | null)?.select();
    }
  }

  const levelColour =
    result.level === 'hazir' ? 'var(--ok)' : result.level === 'gelisen' ? 'var(--amber)' : 'var(--bad)';
  const circumference = 2 * Math.PI * 52;

  return (
    <article aria-labelledby="result-heading" className="space-y-8">
      <header>
        {isShared && (
          <p className="mb-3 inline-block rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-muted">
            {t('shared_notice')}
          </p>
        )}
        <h1
          id="result-heading"
          ref={headingRef}
          tabIndex={-1}
          className="font-heading text-3xl font-semibold text-ink outline-none sm:text-4xl"
        >
          {t('result_title')}
        </h1>
        <p className="mt-1 text-sm text-ink-2">
          {t('result_orgType', { orgType: t(`orgTypes.${orgType}`) })}
          {province && ` · ${province}`}
        </p>
      </header>

      <section className="flex flex-col items-center gap-6 rounded-xl border border-border bg-surface p-5 sm:flex-row sm:items-center">
        <div className="relative h-36 w-36 shrink-0">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true">
            <circle cx="60" cy="60" r="52" fill="none" stroke="var(--line)" strokeWidth="12" />
            <circle
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke={levelColour}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - result.total0to100 / 100)}
            />
          </svg>
          <p className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="sr-only">{t('score_out_of', { score: result.total0to100 })}</span>
            <span className="text-3xl font-bold text-ink" aria-hidden="true">
              {result.total0to100}
            </span>
          </p>
        </div>
        <div className="text-center sm:text-left">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t('score_label')}</p>
          <p className="mt-1 text-2xl font-bold text-ink">{t(`levels.${result.level}`)}</p>
          <p className="mt-2 text-sm leading-relaxed text-ink">{t(`level_text.${result.level}`)}</p>
          <p className="mt-2 text-xs text-muted">{t('internal_note')}</p>
        </div>
      </section>

      <section aria-labelledby="dims-heading">
        <h2 id="dims-heading" className="font-heading text-xl font-semibold text-ink">
          {t('dimensions_title')}
        </h2>
        <ul className="mt-3 space-y-3">
          {READINESS_DIMENSIONS.map((d) => (
            <li key={d}>
              <div className="flex justify-between text-sm">
                <span className="font-medium text-ink">{t(`dimensions.${d}`)}</span>
                <span className="font-semibold text-ink">{result.byDimension[d]}</span>
              </div>
              <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-line" aria-hidden="true">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${result.byDimension[d]}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="rec-heading">
        <h2 id="rec-heading" className="font-heading text-xl font-semibold text-ink">
          {t('recommended_title')}
        </h2>
        {programmes.length === 0 ? (
          <p className="mt-3 text-sm text-ink-2">{t('recommended_empty')}</p>
        ) : (
          <ol className="mt-3 grid gap-3">
            {programmes.map((p, i) => (
              <li key={p.key} className="rounded-xl border border-border bg-surface p-4">
                <h3 className="text-base font-semibold text-ink">
                  <span className="mr-1 text-muted">{i + 1}.</span>
                  {locale === 'tr' ? p.name.tr : p.name.en}
                </h3>
                {locale === 'tr' && <p className="mt-1 text-sm leading-relaxed text-ink">{p.plainTr}</p>}
                <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                  <span>{t('difficulty', { level: p.difficulty })}</span>
                  <span>
                    {p.cofinancingPct === null
                      ? t('cofinancing_unknown')
                      : t('cofinancing_pct', { pct: p.cofinancingPct })}
                  </span>
                  {p.turkeyEligibility !== 'eligible' && <span>{t(`turkey.${p.turkeyEligibility}`)}</span>}
                </p>
                {p.officialUrl && (
                  <a
                    href={p.officialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`mt-2 inline-block text-sm font-semibold text-accent-ink underline underline-offset-2 ${focusRing}`}
                  >
                    {t('official_page')}
                  </a>
                )}
              </li>
            ))}
          </ol>
        )}
        <Link
          href={municipalCallsPath(locale)}
          className={`mt-3 inline-block text-sm font-semibold text-accent-ink underline underline-offset-2 print:hidden ${focusRing}`}
        >
          {t('see_calls')}
        </Link>
      </section>

      <section aria-labelledby="gaps-heading">
        <h2 id="gaps-heading" className="font-heading text-xl font-semibold text-ink">
          {t('gaps_title')}
        </h2>
        {result.gaps.length === 0 ? (
          <p className="mt-3 text-sm text-ink-2">{t('gaps_empty')}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {result.gaps.map((g) => (
              <li key={g.questionId} className="rounded-xl border border-border bg-surface p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs font-semibold text-ink ${
                      g.severity === 'critical' ? 'border-bad bg-bad/10' : 'border-amber bg-amber/10'
                    }`}
                  >
                    {g.severity === 'critical' ? t('gap_critical') : t('gap_improve')}
                  </span>
                  <span className="text-xs text-muted">{t(`dimensions.${g.dimension}`)}</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-ink">{t(`gaps.${g.questionId}`)}</p>
                {g.guideUrl && (
                  <a
                    href={g.guideUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`mt-1 inline-block text-sm font-semibold text-accent-ink underline underline-offset-2 ${focusRing}`}
                  >
                    {t('gap_guide')}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="cta-heading"
        className="rounded-xl border border-accent/40 bg-accent-light p-5 print:hidden"
      >
        <h2 id="cta-heading" className="font-heading text-xl font-semibold text-ink">
          {t('cta_title')}
        </h2>
        <p className="mt-1 text-sm text-ink">{t('cta_text')}</p>
        <Link
          // B6 (TASK-MULRR8P7HIII4): the result rides along in the URL only. It is
          // stored on the new account only if the person ticks the box on the form.
          href={readinessSignupPath(locale, province, encodeReadinessCode(orgType, answers))}
          className={`${primaryButton} mt-4`}
          onClick={() =>
            analytics.track('readiness_signup_clicked', {
              orgType,
              level: result.level,
            })
          }
        >
          {t('cta_signup')}
        </Link>
      </section>

      <LeadForm
        locale={locale}
        orgType={orgType}
        level={result.level}
        province={province}
        readinessCode={encodeReadinessCode(orgType, answers)}
      />

      <section aria-labelledby="share-heading" className="print:hidden">
        <h2 id="share-heading" className="font-heading text-xl font-semibold text-ink">
          {t('share_title')}
        </h2>
        <p className="mt-1 text-sm text-ink-2">{t('share_hint')}</p>
        <label htmlFor="share-url" className="mt-3 block text-sm font-medium text-ink">
          {t('share_link_label')}
        </label>
        <div className="mt-1 flex flex-col gap-2 sm:flex-row">
          <input
            id="share-url"
            type="url"
            readOnly
            value={shareUrl}
            onFocus={(e) => e.currentTarget.select()}
            className={`min-h-11 w-full min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-sm text-ink ${focusRing}`}
          />
          <button type="button" className={secondaryButton} onClick={copy}>
            {t('copy_link')}
          </button>
        </div>
        <p role="status" className="mt-1 min-h-5 text-sm text-ink">
          {copied ? t('copied') : ''}
        </p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <button type="button" className={secondaryButton} onClick={() => window.print()}>
            {t('print')}
          </button>
          <button type="button" className={secondaryButton} onClick={onRestart}>
            {t('restart')}
          </button>
        </div>
      </section>
    </article>
  );
}
