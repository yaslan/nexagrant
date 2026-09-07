'use client';

/**
 * E11.2 — platform-admin triage board.
 *
 * Every report lands here with a rule-assigned P0–P3. An admin can override the
 * priority and move the status; the rule's original verdict stays visible next
 * to the override so we can see where the rules are wrong.
 *
 * Labels are passed in from the server component rather than read with
 * useTranslations here: the admin console renders under /[locale]/admin, and
 * threading the resolved strings keeps this file free of locale branching.
 */

import React, { useMemo, useState, useTransition } from 'react';
import { MessageSquareWarning, Filter, ExternalLink, Image as ImageIcon } from 'lucide-react';
import { triageFeedbackEntry } from './actions';

export interface TriageRow {
  id: string;
  title: string;
  body: string;
  category: string;
  impact: string;
  priority: string;
  autoPriority: string;
  status: string;
  triageReason: string | null;
  triageNote: string | null;
  pageUrl: string | null;
  alertStatus: string | null;
  alertId: string | null;
  screenshotKey: string | null;
  tenantName: string;
  reporter: string | null;
  createdAt: string;
  slaHours: number;
  overdue: boolean;
}

type Labels = Record<string, string>;

const PRIORITIES = ['P0', 'P1', 'P2', 'P3'] as const;
const STATUSES = ['NEW', 'TRIAGED', 'IN_PROGRESS', 'RESOLVED', 'WONT_FIX'] as const;
const OPEN_STATUSES = new Set(['NEW', 'TRIAGED', 'IN_PROGRESS']);

/**
 * Priority chips. Deliberately not red-only: P0 and P1 differ in weight and
 * border as well as hue, so the ranking survives a colour-vision difference and
 * a greyscale print.
 */
const PRIORITY_STYLE: Record<string, string> = {
  P0: 'bg-red-100 text-red-900 border-red-500 border-2 font-extrabold dark:bg-red-950 dark:text-red-100 dark:border-red-400',
  P1: 'bg-orange-100 text-orange-900 border-orange-400 font-bold dark:bg-orange-950 dark:text-orange-100 dark:border-orange-500',
  P2: 'bg-amber-50 text-amber-900 border-amber-300 font-semibold dark:bg-amber-950 dark:text-amber-100 dark:border-amber-600',
  P3: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600',
};

