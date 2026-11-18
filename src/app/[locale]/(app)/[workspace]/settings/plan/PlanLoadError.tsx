import React from 'react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { NgLoadError } from './plan-view-model';

/**
 * NG-11 — the state shown when a part of the plan screen could not be loaded.
 * Says what happened in the user's words; the raw error stays in the server log.
 */
export async function PlanLoadError({
  kind,
  loginHref,
  headingLevel,
  testId,
}: {
  kind: NgLoadError;
  loginHref: string;
  headingLevel: 1 | 3;
  testId: string;
}) {
  const t = await getTranslations('ngPlan.error');
  const Heading = headingLevel === 1 ? 'h1' : 'h3';
  const tone =
    kind === 'session'
      ? 'border-border bg-surface text-ink-2'
      : 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100';

  return (
    <div data-testid={testId} data-error={kind} role="status" className={`rounded-2xl border p-5 space-y-2 ${tone}`}>
      <Heading className={headingLevel === 1 ? 'text-xl font-bold font-heading' : 'text-base font-bold'}>
        {t(`${kind}Title`)}
      </Heading>
      <p className="text-sm">{t(`${kind}Body`)}</p>
      {kind === 'session' && (
        <Link
          href={loginHref}
          className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm font-bold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          {t('sessionCta')}
        </Link>
      )}
    </div>
  );
}
