'use client';

/**
 * TASK-MTQUN8VV6DK8C — platform-admin alert console.
 *
 * The screen that replaced the third-party error tracker. Everything an
 * operator needs to see about a failure now lives in `SystemAlert`: level,
 * source, message, the structured `meta`, and whether someone has dealt with it.
 *
 * Alerts carry no tenant content by construction (see
 * src/lib/observability/system-alert.ts), so a beta-feedback alert links back to
 * the triage board for the report text rather than repeating it here.
 *
 * Labels are threaded in from the server component, matching the sibling
 * feedback board, so this file stays free of locale branching.
 */

import React, { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { ShieldAlert, Filter, CheckCircle2, RotateCcw, Info } from 'lucide-react';
import { setAlertResolved } from './actions';

export interface AlertRow {
  id: string;
  level: string;
  source: string;
  message: string;
  meta: Record<string, unknown> | null;
  createdAt: string;
  resolvedAt: string | null;
}

type Labels = Record<string, string>;

const LEVELS = ['error', 'warn', 'info'] as const;

/**
 * Level chips. Weight and border differ as well as hue, so the ranking survives
 * a colour-vision difference and a greyscale print.
 *
 * Built from the theme tokens in globals.css rather than a light palette plus a
 * `dark:` override: the tokens are already defined per theme, so one class
 * string is correct in both and cannot drift out of step.
 */
const LEVEL_STYLE: Record<string, string> = {
  error: 'border-2 border-bad bg-bad/10 text-bad font-extrabold',
  warn: 'border border-amber bg-amber/10 text-amber font-bold',
  info: 'border border-border bg-surface-hover text-ink-2 font-semibold',
};

export default function AlertsConsoleClient({
  locale,
  rows,
  highlightId,
  loadError,
  labels,
}: {
  locale: string;
  rows: AlertRow[];
  highlightId: string | null;
  loadError: boolean;
  labels: Labels;
}) {
  const [levelFilter, setLevelFilter] = useState<string>('ALL');
  const [sourceFilter, setSourceFilter] = useState<string>('ALL');
  const [unresolvedOnly, setUnresolvedOnly] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(highlightId);
  const [pending, startTransition] = useTransition();
  const [failedId, setFailedId] = useState<string | null>(null);

  /**
   * Optimistic local overlay. `revalidatePath` in the action refreshes the
   * server data, but the row must flip the moment the write returns so the
   * operator is not left wondering whether the click registered.
   */
  const [resolvedOverride, setResolvedOverride] = useState<Record<string, string | null>>({});
  const resolvedAtOf = (row: AlertRow): string | null =>
    row.id in resolvedOverride ? (resolvedOverride[row.id] ?? null) : row.resolvedAt;

  const sources = useMemo(
    () => Array.from(new Set(rows.map((r) => r.source))).sort(),
    [rows]
  );

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (levelFilter === 'ALL' || r.level === levelFilter) &&
          (sourceFilter === 'ALL' || r.source === sourceFilter) &&
          (!unresolvedOnly || resolvedAtOf(r) === null)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, levelFilter, sourceFilter, unresolvedOnly, resolvedOverride]
  );

  const counts = useMemo(() => {
    const byLevel: Record<string, number> = { error: 0, warn: 0, info: 0 };
    let open = 0;
    for (const r of rows) {
      byLevel[r.level] = (byLevel[r.level] ?? 0) + 1;
      if (resolvedAtOf(r) === null) open += 1;
    }
    return { byLevel, open };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, resolvedOverride]);

  const levelLabel = (level: string) => labels[`level${level}`] ?? level;

  const dateFormat = (iso: string) =>
    new Date(iso).toLocaleString(locale === 'tr' ? 'tr-TR' : 'en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

  const onToggleResolved = (row: AlertRow) => {
    const next = resolvedAtOf(row) === null;
    setFailedId(null);
    startTransition(async () => {
      const res = await setAlertResolved({ id: row.id, resolved: next });
      if (res.ok) {
        setResolvedOverride((prev) => ({ ...prev, [row.id]: res.resolvedAt ?? null }));
      } else {
        setFailedId(row.id);
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-xl border bg-surface p-4 shadow-2xs sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-ink sm:text-2xl">
            <ShieldAlert className="h-5 w-5 text-ink-2" aria-hidden="true" />
            {labels.title}
          </h1>
          <p className="mt-1 text-xs text-muted sm:text-sm">{labels.subtitle}</p>
        </div>
        <dl className="flex shrink-0 gap-4 text-xs">
          <div className="rounded-lg border border-border bg-ground px-3 py-2">
            <dt className="text-muted">{labels.total}</dt>
            <dd className="text-lg font-bold text-ink">{rows.length}</dd>
          </div>
          <div className="rounded-lg border border-border bg-ground px-3 py-2">
            <dt className="text-muted">{labels.openCount}</dt>
            <dd className="text-lg font-bold text-ink">{counts.open}</dd>
          </div>
          <div className="rounded-lg border border-border bg-ground px-3 py-2">
            <dt className="text-muted">{labels.errorCount}</dt>
            <dd className="text-lg font-bold text-ink">{counts.byLevel.error ?? 0}</dd>
          </div>
        </dl>
      </div>

      <p className="flex items-start gap-2 rounded-lg border border-border bg-ground p-3 text-xs text-ink-2">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          {labels.privacyNote}{' '}
          <Link
            href={`/${locale}/admin/feedback`}
            className="font-semibold underline underline-offset-2"
          >
            {labels.feedbackLink}
          </Link>
        </span>
      </p>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-surface p-3">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-muted">
          <Filter className="h-3.5 w-3.5" aria-hidden="true" />
          {labels.filterLevel}
        </span>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={labels.filterLevel}>
          <FilterChip
            active={levelFilter === 'ALL'}
            onClick={() => setLevelFilter('ALL')}
            label={`${labels.filterAll} (${rows.length})`}
          />
          {LEVELS.map((l) => (
            <FilterChip
              key={l}
              active={levelFilter === l}
              onClick={() => setLevelFilter(l)}
              label={`${levelLabel(l)} (${counts.byLevel[l] ?? 0})`}
            />
          ))}
        </div>

        <label htmlFor="source-filter" className="ml-2 text-xs font-semibold text-muted">
          {labels.filterSource}
        </label>
        <select
          id="source-filter"
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-ink"
        >
          <option value="ALL">{labels.filterAll}</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <label className="ml-2 flex items-center gap-1.5 text-xs font-semibold text-muted">
          <input
            type="checkbox"
            checked={unresolvedOnly}
            onChange={(e) => setUnresolvedOnly(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-border"
          />
          {labels.filterUnresolvedOnly}
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-surface shadow-2xs">
        <table className="w-full min-w-[820px] border-collapse text-left text-sm">
          <caption className="sr-only">{labels.title}</caption>
          <thead>
            <tr className="border-b bg-ground font-semibold text-ink-2">
              <th scope="col" className="p-3">{labels.colLevel}</th>
              <th scope="col" className="p-3">{labels.colSource}</th>
              <th scope="col" className="p-3">{labels.colMessage}</th>
              <th scope="col" className="p-3">{labels.colResolved}</th>
              <th scope="col" className="p-3 text-right">{labels.colCreated}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-sm text-muted">
                  {loadError ? labels.loadError : labels.empty}
                </td>
              </tr>
            )}
            {filtered.map((row) => {
              const resolvedAt = resolvedAtOf(row);
              const isHighlighted = row.id === highlightId;
              return (
                <React.Fragment key={row.id}>
                  <tr
                    // Token-based tint: a raw light-palette highlight would put
                    // the theme's own light text on a light background.
                    className={`border-b last:border-0 hover:bg-ground ${
                      isHighlighted ? 'bg-accent-light' : ''
                    }`}
                  >
                    <td className="p-3 align-top">
                      <span
                        className={`inline-block rounded border px-2 py-0.5 font-mono text-xs ${
                          LEVEL_STYLE[row.level] ?? LEVEL_STYLE.info
                        }`}
                      >
                        {levelLabel(row.level)}
                      </span>
                    </td>
                    <td className="p-3 align-top font-mono text-xs text-ink-2">{row.source}</td>
                    <td className="p-3 align-top">
                      <button
                        type="button"
                        onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                        aria-expanded={expanded === row.id}
                        aria-controls={`alert-detail-${row.id}`}
                        className="text-left font-medium text-ink underline-offset-2 hover:underline"
                      >
                        {row.message}
                      </button>
                      {isHighlighted && (
                        <span className="mt-0.5 block text-[10px] font-semibold text-accent-ink">
                          {labels.highlighted}
                        </span>
                      )}
                    </td>
                    <td className="p-3 align-top text-xs">
                      {resolvedAt ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-ok">
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                          {labels.resolvedAt}
                        </span>
                      ) : (
                        <span className="text-muted">{labels.unresolvedLabel}</span>
                      )}
                    </td>
                    <td className="p-3 align-top text-right font-mono text-[11px] text-muted">
                      {dateFormat(row.createdAt)}
                    </td>
                  </tr>
                  {expanded === row.id && (
                    <tr id={`alert-detail-${row.id}`} className="border-b bg-ground">
                      <td colSpan={5} className="p-4">
                        <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
                          <div className="space-y-2">
                            <p className="whitespace-pre-wrap text-sm text-ink">{row.message}</p>
                            {row.meta && (
                              <div>
                                <p className="text-[11px] font-semibold text-muted">
                                  {labels.metaLabel}
                                </p>
                                <pre className="mt-1 overflow-x-auto rounded-lg border border-border bg-surface p-3 text-[11px] text-ink-2">
                                  {JSON.stringify(row.meta, null, 2)}
                                </pre>
                              </div>
                            )}
                            {typeof row.meta?.feedbackId === 'string' && (
                              <Link
                                href={`/${locale}/admin/feedback`}
                                className="inline-block text-xs font-semibold underline underline-offset-2"
                              >
                                {labels.feedbackLink}
                              </Link>
                            )}
                          </div>

                          <div className="space-y-2">
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => onToggleResolved(row)}
                              data-testid={`alert-toggle-${row.id}`}
                              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
                            >
                              {resolvedAt ? (
                                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                              ) : (
                                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                              )}
                              {pending
                                ? labels.saving
                                : resolvedAt
                                  ? labels.unresolve
                                  : labels.resolve}
                            </button>
                            {resolvedAt && (
                              <p className="text-[11px] text-muted">
                                {labels.resolvedAt}: {dateFormat(resolvedAt)}
                              </p>
                            )}
                            {failedId === row.id && (
                              <p
                                role="status"
                                className="text-xs font-semibold text-bad"
                              >
                                {labels.saveFailed}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-2.5 py-1 font-mono text-xs transition ${
        active
          ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
          : 'border-border bg-surface text-ink-2 hover:bg-surface-hover'
      }`}
    >
      {label}
    </button>
  );
}
