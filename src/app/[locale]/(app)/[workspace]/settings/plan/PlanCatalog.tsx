'use client';

import React, { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { formatMoney } from '@/lib/money';
import type { NgCurrency, NgInterval } from '@/lib/billing/nexagrant/features';
import type { NgFeatureView, NgPlanView } from '@/lib/billing/nexagrant/view';
import {
  defaultCurrency,
  defaultInterval,
  matrixRows,
  offeredDimensions,
  priceStateFor,
  type NgPriceState,
} from './plan-view-model';

/**
 * NG-11 — tier selection: plan cards and the feature matrix, all from
 * `getNgCatalogView()`. Currency and interval are a view switch only: they pick
 * which catalogue cell is shown, they never convert or compute an amount.
 * No purchase action in this phase — a sellable plan's button stays disabled.
 */
export function PlanCatalog({
  locale,
  plans,
  currentPlanId,
  titleId,
}: {
  locale: string;
  /** Already in catalogue order. */
  plans: NgPlanView[];
  currentPlanId: string | null;
  titleId: string;
}) {
  const t = useTranslations('ngPlan');
  const offered = useMemo(() => offeredDimensions(plans), [plans]);
  const [currency, setCurrency] = useState<NgCurrency | null>(() => defaultCurrency(locale, offered.currencies));
  const [interval, setInterval] = useState<NgInterval | null>(() => defaultInterval(offered.intervals));
  const rows = useMemo(() => matrixRows(plans), [plans]);

  const tierName = (tier: string) => (t.has(`tier.${tier}`) ? t(`tier.${tier}`) : tier);

  const limitText = (cell: NgFeatureView): string => {
    if (cell.limit === null) return t('plans.unlimited');
    const key = t.has(`limit.${cell.key}`) ? `limit.${cell.key}` : 'limit.default';
    return t(key, { count: cell.limit });
  };

  if (plans.length === 0) {
    return (
      <>
        <h2 id={titleId} className="text-xl font-bold font-heading text-ink">
          {t('plans.title')}
        </h2>
        <div data-testid="ng-plans-empty" role="status" className="rounded-2xl border border-border bg-surface p-5 text-sm text-muted">
          {t('plans.empty')}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h2 id={titleId} className="text-xl font-bold font-heading text-ink">
            {t('plans.title')}
          </h2>
          <p className="text-xs text-muted">{t('plans.body')}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {currency && offered.currencies.length > 1 && (
            <Segmented
              name="ng-currency"
              legend={t('plans.currencyLegend')}
              options={offered.currencies.map((c) => ({ value: c, label: t(`plans.currency.${c}`) }))}
              value={currency}
              onChange={(v) => setCurrency(v as NgCurrency)}
            />
          )}
          {interval && offered.intervals.length > 1 && (
            <Segmented
              name="ng-interval"
              legend={t('plans.intervalLegend')}
              options={offered.intervals.map((i) => ({ value: i, label: t(`plans.interval.${i}`) }))}
              value={interval}
              onChange={(v) => setInterval(v as NgInterval)}
            />
          )}
        </div>
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4" role="list">
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          const price: NgPriceState = currency && interval ? priceStateFor(plan, currency, interval) : { kind: 'soon' };
          const headingId = `ng-plan-${plan.id}-name`;
          return (
            <li
              key={plan.id}
              data-testid={`ng-plan-card-${plan.id}`}
              data-price-state={price.kind}
              className={`relative flex flex-col justify-between rounded-2xl border bg-surface p-5 shadow-xs ${
                isCurrent ? 'border-accent ring-2 ring-accent/20' : 'border-border'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 id={headingId} className="text-base font-bold text-ink">
                    {tierName(plan.tier)}
                  </h3>
                  {isCurrent && (
                    <span
                      data-testid="ng-plan-current-badge"
                      className="shrink-0 bg-accent text-white text-[10px] font-bold uppercase tracking-wider py-0.5 px-2 rounded-full"
                    >
                      {t('currentBadge')}
                    </span>
                  )}
                </div>
                <PriceBlock price={price} locale={locale} />
              </div>
              {price.kind !== 'free' && price.kind !== 'contact' && (
                <div className="pt-4 mt-4 border-t border-border">
                  <button
                    type="button"
                    disabled
                    data-testid={`ng-plan-buy-${plan.id}`}
                    className="w-full min-h-11 rounded-xl border border-border bg-ground px-4 text-sm font-bold text-muted cursor-not-allowed"
                  >
                    {t('plans.buySoon')}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div
        className="relative overflow-x-auto rounded-2xl border border-border bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        tabIndex={0}
        role="region"
        aria-label={t('plans.matrixScrollLabel')}
      >
        <table data-testid="ng-plan-matrix" className="w-full min-w-[640px] text-sm">
          <caption className="px-4 pt-4 pb-2 text-left text-base font-bold text-ink">{t('plans.matrixCaption')}</caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="px-4 py-3 text-left font-semibold text-muted">
                {t('plans.featureColumn')}
              </th>
              {plans.map((plan) => (
                <th
                  key={plan.id}
                  scope="col"
                  className={`px-4 py-3 text-left font-bold ${plan.id === currentPlanId ? 'text-accent-ink' : 'text-ink'}`}
                >
                  {tierName(plan.tier)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} data-feature={row.key} className="border-b border-border last:border-b-0">
                <th scope="row" className="px-4 py-3 text-left font-medium text-ink-2">
                  {t(`feature.${row.key}`)}
                </th>
                {row.cells.map((cell, i) => (
                  <td key={plans[i]?.id ?? i} className="px-4 py-3 text-ink">
                    {cell ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span aria-hidden="true" className="text-emerald-700 dark:text-emerald-400 font-bold">
                          ✓
                        </span>
                        <span className="sr-only">{t('plans.included')}: </span>
                        <span>{limitText(cell)}</span>
                      </span>
                    ) : (
                      <span>
                        <span aria-hidden="true" className="text-muted">
                          —
                        </span>
                        <span className="sr-only">{t('plans.notIncluded')}</span>
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function PriceBlock({ price, locale }: { price: NgPriceState; locale: string }) {
  const t = useTranslations('ngPlan.plans');
  if (price.kind === 'price') {
    return (
      <div>
        <span data-testid="ng-plan-price" className="text-2xl font-extrabold text-ink">
          {formatMoney(price.amountMinor, price.currency, locale === 'tr' ? 'tr-TR' : 'en-GB')}
        </span>{' '}
        <span className="text-xs text-muted">{t(`perInterval.${price.interval}`)}</span>
      </div>
    );
  }
  const [label, note] =
    price.kind === 'free'
      ? [t('free'), t('freeNote')]
      : price.kind === 'contact'
        ? [t('contact'), t('contactNote')]
        : [t('priceSoon'), t('priceSoonNote')];
  return (
    <div className="space-y-1">
      <div data-testid="ng-plan-price" className="text-lg font-bold text-ink">
        {label}
      </div>
      <p className="text-xs text-muted">{note}</p>
    </div>
  );
}

/**
 * A two-or-more option switch built on native radio inputs, so arrow keys, Tab and
 * screen readers behave as they do for any radio group.
 */
function Segmented({
  name,
  legend,
  options,
  value,
  onChange,
}: {
  name: string;
  legend: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-[11px] font-semibold text-muted mb-1">{legend}</legend>
      <div className="bg-ground p-1 rounded-full border border-border flex items-center">
        {options.map((o) => (
          <label key={o.value} className="relative">
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="peer sr-only"
            />
            <span className="block min-h-11 cursor-pointer select-none rounded-full px-4 py-2 text-xs font-bold text-muted transition peer-checked:bg-accent peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 hover:text-ink peer-checked:hover:text-white">
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
