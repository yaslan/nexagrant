'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';

import type { PartnerSearchAnnouncementDto, PartnerSearchQuotaState } from '@/core/contracts/partner-search';

import { AnnouncementCard, actionClass, type AnnouncementLinks } from './AnnouncementCard';
import { PartnerSearchBoundary } from './PartnerSearchBoundary';
import {
  ANNOUNCEMENT_TYPES,
  CC_BY_4_URL,
  DEFAULT_FILTERS,
  ORG_TYPES,
  PORTAL_PARTNER_SEARCH_URL,
  announcementSearch,
  canLoadMore,
  quotaSpent,
  readListResponse,
  withinWeek,
  type AnnouncementFilters,
  type ListResult,
} from './model';

const fieldClass =
  'w-full min-h-9 rounded-lg border border-border bg-ground px-3 py-1.5 text-xs text-ink focus-visible:outline-2 focus-visible:outline-accent';
const labelClass = 'mb-1 block text-[11px] font-semibold uppercase tracking-wider text-ink-2';

type Status = 'loading' | 'ready' | 'error' | 'quota' | 'denied';

/**
 * The announcement list with its filters (FO-62): inside a call's Partner
 * Signal box (`topic` set) and on the M1 "Live partner announcements" tab.
 *
 * Filters apply on submit, not per keystroke: on a metered plan every request
 * is one of the month's queries.
 */
export function AnnouncementBrowser(props: { topic?: string; links: AnnouncementLinks; upgradeHref: string }) {
  return (
    <PartnerSearchBoundary>
      <Browser {...props} />
    </PartnerSearchBoundary>
  );
}

