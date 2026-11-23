'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { AgencyFunnel, FunnelCell, FunnelStep, FunnelView } from '@/lib/agency/funnel';
import { SMALL_CELL_THRESHOLD, shownRange } from '@/lib/agency/small-cell';

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/** Order and grouping of the funnel cards (OKA-KANAL-ONERISI.md §4). */
const STEPS: FunnelStep[] = [
  'registered',
  'readiness',
  'savedSearch',
  'pipeline',
  'conceptNote',
  'submitted',
  'accepted',
  'rejected',
];

function CellValue({ cell }: { cell: FunnelCell }) {
  const t = useTranslations('agency.funnel');
  if (cell.state === 'count') {
    return <span className="font-heading text-3xl font-semibold text-ink tabular-nums">{cell.value}</span>;
  }
  if (cell.state === 'small') {
    return (
      <span className="font-heading text-3xl font-semibold text-ink-2" title={t('smallHint', { threshold: SMALL_CELL_THRESHOLD })}>
        <span aria-hidden="true">&lt;{SMALL_CELL_THRESHOLD}</span>
        <span className="sr-only">{t('smallSr', { threshold: SMALL_CELL_THRESHOLD })}</span>
      </span>
    );
  }
  return <span className="text-sm font-medium text-muted">{t('unmeasured')}</span>;
}

export default function FunnelPanel({
  locale,
  funnel,
}: {
  locale: string;
  funnel: AgencyFunnel;
}) {
  const t = useTranslations('agency.funnel');
  const tType = useTranslations('agency.orgType');
  const [group, setGroup] = useState<string>('ALL');
  const breakdownId = useId();
  const breakdownNoteId = useId();
  const groupId = useId();
  const path = locale === 'tr' ? `/${locale}/ajans` : `/${locale}/agency`;
  const { breakdown } = funnel;

  /** The groups this response carries: the totals, then the organisation types (the one breakdown offered). */
  const groups: { key: string; label: string; view: FunnelView }[] = [
    { key: 'ALL', label: breakdown.dimension === 'orgType' ? t('allTypes') : t('allOrganisations'), view: funnel.all },
  ];
  if (breakdown.dimension === 'orgType') {
    for (const [ot, view] of Object.entries(breakdown.byOrgType)) groups.push({ key: ot, label: tType(ot), view });
  }
  const shown = groups.find((g) => g.key === group) ?? groups[0]!;
  const selected = breakdown.dimension === 'orgType' ? 'tur' : '';

  return (
    <section aria-labelledby="agency-funnel-title" className="space-y-4">
      <div className="flex flex-col gap-4">
        <div>
          <h2 id="agency-funnel-title" className="font-heading text-xl font-semibold text-ink">
            {t('title')}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-2">{t('description')}</p>
        </div>

        <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
          {/*
            TASK-MULZATEX4G92H — one breakdown at a time. Since NG-339 (HUKUK-5 5e)
            the only breakdown is the organisation type; no province view.
            Counted and masked on the server, so a GET form: a select that
            navigated on change would reload on each arrow key. Works
            without JavaScript.
          */}
          <form method="get" action={path} className="flex flex-col gap-1" data-testid="agency-breakdown-form">
            <label htmlFor={breakdownId} className="text-xs font-semibold text-ink-2">
              {t('breakdownLabel')}
            </label>
            <div className="flex gap-2">
              <select
                id={breakdownId}
                name="kirilim"
                defaultValue={selected}
                aria-describedby={breakdownNoteId}
                data-testid="agency-breakdown-filter"
                className={`min-h-11 max-w-[16rem] rounded-lg border border-border bg-surface px-3 text-sm text-ink ${focusRing}`}
              >
                <option value="">{t('breakdownNone')}</option>
                <option value="tur">{t('breakdownOrgType')}</option>
              </select>
              <button
                type="submit"
                data-testid="agency-breakdown-apply"
                className={`min-h-11 rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-ink hover:bg-surface-hover ${focusRing}`}
              >
                {t('apply')}
              </button>
            </div>
            <span id={breakdownNoteId} className="max-w-sm text-xs text-ink-2">
              {t('breakdownNote')}
            </span>
          </form>

          {groups.length > 1 ? (
            <div className="flex flex-col gap-1">
              <label htmlFor={groupId} className="text-xs font-semibold text-ink-2">
                {t('groupLabel')}
              </label>
              <select
                id={groupId}
                value={shown.key}
                onChange={(e) => setGroup(e.target.value)}
                data-testid="agency-group-filter"
                className={`min-h-11 rounded-lg border border-border bg-surface px-3 text-sm text-ink ${focusRing}`}
              >
                {groups.map((g) => (
                  <option key={g.key} value={g.key}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      </div>

      <ol
        aria-label={shown.label}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        data-testid="agency-funnel"
      >
        {STEPS.map((step, i) => (
          <li
            key={step}
            data-testid={`funnel-${step}`}
            data-state={shown.view[step].state}
            className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-surface p-4"
          >
            <div>
              <span className="text-xs font-semibold text-muted">{t('stepNumber', { n: i + 1 })}</span>
              <h3 className="mt-0.5 text-sm font-semibold text-ink">{t(`steps.${step}.title`)}</h3>
            </div>
            <CellValue cell={shown.view[step]} />
            <p className="text-xs text-ink-2">{t(`steps.${step}.hint`)}</p>
          </li>
        ))}
      </ol>

      <p className="text-xs text-ink-2">{t('privacyNote', { threshold: SMALL_CELL_THRESHOLD, ...shownRange() })}</p>
    </section>
  );
}
