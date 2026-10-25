'use client';

/**
 * FO-64 / PS-K6 — Partner Search ingestion console.
 *
 * Reads what the ingestor wrote (PartnerSearchIngestionRun, UnmatchedOrganization) and
 * drives it through ./actions: queue a full run, re-fetch one topic, flip the global
 * flag, link an unmatched organisation to a CORDIS PIC. Each action revalidates the
 * page, so the tables below re-render from the server after a write.
 */

import React, { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Network, Play, RefreshCw, Link2, Info, AlertTriangle, CheckCircle2, Power } from 'lucide-react';
import {
  refetchPartnerSearchTopic,
  resolveUnmatchedOrganization,
  runPartnerSearchNow,
  setPartnerSearchFlag,
} from './actions';

export interface RunRow {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  trigger: string;
  status: string;
  topicsScanned: number;
  created: number;
  updated: number;
  withdrawn: number;
  personAnnouncementCount: number;
  error: string | null;
}

export interface UnmatchedRow {
  id: string;
  name: string;
  country: string | null;
  pic: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedPic: string | null;
}

type Notice = { tone: 'ok' | 'bad' | 'info'; text: string } | null;

/** Weight and border as well as hue, so a status reads without colour (same scheme as the alert console). */
const STATUS_STYLE: Record<string, string> = {
  SUCCESS: 'border border-ok bg-ok/10 text-ok font-bold',
  PARTIAL: 'border border-amber bg-amber/10 text-amber font-bold',
  FAILED: 'border-2 border-bad bg-bad/10 text-bad font-extrabold',
  RUNNING: 'border border-border bg-surface-hover text-ink-2 font-semibold',
};

const NOTICE_STYLE = {
  ok: 'border-ok bg-ok/5 text-ink',
  bad: 'border-bad bg-bad/5 text-ink',
  info: 'border-border bg-ground text-ink',
} as const;