export default function FeedbackTriageClient({
  locale,
  rows,
  labels,
  categoryLabels,
}: {
  locale: string;
  rows: TriageRow[];
  labels: Labels;
  categoryLabels: Record<string, string>;
}) {
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<{ id: string; ok: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (priorityFilter === 'ALL' || r.priority === priorityFilter) &&
          (statusFilter === 'ALL' || r.status === statusFilter)
      ),
    [rows, priorityFilter, statusFilter]
  );

  const counts = useMemo(() => {
    const byPriority: Record<string, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
    let open = 0;
    let overdue = 0;
    for (const r of rows) {
      byPriority[r.priority] = (byPriority[r.priority] ?? 0) + 1;
      if (OPEN_STATUSES.has(r.status)) open += 1;
      if (r.overdue) overdue += 1;
    }
    return { byPriority, open, overdue };
  }, [rows]);

  /**
   * `legacy` marks a report filed before alerts moved into SystemAlert. Those
   * rows have no alert to link to, and saying so beats showing a blank cell.
   */
  const alertLabel = (status: string | null) => {
    switch (status) {
      case 'recorded':
        return labels.alertRecorded;
      case 'failed':
        return labels.alertFailed;
      case 'legacy':
        return labels.alertLegacy;
      default:
        return labels.alertPending;
    }
  };

  const onSave = (row: TriageRow, priority: string, status: string, note: string) => {
    setFeedbackMessage(null);
    startTransition(async () => {
      const res = await triageFeedbackEntry({ id: row.id, priority, status, note });
      setFeedbackMessage({ id: row.id, ok: res.ok });
    });
  };

  const dateFormat = (iso: string) =>
    new Date(iso).toLocaleString(locale === 'tr' ? 'tr-TR' : 'en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-xl border bg-surface p-4 shadow-2xs sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-ink sm:text-2xl">
            <MessageSquareWarning className="h-5 w-5 text-ink-2" aria-hidden="true" />
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
            <dt className="text-muted">{labels.overdueCount}</dt>
            <dd className="text-lg font-bold text-ink">{counts.overdue}</dd>
          </div>
        </dl>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-surface p-3">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-muted">
          <Filter className="h-3.5 w-3.5" aria-hidden="true" />
          {labels.filterPriority}
        </span>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={labels.filterPriority}>
          <FilterChip
            active={priorityFilter === 'ALL'}
            onClick={() => setPriorityFilter('ALL')}
            label={`${labels.filterAll} (${rows.length})`}
          />
          {PRIORITIES.map((p) => (
            <FilterChip
              key={p}
              active={priorityFilter === p}
              onClick={() => setPriorityFilter(p)}
              label={`${p} (${counts.byPriority[p] ?? 0})`}
            />
          ))}
        </div>

        <span className="ml-2 text-xs font-semibold text-muted">{labels.filterStatus}</span>
        <label className="sr-only" htmlFor="status-filter">
          {labels.filterStatus}
        </label>
        <select
          id="status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-ink"
        >
          <option value="ALL">{labels.filterAll}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {labels[`status${s}`]}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-surface shadow-2xs">
        <table className="w-full min-w-[860px] border-collapse text-left text-sm">
          <caption className="sr-only">{labels.title}</caption>
          <thead>
            <tr className="border-b bg-ground font-semibold text-ink-2">
              <th scope="col" className="p-3">{labels.colPriority}</th>
              <th scope="col" className="p-3">{labels.colTitle}</th>
              <th scope="col" className="p-3">{labels.colCategory}</th>
              <th scope="col" className="p-3">{labels.colStatus}</th>
              <th scope="col" className="p-3">{labels.colReporter}</th>
              <th scope="col" className="p-3">{labels.colAlert}</th>
              <th scope="col" className="p-3 text-right">{labels.colCreated}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-sm text-muted">
                  {labels.empty}
                </td>
              </tr>
            )}
            {filtered.map((row) => (
              <React.Fragment key={row.id}>
                <tr className="border-b last:border-0 hover:bg-ground">
                  <td className="p-3 align-top">
                    <span
                      className={`inline-block rounded border px-2 py-0.5 font-mono text-xs ${PRIORITY_STYLE[row.priority]}`}
                    >
                      {row.priority}
                    </span>
                    {row.priority !== row.autoPriority && (
                      <span className="mt-1 block text-[10px] text-muted">
                        {labels.autoPriorityChanged?.replace('{auto}', row.autoPriority) ??
                          row.autoPriority}
                      </span>
                    )}
                    {row.overdue && (
                      <span className="mt-1 block text-[10px] font-bold text-red-700 dark:text-red-300">
                        {labels.overdue}
                      </span>
                    )}
                  </td>
                  <td className="p-3 align-top">
                    <button
                      type="button"
                      onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                      aria-expanded={expanded === row.id}
                      aria-controls={`detail-${row.id}`}
                      className="text-left font-semibold text-ink underline-offset-2 hover:underline"
                    >
                      {row.title}
                    </button>
                    <span className="mt-0.5 block text-[11px] text-muted">{row.tenantName}</span>
                  </td>
                  <td className="p-3 align-top text-xs text-ink-2">
                    {categoryLabels[row.category] ?? row.category}
                  </td>
                  <td className="p-3 align-top text-xs text-ink-2">{labels[`status${row.status}`]}</td>
                  <td className="p-3 align-top text-xs text-muted">{row.reporter ?? '—'}</td>
                  <td className="p-3 align-top text-xs text-muted">{alertLabel(row.alertStatus)}</td>
                  <td className="p-3 align-top text-right font-mono text-[11px] text-muted">
                    {dateFormat(row.createdAt)}
                  </td>
                </tr>
                {expanded === row.id && (
                  <tr id={`detail-${row.id}`} className="border-b bg-ground">
                    <td colSpan={7} className="p-4">
                      <TriageDetail
                        row={row}
                        locale={locale}
                        labels={labels}
                        pending={pending}
                        result={feedbackMessage?.id === row.id ? feedbackMessage.ok : null}
                        onSave={onSave}
                      />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
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

function TriageDetail({
  row,
  locale,
  labels,
  pending,
  result,
  onSave,
}: {
  row: TriageRow;
  locale: string;
  labels: Labels;
  pending: boolean;
  result: boolean | null;
  onSave: (row: TriageRow, priority: string, status: string, note: string) => void;
}) {
  const [priority, setPriority] = useState(row.priority);
  const [status, setStatus] = useState(row.status);
  const [note, setNote] = useState(row.triageNote ?? '');

  return (
    <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
      <div className="space-y-2">
        <p className="whitespace-pre-wrap text-sm text-ink">{row.body}</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-muted">
          <div>
            <dt className="inline font-semibold">{labels.triageReason}: </dt>
            <dd className="inline font-mono">{row.triageReason ?? '—'}</dd>
          </div>
          <div>
            <dt className="inline font-semibold">{labels.slaLabel}: </dt>
            <dd className="inline">{row.slaHours} h</dd>
          </div>
          {row.pageUrl && (
            <div className="col-span-2">
              <dt className="inline font-semibold">URL: </dt>
              <dd className="inline font-mono">{row.pageUrl}</dd>
            </div>
          )}
          {row.screenshotKey && (
            <div className="col-span-2 flex items-center gap-1">
              <ImageIcon className="h-3 w-3" aria-hidden="true" />
              <span className="font-mono">{row.screenshotKey}</span>
            </div>
          )}
          {row.alertId && (
            <div className="col-span-2 flex items-center gap-1">
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
              <a
                href={`/${locale}/admin/alerts?alert=${encodeURIComponent(row.alertId)}`}
                className="font-mono underline underline-offset-2"
              >
                {labels.alertConsoleLink}
              </a>
            </div>
          )}
        </dl>
      </div>

      <div className="space-y-3">
        <div>
          <label htmlFor={`p-${row.id}`} className="mb-1 block text-xs font-semibold text-ink">
            {labels.colPriority}
          </label>
          <select
            id={`p-${row.id}`}
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-ink"
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`s-${row.id}`} className="mb-1 block text-xs font-semibold text-ink">
            {labels.colStatus}
          </label>
          <select
            id={`s-${row.id}`}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-ink"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {labels[`status${s}`]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`n-${row.id}`} className="mb-1 block text-xs font-semibold text-ink">
            {labels.noteLabel}
          </label>
          <textarea
            id={`n-${row.id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder={labels.notePlaceholder}
            className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-ink placeholder:text-muted"
          />
        </div>

        <button
          type="button"
          disabled={pending}
          onClick={() => onSave(row, priority, status, note)}
          className="w-full rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
        >
          {pending ? labels.saving : labels.saveChanges}
        </button>

        {result !== null && (
          <p
            role="status"
            className={`text-xs font-semibold ${result ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}
          >
            {result ? labels.saved : labels.saveFailed}
          </p>
        )}
      </div>
    </div>
  );
}
