'use client';

import React, { useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import type { NgTrialView } from '@/lib/billing/nexagrant/view';

/** No-op subscribe: "am I in the browser" never changes after mount (as in local-deadline.tsx). */
const noopSubscribe = () => () => {};

/**
 * NG-11 — the trial, in its three contract states (`none`, `running`, `ended`).
 *
 * The day count is the server's `daysLeft` (rounded up, never 0 while running) and the
 * dates are its ISO strings; nothing is computed here. Dates are printed on the
 * viewer's own clock, which only the browser knows, so they appear after hydration
 * (the `LocalDeadline` pattern) — the server would otherwise print a guessed zone.
 */
export function TrialPanel({
  locale,
  trial,
  endPlanName,
}: {
  locale: string;
  trial: NgTrialView;
  /** running: the plan the trial drops to; ended: the plan the account is on now. */
  endPlanName: string | null;
}) {
  const t = useTranslations('ngPlan.trial');
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const dateLocale = locale === 'tr' ? 'tr-TR' : 'en-GB';
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(dateLocale, { dateStyle: 'long', timeStyle: 'short' });
  const tz = isClient ? Intl.DateTimeFormat().resolvedOptions().timeZone : null;

  if (trial.kind === 'none') {
    return (
      <div
        data-testid="ng-trial"
        data-trial-kind="none"
        className="rounded-2xl border border-border bg-surface p-5 text-sm text-ink-2"
      >
        {t('noneBody')}
      </div>
    );
  }

  const running = trial.kind === 'running';
  // `endedAt` is when the server settled the expiry (often the first read after it),
  // not when the trial ran out — the user is shown `endsAt` in both states.
  const dateIso = trial.endsAt;

  return (
    <div
      data-testid="ng-trial"
      data-trial-kind={trial.kind}
      className={`rounded-2xl border p-5 space-y-3 ${
        running ? 'border-accent/40 bg-accent/5' : 'border-border bg-surface'
      }`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
            running
              ? 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-100 dark:border-emerald-800'
              : 'bg-surface-hover text-ink-2 border-border'
          }`}
        >
          {running ? t('runningBadge') : t('endedBadge')}
        </span>
        {running && (
          <span data-testid="ng-trial-days-left" className="text-2xl font-extrabold text-ink">
            {t('daysLeft', { days: trial.daysLeft })}
          </span>
        )}
      </div>

      <dl className="text-sm text-ink-2 flex flex-wrap gap-x-2">
        <dt className="text-muted">{running ? t('endsAt') : t('endedAt')}:</dt>
        <dd data-testid="ng-trial-date" className="font-medium text-ink">
          {isClient ? <time dateTime={dateIso}>{fmt(dateIso)}</time> : null}
        </dd>
      </dl>

      {endPlanName && (
        <p data-testid="ng-trial-end-plan" className="text-sm text-ink-2">
          {running ? t('runningEndPlan', { plan: endPlanName }) : t('endedPlan', { plan: endPlanName })}
        </p>
      )}

      {tz && <p className="text-xs text-muted">{t('localTimeNote', { tz })}</p>}
    </div>
  );
}
