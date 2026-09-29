'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { AgencyFunnel, FunnelCell, FunnelStep } from '@/lib/agency/funnel';
import { TR_PROVINCES } from '@/lib/readiness/provinces';

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
      <span className="font-heading text-3xl font-semibold text-ink-2" title={t('smallHint')}>
        <span aria-hidden="true">&lt;5</span>
        <span className="sr-only">{t('smallSr')}</span>
      </span>
    );
  }
  return <span className="text-sm font-medium text-muted">{t('unmeasured')}</span>;
}

export default function FunnelPanel({
  locale,
  funnel,
  windows,
}: {
  locale: string;
  funnel: AgencyFunnel;
  windows: number[];
}) {
  const t = useTranslations('agency.funnel');
  const tType = useTranslations('agency.orgType');
  const [orgType, setOrgType] = useState<string>('ALL');
  const typeId = useId();
  const provinceId = useId();
  const provinceNoteId = useId();
  const provinceQuery = funnel.province ? `&il=${encodeURIComponent(funnel.province)}` : '';
  const orgTypes = Object.keys(funnel.byOrgType);
  const view = orgType === 'ALL' ? funnel.all : funnel.byOrgType[orgType as keyof typeof funnel.byOrgType];
  const path = locale === 'tr' ? `/${locale}/ajans` : `/${locale}/agency`;

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
          <div className="flex flex-col gap-1">
            <label htmlFor={typeId} className="text-xs font-semibold text-ink-2">
              {t('orgTypeLabel')}
            </label>
            <select
              id={typeId}
              value={orgType}
              onChange={(e) => setOrgType(e.target.value)}
              data-testid="agency-orgtype-filter"
              className={`min-h-11 rounded-lg border border-border bg-surface px-3 text-sm text-ink ${focusRing}`}
            >
              <option value="ALL">{t('allTypes')}</option>
              {orgTypes.map((ot) => (
                <option key={ot} value={ot}>
                  {tType(ot)}
                </option>
              ))}
            </select>
          </div>

          {/*
            TASK-MULV3JXS1AW5X — a GET form, not an onChange redirect: the
            province is counted on the server (the masking needs every
            province's numbers), and a select that navigates on change would
            reload the page on each arrow key. Works without JavaScript.
          */}
          <form method="get" action={path} className="flex flex-col gap-1" data-testid="agency-province-form">
            <input type="hidden" name="gun" value={funnel.windowDays} />
            <label htmlFor={provinceId} className="text-xs font-semibold text-ink-2">
              {t('provinceLabel')}
            </label>
            <div className="flex gap-2">
              <select
                id={provinceId}
                name="il"
                defaultValue={funnel.province ?? ''}
                aria-describedby={provinceNoteId}
                data-testid="agency-province-filter"
                className={`min-h-11 rounded-lg border border-border bg-surface px-3 text-sm text-ink ${focusRing}`}
              >
                <option value="">{t('allProvinces')}</option>
                {TR_PROVINCES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                data-testid="agency-province-apply"
                className={`min-h-11 rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-ink hover:bg-surface-hover ${focusRing}`}
              >
                {t('provinceApply')}
              </button>
            </div>
            <span id={provinceNoteId} className="max-w-xs text-xs text-ink-2">
              {t('provinceNote')}
            </span>
          </form>

          <nav aria-label={t('windowLabel')} className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-ink-2" aria-hidden="true">
              {t('windowLabel')}
            </span>
            <div className="flex rounded-lg border border-border bg-surface p-0.5">
              {windows.map((w) => {
                const active = w === funnel.windowDays;
                return (
                  <Link
                    key={w}
                    href={`${path}?gun=${w}${provinceQuery}`}
                    aria-current={active ? 'page' : undefined}
                    scroll={false}
                    className={`inline-flex min-h-10 min-w-20 items-center justify-center rounded-md px-3 text-sm font-semibold transition ${focusRing} ${
                      active ? 'bg-accent-strong text-white' : 'text-ink hover:bg-surface-hover'
                    }`}
                  >
                    {t('windowDays', { days: w })}
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
      </div>

      <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="agency-funnel">
        {STEPS.map((step, i) => (
          <li
            key={step}
            data-testid={`funnel-${step}`}
            data-state={view[step].state}
            className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-surface p-4"
          >
            <div>
              <span className="text-xs font-semibold text-muted">{t('stepNumber', { n: i + 1 })}</span>
              <h3 className="mt-0.5 text-sm font-semibold text-ink">{t(`steps.${step}.title`)}</h3>
            </div>
            <CellValue cell={view[step]} />
            <p className="text-xs text-ink-2">{t(`steps.${step}.hint`)}</p>
          </li>
        ))}
      </ol>

      <p className="text-xs text-ink-2">{t('privacyNote')}</p>
    </section>
  );
}