export default function PartnerSearchConsoleClient({
  locale,
  flagEnabled,
  runs,
  unmatched,
  resolved,
  unmatchedCount,
  topics,
  openAlerts,
  loadError,
}: {
  locale: string;
  flagEnabled: boolean;
  runs: RunRow[];
  unmatched: UnmatchedRow[];
  resolved: UnmatchedRow[];
  unmatchedCount: number;
  topics: string[];
  openAlerts: number;
  loadError: boolean;
}) {
  const t = useTranslations('adminPartnerSearch');
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<Notice>(null);
  const [confirmFlag, setConfirmFlag] = useState(false);
  const [topic, setTopic] = useState('');
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [picDrafts, setPicDrafts] = useState<Record<string, string>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const dateFormat = (iso: string) =>
    new Date(iso).toLocaleString(locale === 'tr' ? 'tr-TR' : 'en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

  const statusLabel = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return t('statusSUCCESS');
      case 'PARTIAL':
        return t('statusPARTIAL');
      case 'FAILED':
        return t('statusFAILED');
      default:
        return t('statusRUNNING');
    }
  };

  const triggerLabel = (trigger: string) => {
    switch (trigger) {
      case 'FULL':
        return t('triggerFULL');
      case 'INCREMENTAL':
        return t('triggerINCREMENTAL');
      default:
        return t('triggerMANUAL');
    }
  };

  const filteredUnmatched = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return unmatched;
    return unmatched.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        (u.country ?? '').toLowerCase().includes(q) ||
        (u.pic ?? '').includes(q)
    );
  }, [unmatched, filter]);

  const lastRun = runs[0] ?? null;

  const onRunNow = () => {
    setNotice(null);
    startTransition(async () => {
      const res = await runPartnerSearchNow();
      if (res.ok) {
        setNotice({ tone: 'ok', text: res.added ? t('runQueued') : t('runAlreadyQueued') });
      } else {
        setNotice({ tone: 'bad', text: res.error === 'flag_off' ? t('errorFlagOff') : t('errorEnqueue') });
      }
    });
  };

  const onRefetch = (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    startTransition(async () => {
      const res = await refetchPartnerSearchTopic(topic);
      if (res.ok) {
        setNotice({
          tone: res.status === 'FAILED' ? 'bad' : 'ok',
          text: t('refetchDone', {
            status: statusLabel(res.status),
            created: res.created,
            updated: res.updated,
            withdrawn: res.withdrawn,
          }),
        });
        return;
      }
      const text =
        res.error === 'flag_off'
          ? t('errorFlagOff')
          : res.error === 'topic_not_found'
            ? t('errorTopicNotFound')
            : res.error === 'validation_failed'
              ? t('errorTopicInvalid')
              : t('errorRun');
      setNotice({ tone: 'bad', text });
    });
  };

  const onFlag = (enabled: boolean) => {
    setNotice(null);
    setConfirmFlag(false);
    startTransition(async () => {
      const res = await setPartnerSearchFlag({ enabled });
      if (res.ok) {
        setNotice({ tone: 'ok', text: res.enabled ? t('flagNowOn') : t('flagNowOff') });
      } else {
        setNotice({
          tone: 'bad',
          text: res.error === 'owner_connection_required' ? t('errorOwnerConnection') : t('errorFlagSave'),
        });
      }
    });
  };

  const onResolve = (row: UnmatchedRow) => {
    const pic = picDrafts[row.id] ?? '';
    setNotice(null);
    setRowError((prev) => ({ ...prev, [row.id]: '' }));
    startTransition(async () => {
      const res = await resolveUnmatchedOrganization({ id: row.id, pic });
      if (res.ok) {
        setNotice({ tone: 'ok', text: t('resolveDone', { name: row.name, pic: res.pic, count: res.linkedAnnouncements }) });
        return;
      }
      const text =
        res.error === 'invalid_pic' || res.error === 'validation_failed'
          ? t('errorPicInvalid')
          : res.error === 'organization_not_found'
            ? t('errorOrgNotFound')
            : res.error === 'already_resolved'
              ? t('errorAlreadyResolved')
              : res.error === 'not_found'
                ? t('errorUnmatchedGone')
                : t('errorResolveSave');
      setRowError((prev) => ({ ...prev, [row.id]: text }));
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-xl border bg-surface p-4 shadow-2xs sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold text-ink sm:text-2xl">
            <Network className="h-5 w-5 shrink-0 text-ink-2" aria-hidden="true" />
            {t('title')}
          </h1>
          <p className="mt-1 text-xs text-muted sm:text-sm">{t('subtitle')}</p>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-xs sm:flex sm:flex-wrap sm:gap-4 lg:shrink-0">
          <div className="rounded-lg border border-border bg-ground px-3 py-2">
            <dt className="text-muted">{t('statFlag')}</dt>
            <dd className={`text-lg font-bold ${flagEnabled ? 'text-ok' : 'text-ink'}`} data-testid="ps-flag-state">
              {flagEnabled ? t('flagOn') : t('flagOff')}
            </dd>
          </div>
          <div className="rounded-lg border border-border bg-ground px-3 py-2">
            <dt className="text-muted">{t('statLastRun')}</dt>
            <dd className="text-lg font-bold text-ink">{lastRun ? statusLabel(lastRun.status) : t('none')}</dd>
          </div>
          <div className="rounded-lg border border-border bg-ground px-3 py-2">
            <dt className="text-muted">{t('statUnmatched')}</dt>
            <dd className="text-lg font-bold text-ink">{unmatchedCount}</dd>
          </div>
          <div className="rounded-lg border border-border bg-ground px-3 py-2">
            <dt className="text-muted">{t('statOpenAlerts')}</dt>
            <dd className="text-lg font-bold text-ink">
              <Link href={`/${locale}/admin/alerts`} className="underline underline-offset-2">
                {openAlerts}
              </Link>
            </dd>
          </div>
        </dl>
      </div>

      {loadError && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-bad bg-bad/5 p-3 text-sm text-ink">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-bad" aria-hidden="true" />
          {t('loadError')}
        </p>
      )}

      <div aria-live="polite" role="status">
        {notice && (
          <p className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${NOTICE_STYLE[notice.tone]}`} data-testid="ps-notice">
            {notice.tone === 'ok' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden="true" />
            ) : (
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span>{notice.text}</span>
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="ps-settings" className="space-y-4 rounded-xl border bg-surface p-4 sm:p-6">
          <h2 id="ps-settings" className="text-base font-bold text-ink">
            {t('settingsTitle')}
          </h2>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{t('flagLabel')}</p>
                <p className="font-mono text-xs text-muted">partner_search_ingestion_enabled</p>
              </div>
              {!confirmFlag && (
                <button
                  type="button"
                  onClick={() => (flagEnabled ? onFlag(false) : setConfirmFlag(true))}
                  disabled={pending}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-ground px-4 text-sm font-semibold text-ink hover:bg-surface-hover disabled:opacity-50"
                  data-testid="ps-flag-toggle"
                >
                  <Power className="h-4 w-4" aria-hidden="true" />
                  {flagEnabled ? t('flagTurnOff') : t('flagTurnOn')}
                </button>
              )}
            </div>
            <p className="text-xs text-muted">{t('flagHelp')}</p>
            {confirmFlag && (
              <div className="space-y-3 rounded-lg border border-amber bg-amber/5 p-3">
                <p className="text-sm text-ink">{t('flagConfirm')}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onFlag(true)}
                    disabled={pending}
                    className="min-h-11 rounded-lg bg-accent-strong px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                    data-testid="ps-flag-confirm"
                  >
                    {t('flagConfirmYes')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmFlag(false)}
                    className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold text-ink hover:bg-surface-hover"
                  >
                    {t('cancel')}
                  </button>
                </div>
              </div>
            )}
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-ink">{t('strategyLabel')}</legend>
            <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
              <input type="radio" name="ps-strategy" value="API" checked readOnly className="h-4 w-4" />
              {t('strategyApi')}
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm text-muted">
              <input type="radio" name="ps-strategy" value="HTML" disabled className="h-4 w-4" />
              {t('strategyHtml')} <span className="text-xs">({t('unavailable')})</span>
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm text-muted">
              <input type="radio" name="ps-strategy" value="HYBRID" disabled className="h-4 w-4" />
              {t('strategyHybrid')} <span className="text-xs">({t('unavailable')})</span>
            </label>
          </fieldset>
        </section>

        <section aria-labelledby="ps-run" className="space-y-4 rounded-xl border bg-surface p-4 sm:p-6">
          <h2 id="ps-run" className="text-base font-bold text-ink">
            {t('runTitle')}
          </h2>
          <div className="space-y-2">
            <button
              type="button"
              onClick={onRunNow}
              disabled={pending || !flagEnabled}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent-strong px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              data-testid="ps-run-now"
              aria-describedby="ps-run-help"
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              {t('runNow')}
            </button>
            <p id="ps-run-help" className="text-xs text-muted">
              {flagEnabled ? t('runNowHelp') : t('runDisabledFlagOff')}
            </p>
          </div>

          <form onSubmit={onRefetch} className="space-y-2">
            <label htmlFor="ps-topic" className="block text-sm font-semibold text-ink">
              {t('refetchLabel')}
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="ps-topic"
                list="ps-topic-options"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="HORIZON-CL4-2027-01-MAT-PROD-22"
                required
                autoComplete="off"
                className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 font-mono text-sm text-ink"
              />
              <datalist id="ps-topic-options">
                {topics.map((id) => (
                  <option key={id} value={id} />
                ))}
              </datalist>
              <button
                type="submit"
                disabled={pending || !flagEnabled || topic.trim() === ''}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-ground px-4 text-sm font-semibold text-ink hover:bg-surface-hover disabled:opacity-50"
                data-testid="ps-refetch"
              >
                <RefreshCw className={`h-4 w-4 ${pending ? 'animate-spin' : ''}`} aria-hidden="true" />
                {t('refetch')}
              </button>
            </div>
            <p className="text-xs text-muted">{t('refetchHelp', { count: topics.length })}</p>
          </form>
        </section>
      </div>

      <section aria-labelledby="ps-runs" className="space-y-3">
        <h2 id="ps-runs" className="text-base font-bold text-ink">
          {t('runsTitle')}
        </h2>
        {runs.length === 0 ? (
          <p className="rounded-xl border bg-surface p-8 text-center text-sm text-muted" data-testid="ps-runs-empty">
            {t('runsEmpty')}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-surface shadow-2xs">
            <table className="w-full min-w-[820px] border-collapse text-left text-sm" data-testid="ps-runs-table">
              <caption className="sr-only">{t('runsTitle')}</caption>
              <thead>
                <tr className="border-b bg-ground font-semibold text-ink-2">
                  <th scope="col" className="p-3">{t('colStarted')}</th>
                  <th scope="col" className="p-3">{t('colTrigger')}</th>
                  <th scope="col" className="p-3">{t('colStatus')}</th>
                  <th scope="col" className="p-3 text-right">{t('colTopics')}</th>
                  <th scope="col" className="p-3 text-right">{t('colChanges')}</th>
                  <th scope="col" className="p-3 text-right">{t('colPersons')}</th>
                  <th scope="col" className="p-3">{t('colError')}</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <React.Fragment key={run.id}>
                    <tr className="border-b last:border-0 hover:bg-ground" data-testid={`ps-run-${run.id}`}>
                      <td className="p-3 align-top text-xs text-ink-2">
                        {dateFormat(run.startedAt)}
                        <span className="block font-mono text-[10px] text-muted">{run.id}</span>
                      </td>
                      <td className="p-3 align-top text-xs text-ink-2">{triggerLabel(run.trigger)}</td>
                      <td className="p-3 align-top">
                        <span className={`inline-block rounded px-2 py-0.5 font-mono text-xs ${STATUS_STYLE[run.status] ?? STATUS_STYLE.RUNNING}`}>
                          {statusLabel(run.status)}
                        </span>
                      </td>
                      <td className="p-3 text-right align-top font-mono text-xs">{run.topicsScanned}</td>
                      <td className="p-3 text-right align-top font-mono text-xs">
                        {t('changes', { created: run.created, updated: run.updated, withdrawn: run.withdrawn })}
                      </td>
                      <td className="p-3 text-right align-top font-mono text-xs">{run.personAnnouncementCount}</td>
                      <td className="p-3 align-top text-xs">
                        {run.error ? (
                          <button
                            type="button"
                            onClick={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
                            aria-expanded={expandedRun === run.id}
                            aria-controls={`ps-run-error-${run.id}`}
                            className="min-h-11 font-semibold text-bad underline underline-offset-2"
                          >
                            {expandedRun === run.id ? t('hideError') : t('showError', { count: run.error.split('\n').length })}
                          </button>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    </tr>
                    {run.error && expandedRun === run.id && (
                      <tr id={`ps-run-error-${run.id}`} className="border-b bg-ground">
                        <td colSpan={7} className="p-3">
                          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-ink">{run.error}</pre>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="ps-unmatched" className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h2 id="ps-unmatched" className="text-base font-bold text-ink">
              {t('unmatchedTitle', { count: unmatchedCount })}
            </h2>
            <p className="text-xs text-muted">{t('unmatchedHelp')}</p>
          </div>
          <div>
            <label htmlFor="ps-unmatched-filter" className="sr-only">
              {t('filterLabel')}
            </label>
            <input
              id="ps-unmatched-filter"
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t('filterLabel')}
              className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink sm:w-64"
            />
          </div>
        </div>
        {filteredUnmatched.length === 0 ? (
          <p className="rounded-xl border bg-surface p-8 text-center text-sm text-muted" data-testid="ps-unmatched-empty">
            {t('unmatchedEmpty')}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-surface shadow-2xs">
            <table className="w-full min-w-[820px] border-collapse text-left text-sm" data-testid="ps-unmatched-table">
              <caption className="sr-only">{t('unmatchedTitle', { count: unmatchedCount })}</caption>
              <thead>
                <tr className="border-b bg-ground font-semibold text-ink-2">
                  <th scope="col" className="p-3">{t('colOrganisation')}</th>
                  <th scope="col" className="p-3">{t('colCountry')}</th>
                  <th scope="col" className="p-3">{t('colPortalPic')}</th>
                  <th scope="col" className="p-3">{t('colLastSeen')}</th>
                  <th scope="col" className="p-3">{t('colLink')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredUnmatched.map((row) => {
                  const inputId = `ps-pic-${row.id}`;
                  const errorId = `ps-pic-error-${row.id}`;
                  const error = rowError[row.id];
                  return (
                    <tr key={row.id} className="border-b last:border-0 hover:bg-ground" data-testid={`ps-unmatched-${row.id}`}>
                      <td className="p-3 align-top font-medium text-ink">{row.name}</td>
                      <td className="p-3 align-top font-mono text-xs text-ink-2">{row.country ?? '—'}</td>
                      <td className="p-3 align-top font-mono text-xs text-ink-2">{row.pic ?? '—'}</td>
                      <td className="p-3 align-top text-xs text-ink-2">{dateFormat(row.lastSeenAt)}</td>
                      <td className="p-3 align-top">
                        <form
                          className="flex flex-wrap items-start gap-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            onResolve(row);
                          }}
                        >
                          <label htmlFor={inputId} className="sr-only">
                            {t('picInputLabel', { name: row.name })}
                          </label>
                          <input
                            id={inputId}
                            inputMode="numeric"
                            value={picDrafts[row.id] ?? ''}
                            onChange={(e) => setPicDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))}
                            placeholder={t('picPlaceholder')}
                            aria-invalid={error ? true : undefined}
                            aria-describedby={error ? errorId : undefined}
                            className="min-h-11 w-36 rounded-lg border border-border bg-surface px-3 font-mono text-sm text-ink"
                          />
                          <button
                            type="submit"
                            disabled={pending || (picDrafts[row.id] ?? '').trim() === ''}
                            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-ground px-3 text-sm font-semibold text-ink hover:bg-surface-hover disabled:opacity-50"
                          >
                            <Link2 className="h-4 w-4" aria-hidden="true" />
                            {t('link')}
                          </button>
                          {error && (
                            <p id={errorId} className="w-full text-xs font-semibold text-bad">
                              {error}
                            </p>
                          )}
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {resolved.length > 0 && (
          <details className="rounded-xl border bg-surface p-4">
            <summary className="cursor-pointer text-sm font-semibold text-ink">
              {t('resolvedTitle', { count: resolved.length })}
            </summary>
            <ul className="mt-3 space-y-1 text-xs text-ink-2" data-testid="ps-resolved-list">
              {resolved.map((row) => (
                <li key={row.id} className="flex flex-wrap gap-x-2">
                  <span className="font-medium text-ink">{row.name}</span>
                  <span className="font-mono">{row.country ?? '—'}</span>
                  <span>→ PIC</span>
                  <span className="font-mono font-semibold">{row.resolvedPic}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}