function Browser({
  topic,
  links,
  upgradeHref,
}: {
  topic?: string;
  links: AnnouncementLinks;
  upgradeHref: string;
}) {
  const t = useTranslations('PartnerSignal');
  const locale = useLocale();
  const ids = useId();

  const [draft, setDraft] = useState<AnnouncementFilters>(DEFAULT_FILTERS);
  const [applied, setApplied] = useState<AnnouncementFilters>(DEFAULT_FILTERS);
  const [rows, setRows] = useState<PartnerSearchAnnouncementDto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<Status>('loading');
  const [loadingMore, setLoadingMore] = useState(false);
  const [quota, setQuota] = useState<PartnerSearchQuotaState | undefined>(undefined);
  const abort = useRef<AbortController | null>(null);

  const fetchPage = useCallback(
    async (filters: AnnouncementFilters, nextPage: number): Promise<ListResult> => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      try {
        const res = await fetch(`/api/partner-search/announcements?${announcementSearch(filters, nextPage, topic)}`, {
          signal: controller.signal,
          headers: { accept: 'application/json' },
        });
        const body: unknown = await res.json().catch(() => null);
        return readListResponse(res.status, body);
      } catch (e) {
        if (controller.signal.aborted) throw e;
        return { kind: 'error' };
      }
    },
    [topic]
  );

  const apply = useCallback((result: ListResult, append: boolean) => {
    setLoadingMore(false);
    if (result.kind === 'ok') {
      const { meta, data } = result.page;
      setRows((prev) => (append ? [...prev, ...data] : data));
      setTotal(meta.total);
      setPage(meta.page);
      setQuota(meta.quota);
      setStatus('ready');
    } else if (result.kind === 'quota') {
      setQuota(result.quota);
      if (!append) setStatus('quota');
    } else if (result.kind === 'denied') {
      setStatus('denied');
    } else if (!append) {
      setStatus('error');
    }
  }, []);

  async function run(filters: AnnouncementFilters, nextPage: number) {
    const append = nextPage > 1;
    if (append) setLoadingMore(true);
    else setStatus('loading');
    try {
      apply(await fetchPage(filters, nextPage), append);
    } catch {
      // superseded by a newer request
    }
  }

  useEffect(() => {
    fetchPage(DEFAULT_FILTERS, 1).then(
      (result) => apply(result, false),
      () => undefined // superseded or unmounted
    );
    return () => abort.current?.abort();
  }, [fetchPage, apply]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setApplied(draft);
    void run(draft, 1);
  }

  function reset() {
    setDraft(DEFAULT_FILTERS);
    setApplied(DEFAULT_FILTERS);
    void run(DEFAULT_FILTERS, 1);
  }

  const now = new Date();
  const visible = applied.thisWeekOnly ? rows.filter((r) => withinWeek(r.publishedAt, now)) : rows;
  const more = status === 'ready' && !quotaSpent(quota) && canLoadMore(rows, total, applied.thisWeekOnly, now);
  // `readQuota` leaves an unreadable reset instant as '': no line rather than "Invalid Date".
  const resetsAt = quota?.resetsAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(quota.resetsAt))
    : '';
  const upsell = (
    <Link href={upgradeHref} className="font-bold text-accent underline focus-visible:outline-2 focus-visible:outline-accent">
      {t('list.upgradeCta')}
    </Link>
  );

  return (
    <div className="space-y-4" data-testid="ps-browser">
      <form
        onSubmit={submit}
        className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-ground/60 p-3 sm:grid-cols-2 lg:grid-cols-4"
        aria-label={t('list.filtersLabel')}
        data-testid="ps-filters"
      >
        <div>
          <label htmlFor={`${ids}-type`} className={labelClass}>
            {t('list.type')}
          </label>
          <select
            id={`${ids}-type`}
            className={fieldClass}
            value={draft.type}
            onChange={(e) => setDraft({ ...draft, type: e.target.value as AnnouncementFilters['type'] })}
            data-testid="ps-filter-type"
          >
            <option value="">{t('list.any')}</option>
            {ANNOUNCEMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`types.${type}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${ids}-org`} className={labelClass}>
            {t('list.orgType')}
          </label>
          <select
            id={`${ids}-org`}
            className={fieldClass}
            value={draft.orgType}
            onChange={(e) => setDraft({ ...draft, orgType: e.target.value as AnnouncementFilters['orgType'] })}
            data-testid="ps-filter-orgtype"
          >
            <option value="">{t('list.any')}</option>
            {ORG_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`orgTypes.${type}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${ids}-country`} className={labelClass}>
            {t('list.country')}
          </label>
          <input
            id={`${ids}-country`}
            className={`${fieldClass} uppercase placeholder:normal-case`}
            value={draft.trOnly ? 'TR' : draft.country}
            disabled={draft.trOnly}
            maxLength={2}
            placeholder={t('list.countryPlaceholder')}
            autoComplete="off"
            onChange={(e) => setDraft({ ...draft, country: e.target.value.replace(/[^A-Za-z]/g, '') })}
            data-testid="ps-filter-country"
          />
        </div>
        <div>
          <label htmlFor={`${ids}-q`} className={labelClass}>
            {t('list.search')}
          </label>
          <input
            id={`${ids}-q`}
            type="search"
            className={fieldClass}
            value={draft.q}
            maxLength={200}
            placeholder={t('list.searchPlaceholder')}
            onChange={(e) => setDraft({ ...draft, q: e.target.value })}
            data-testid="ps-filter-q"
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:col-span-2 lg:col-span-4">
          <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-xs text-ink">
            <input
              type="checkbox"
              className="h-4 w-4 accent-accent"
              checked={draft.trOnly}
              onChange={(e) => setDraft({ ...draft, trOnly: e.target.checked })}
              data-testid="ps-filter-tr"
            />
            {t('list.trOnly')}
          </label>
          <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-xs text-ink">
            <input
              type="checkbox"
              className="h-4 w-4 accent-accent"
              checked={draft.thisWeekOnly}
              onChange={(e) => setDraft({ ...draft, thisWeekOnly: e.target.checked })}
              data-testid="ps-filter-week"
            />
            {t('list.thisWeekOnly')}
          </label>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={reset} className={actionClass} data-testid="ps-filter-reset">
              {t('list.reset')}
            </button>
            <button
              type="submit"
              className="inline-flex min-h-9 items-center justify-center rounded-lg bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              disabled={status === 'loading'}
              data-testid="ps-filter-apply"
            >
              {t('list.apply')}
            </button>
          </div>
        </div>
      </form>

      {quota && (
        <p
          className={`text-xs ${quotaSpent(quota) ? 'rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900' : 'text-ink-2'}`}
          role={quotaSpent(quota) ? 'alert' : undefined}
          data-testid={quotaSpent(quota) ? 'ps-quota-exceeded' : 'ps-quota-usage'}
        >
          {quotaSpent(quota) ? (
            <>
              {t('list.quotaSpent', { used: quota.used, limit: quota.limit })} — {upsell}
              {resetsAt && <span className="mt-1 block text-[11px]">{t('list.quotaResets', { date: resetsAt })}</span>}
            </>
          ) : (
            t('list.quotaUsage', { used: quota.used, limit: quota.limit })
          )}
        </p>
      )}

      <div aria-live="polite" aria-busy={status === 'loading'}>
        {status === 'loading' && <p className="text-xs text-muted">{t('list.loading')}</p>}
        {status === 'error' && (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
            {t('list.error')}
          </p>
        )}
        {status === 'denied' && (
          <p className="rounded-xl border border-border bg-ground p-3 text-xs text-ink-2" data-testid="ps-denied">
            {t('list.denied')} {upsell}
          </p>
        )}
        {status === 'ready' && (
          <>
            <p className="mb-2 text-xs font-semibold text-ink" data-testid="ps-result-count">
              {applied.thisWeekOnly
                ? t('list.resultsThisWeek', { count: visible.length })
                : t('list.results', { count: total })}
            </p>
            {visible.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted" data-testid="ps-empty">
                {t('list.empty')}
              </p>
            ) : (
              <ul className="space-y-3">
                {visible.map((a) => (
                  <AnnouncementCard key={a.id} announcement={a} links={links} showTopic={!topic} />
                ))}
              </ul>
            )}
            {more && (
              <div className="mt-3 text-center">
                <button
                  type="button"
                  className={actionClass}
                  onClick={() => void run(applied, page + 1)}
                  disabled={loadingMore}
                  data-testid="ps-load-more"
                >
                  {loadingMore ? t('list.loading') : t('list.loadMore')}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <Attribution />
    </div>
  );
}

/** CC BY 4.0 attribution the EC legal notice requires wherever the data is shown. */
export function Attribution() {
  const t = useTranslations('PartnerSignal');
  return (
    <p className="text-[11px] leading-relaxed text-muted" data-testid="ps-attribution">
      {t.rich('attribution', {
        portal: (chunks) => (
          <a href={PORTAL_PARTNER_SEARCH_URL} target="_blank" rel="noopener noreferrer" className="underline">
            {chunks}
          </a>
        ),
        license: (chunks) => (
          <a href={CC_BY_4_URL} target="_blank" rel="noopener noreferrer license" className="underline">
            {chunks}
          </a>
        ),
      })}
    </p>
  );
}
