'use client';

/**
 * TASK-MULQKV3BJT6VM — K3 Horizon Dashboard upload: choose file → preview → confirm → rescore G0.
 *
 * Preview and apply are two requests with the same bytes. The server returns a sha256 on preview
 * and refuses an apply whose file hashes differently, so what is written is what was reviewed.
 */

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { FileSpreadsheet, Upload, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';

export interface SourceSummary {
  source: string;
  rows: number;
  lastImportedAt: string | null;
}

interface PlannedRow {
  rowNumber: number;
  topicCode: string;
  topicPrefix: string;
  topicId: string | null;
  matchedAs: 'topic' | 'family';
  country: string | null;
  orgType: string | null;
  proposals: number | null;
  funded: number | null;
  successRate: number;
  action: 'insert' | 'update' | 'unchanged';
}

interface ImportResponse {
  ok: true;
  mode: 'preview' | 'apply';
  hash: string;
  fileName: string;
  source: string;
  sheet: string;
  headerRow: number;
  mapping: Record<string, string>;
  rateScale: 'fraction' | 'percent' | 'n/a';
  counts: { insert: number; update: number; unchanged: number; unmatched: number; rejected: number; blank: number };
  planned: PlannedRow[];
  unmatched: { rowNumber: number; topicCode: string }[];
  rejected: { rowNumber: number; topicCode: string | null; reason: string; detail?: string }[];
  written?: { inserted: number; updatedRows: number };
  prefixes?: string[];
}

interface RescoreResponse {
  ok: true;
  opportunities: number;
  scored: number;
  unscorable: number;
  failed: number;
  truncated: boolean;
}

const REJECT_REASONS = [
  'emptyCode',
  'aggregateRow',
  'badCode',
  'badCountry',
  'badCount',
  'fundedExceeds',
  'badRate',
  'rateMismatch',
  'noRate',
  'outOfRange',
  'duplicate',
] as const;

const ERROR_CODES = [
  'no_file',
  'too_large',
  'bad_date',
  'bad_mode',
  'bad_form',
  'not_xlsx',
  'layout_changed',
  'hash_mismatch',
  'import_failed',
  'rescore_failed',
  'bad_prefixes',
] as const;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function TopicStatsImportClient({
  sources,
  total,
  loadError,
}: {
  sources: SourceSummary[];
  total: number;
  loadError: boolean;
}) {
  const t = useTranslations('adminTopicStats');
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [dataDate, setDataDate] = useState<string>(todayUtc());
  const [busy, setBusy] = useState<'preview' | 'apply' | 'rescore' | null>(null);
  const [preview, setPreview] = useState<ImportResponse | null>(null);
  const [applied, setApplied] = useState<ImportResponse | null>(null);
  const [rescore, setRescore] = useState<RescoreResponse | null>(null);
  const [error, setError] = useState<{ code: string; message?: string; headersSeen?: string[] } | null>(null);

  const errorText = (code: string) =>
    (ERROR_CODES as readonly string[]).includes(code) ? t(`errors.${code as (typeof ERROR_CODES)[number]}`) : t('errors.import_failed');
  const reasonText = (code: string) =>
    (REJECT_REASONS as readonly string[]).includes(code) ? t(`reject.${code as (typeof REJECT_REASONS)[number]}`) : code;

  async function send(mode: 'preview' | 'apply') {
    if (!file) {
      setError({ code: 'no_file' });
      return;
    }
    setBusy(mode);
    setError(null);
    if (mode === 'preview') {
      // Clear the last result first: a stale count must never sit under a new request.
      setPreview(null);
      setApplied(null);
      setRescore(null);
    }
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('dataDate', dataDate);
      form.set('mode', mode);
      if (mode === 'apply' && preview) form.set('expectedHash', preview.hash);
      const res = await fetch('/api/admin/topic-stats/import', { method: 'POST', body: form });
      const body = await res.json().catch(() => ({ error: 'import_failed' }));
      if (!res.ok) {
        setError({ code: String(body.error ?? 'import_failed'), message: body.message, headersSeen: body.headersSeen });
        return;
      }
      if (mode === 'preview') setPreview(body as ImportResponse);
      else {
        setApplied(body as ImportResponse);
        router.refresh();
      }
    } catch {
      setError({ code: 'import_failed' });
    } finally {
      setBusy(null);
    }
  }

  async function runRescore() {
    if (!applied?.prefixes?.length) return;
    setBusy('rescore');
    setError(null);
    try {
      const res = await fetch('/api/admin/topic-stats/rescore', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prefixes: applied.prefixes }),
      });
      const body = await res.json().catch(() => ({ error: 'rescore_failed' }));
      if (!res.ok) setError({ code: String(body.error ?? 'rescore_failed') });
      else setRescore(body as RescoreResponse);
    } catch {
      setError({ code: 'rescore_failed' });
    } finally {
      setBusy(null);
    }
  }

  const shown = applied ?? preview;
  const canApply = Boolean(preview && !applied && preview.counts.insert + preview.counts.update > 0);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-ink flex items-center gap-2">
          <FileSpreadsheet className="w-6 h-6 text-indigo-600" aria-hidden />
          {t('title')}
        </h1>
        <p className="text-sm text-muted max-w-3xl">{t('subtitle')}</p>
      </header>

      <section className="bg-surface border border-border rounded-xl p-5 space-y-4" aria-labelledby="k3-upload">
        <h2 id="k3-upload" className="font-semibold text-ink">
          {t('uploadHeading')}
        </h2>
        <div className="grid gap-4 md:grid-cols-[1fr_auto_auto] md:items-end">
          <label className="block text-sm">
            <span className="block font-medium text-ink mb-1">{t('fileLabel')}</span>
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              data-testid="k3-file"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
                setApplied(null);
                setRescore(null);
                setError(null);
              }}
              className="block w-full text-sm text-ink file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-indigo-700 file:font-semibold"
            />
            <span className="block text-xs text-muted mt-1">{t('fileHint')}</span>
          </label>
          <label className="block text-sm">
            <span className="block font-medium text-ink mb-1">{t('dataDateLabel')}</span>
            <input
              type="date"
              value={dataDate}
              max={todayUtc()}
              onChange={(e) => {
                setDataDate(e.target.value);
                setPreview(null);
                setApplied(null);
              }}
              className="rounded-md border border-border bg-ground px-3 py-2 text-ink"
            />
          </label>
          <button
            type="button"
            onClick={() => send('preview')}
            disabled={!file || busy !== null}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 disabled:opacity-50"
          >
            <Upload className="w-4 h-4" aria-hidden />
            {busy === 'preview' ? t('working') : t('previewButton')}
          </button>
        </div>
      </section>

      {error && (
        <div role="alert" data-testid="k3-error" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 space-y-2">
          <p className="font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" aria-hidden />
            {errorText(error.code)}
          </p>
          {error.message && <p className="font-mono text-xs break-words">{error.message}</p>}
          {error.headersSeen && error.headersSeen.length > 0 && (
            <p className="text-xs">
              {t('headersSeen')}: <span className="font-mono">{error.headersSeen.join(' · ')}</span>
            </p>
          )}
        </div>
      )}

      {shown && (
        <section className="bg-surface border border-border rounded-xl p-5 space-y-5" aria-labelledby="k3-preview" data-testid="k3-preview">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="k3-preview" className="font-semibold text-ink">
                {applied ? t('appliedHeading') : t('previewHeading')}
              </h2>
              <p className="text-xs text-muted mt-1">
                {t('sheetInfo', { sheet: shown.sheet, row: shown.headerRow })} · {t(`rateScale.${shown.rateScale === 'n/a' ? 'na' : shown.rateScale}`)}
              </p>
              <p className="text-xs text-muted font-mono break-all">
                {t('sourceLabel')}: {shown.source} · sha256 {shown.hash.slice(0, 12)}…
              </p>
            </div>
            {!applied && (
              <button
                type="button"
                onClick={() => send('apply')}
                disabled={!canApply || busy !== null}
                data-testid="k3-apply"
                className="inline-flex items-center gap-2 rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" aria-hidden />
                {busy === 'apply' ? t('working') : t('applyButton')}
              </button>
            )}
          </div>

          <dl className="grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
            {(['insert', 'update', 'unchanged', 'unmatched', 'rejected', 'blank'] as const).map((k) => (
              <div key={k} className="rounded-lg border border-border bg-ground p-3">
                <dt className="text-xs text-muted">{t(`counts.${k}`)}</dt>
                <dd className="text-xl font-bold text-ink" data-testid={`k3-count-${k}`}>
                  {shown.counts[k]}
                </dd>
              </div>
            ))}
          </dl>

          {applied?.written && (
            <p className="text-sm text-emerald-800" data-testid="k3-written">
              {t('writtenNote', { inserted: applied.written.inserted, updated: applied.written.updatedRows })}
            </p>
          )}

          <details className="text-sm" open>
            <summary className="cursor-pointer font-medium text-ink">{t('mappingHeading')}</summary>
            <table className="mt-2 text-xs">
              <tbody>
                {Object.entries(shown.mapping).map(([field, header]) => (
                  <tr key={field}>
                    <th scope="row" className="pr-4 py-1 text-left font-medium text-muted">
                      {t(`fields.${field as 'topicCode' | 'country' | 'orgType' | 'proposals' | 'funded' | 'successRate'}`)}
                    </th>
                    <td className="py-1 font-mono text-ink">{header}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>

          {shown.unmatched.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" data-testid="k3-unmatched">
              <p className="font-semibold">{t('unmatchedHeading', { count: shown.counts.unmatched })}</p>
              <p className="text-xs mb-2">{t('unmatchedHint')}</p>
              <ul className="font-mono text-xs flex flex-wrap gap-x-4 gap-y-1">
                {shown.unmatched.map((u) => (
                  <li key={`${u.rowNumber}-${u.topicCode}`}>
                    {t('rowRef', { row: u.rowNumber })}: {u.topicCode}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {shown.rejected.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-950" data-testid="k3-rejected">
              <p className="font-semibold">{t('rejectedHeading', { count: shown.counts.rejected })}</p>
              <ul className="text-xs space-y-1 mt-1">
                {shown.rejected.map((r) => (
                  <li key={r.rowNumber}>
                    {t('rowRef', { row: r.rowNumber })}
                    {r.topicCode ? <span className="font-mono"> {r.topicCode}</span> : null}: {reasonText(r.reason)}
                    {r.detail ? <span className="font-mono"> ({r.detail})</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {shown.planned.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <caption className="text-left text-muted pb-2">{t('plannedCaption', { shown: shown.planned.length })}</caption>
                <thead>
                  <tr className="text-left text-muted border-b border-border">
                    <th scope="col" className="py-2 pr-3">{t('cols.row')}</th>
                    <th scope="col" className="py-2 pr-3">{t('cols.action')}</th>
                    <th scope="col" className="py-2 pr-3">{t('cols.topic')}</th>
                    <th scope="col" className="py-2 pr-3">{t('cols.country')}</th>
                    <th scope="col" className="py-2 pr-3">{t('cols.orgType')}</th>
                    <th scope="col" className="py-2 pr-3 text-right">{t('cols.proposals')}</th>
                    <th scope="col" className="py-2 pr-3 text-right">{t('cols.funded')}</th>
                    <th scope="col" className="py-2 pr-3 text-right">{t('cols.successRate')}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.planned.map((p) => (
                    <tr key={p.rowNumber} className="border-b border-border/60">
                      <td className="py-1.5 pr-3 text-muted">{p.rowNumber}</td>
                      <td className="py-1.5 pr-3 font-semibold">{t(`actions.${p.action}`)}</td>
                      <td className="py-1.5 pr-3 font-mono">
                        {p.topicCode}
                        {p.matchedAs === 'family' ? <span className="text-muted"> ({t('familyMatch')})</span> : null}
                      </td>
                      <td className="py-1.5 pr-3">{p.country ?? t('allValues')}</td>
                      <td className="py-1.5 pr-3">{p.orgType ?? t('allValues')}</td>
                      <td className="py-1.5 pr-3 text-right">{p.proposals ?? '—'}</td>
                      <td className="py-1.5 pr-3 text-right">{p.funded ?? '—'}</td>
                      <td className="py-1.5 pr-3 text-right">{p.successRate.toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {applied && (
            <div className="rounded-lg border border-border bg-ground p-4 space-y-2">
              <p className="text-sm text-ink">{t('rescoreHint')}</p>
              <button
                type="button"
                onClick={runRescore}
                disabled={busy !== null || !applied.prefixes?.length}
                data-testid="k3-rescore"
                className="inline-flex items-center gap-2 rounded-md bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 disabled:opacity-50"
              >
                <RefreshCw className="w-4 h-4" aria-hidden />
                {busy === 'rescore' ? t('working') : t('rescoreButton')}
              </button>
              {rescore && (
                <p className="text-sm text-ink" data-testid="k3-rescore-result">
                  {t('rescoreResult', {
                    opportunities: rescore.opportunities,
                    scored: rescore.scored,
                    unscorable: rescore.unscorable,
                    failed: rescore.failed,
                  })}
                  {rescore.truncated ? ` ${t('rescoreTruncated')}` : ''}
                </p>
              )}
            </div>
          )}
        </section>
      )}

      <section className="bg-surface border border-border rounded-xl p-5 space-y-3" aria-labelledby="k3-current">
        <h2 id="k3-current" className="font-semibold text-ink">
          {t('currentHeading', { total })}
        </h2>
        {loadError ? (
          <p className="text-sm text-red-800">{t('loadError')}</p>
        ) : sources.length === 0 ? (
          <p className="text-sm text-muted">{t('empty')}</p>
        ) : (
          <table className="min-w-full text-xs">
            <thead>
              <tr className="text-left text-muted border-b border-border">
                <th scope="col" className="py-2 pr-3">{t('cols.source')}</th>
                <th scope="col" className="py-2 pr-3 text-right">{t('cols.rows')}</th>
                <th scope="col" className="py-2 pr-3">{t('cols.lastImported')}</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.source} className="border-b border-border/60">
                  <td className="py-1.5 pr-3 font-mono break-all">{s.source}</td>
                  <td className="py-1.5 pr-3 text-right">{s.rows}</td>
                  <td className="py-1.5 pr-3">{s.lastImportedAt ? `${s.lastImportedAt.slice(0, 16).replace('T', ' ')} UTC` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
