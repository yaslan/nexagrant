'use client';

/**
 * TASK-MULQL8QB679LQ — K6 shared RAG corpus: upload a work programme / topic PDF.
 *
 * The route parses the PDF, embeds every chunk (billed to the platform) and stores it with
 * `tenantId: null`, so it reaches every tenant's retrieval. A second upload of the same kind and
 * title is refused with 409 until the admin confirms it here — that is the only duplicate guard,
 * since `Document` keeps no content hash.
 */

import React, { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { FileText, Upload, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  RAG_UPLOAD_ERRORS,
  RAG_UPLOAD_KINDS,
  RAG_UPLOAD_LIMITS,
  isRagUploadKind,
  type RagUploadError,
  type RagUploadKind,
} from '@/lib/rag-upload';

export interface DocumentRow {
  id: string;
  kind: string;
  title: string;
  createdAt: string;
  chunks: number;
}

interface UploadSuccess {
  docId: string;
  chunks: number;
  title: string;
}

interface UploadError {
  code: RagUploadError;
  message?: string;
  existing?: { id: string; chunks: number; createdAt: string };
}

const MAX_MB = RAG_UPLOAD_LIMITS.maxFileBytes / (1024 * 1024);

function titleFromFileName(name: string): string {
  return name.replace(/\.pdf$/i, '').slice(0, RAG_UPLOAD_LIMITS.maxTitleLength);
}

function formatUtc(iso: string): string {
  return `${iso.slice(0, 16).replace('T', ' ')} UTC`;
}

export default function DocumentUploadClient({
  documents,
  total,
  loadError,
}: {
  documents: DocumentRow[];
  total: number;
  loadError: boolean;
}) {
  const t = useTranslations('adminDocuments');
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<RagUploadKind>('work_programme');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UploadSuccess | null>(null);
  const [error, setError] = useState<UploadError | null>(null);

  const kindText = (k: string) => (isRagUploadKind(k) ? t(`kinds.${k}`) : k);
  const errorText = (e: UploadError) =>
    t(`errors.${e.code}`, { maxMb: MAX_MB, maxLength: RAG_UPLOAD_LIMITS.maxTitleLength });

  function clientCheck(): RagUploadError | null {
    if (!file) return 'no_file';
    if (file.size > RAG_UPLOAD_LIMITS.maxFileBytes) return 'too_large';
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) return 'not_pdf';
    const trimmed = title.trim();
    if (trimmed.length === 0 || trimmed.length > RAG_UPLOAD_LIMITS.maxTitleLength) return 'bad_title';
    return null;
  }

  async function upload(allowDuplicate: boolean) {
    const refused = clientCheck();
    if (refused) {
      setError({ code: refused });
      setResult(null);
      return;
    }
    setBusy(true);
    setError(null);
    // A stale count must never sit under a new request.
    setResult(null);
    try {
      const form = new FormData();
      form.set('file', file as File);
      form.set('kind', kind);
      form.set('title', title.trim());
      if (allowDuplicate) form.set('allowDuplicate', 'true');
      const res = await fetch('/api/admin/documents/upload', { method: 'POST', body: form });
      const body = await res.json().catch(() => ({ error: 'upload_failed' }));
      if (!res.ok) {
        const code = (RAG_UPLOAD_ERRORS as readonly string[]).includes(body.error)
          ? (body.error as RagUploadError)
          : 'upload_failed';
        setError({ code, message: body.message, existing: body.existing });
        return;
      }
      setResult({ docId: String(body.docId), chunks: Number(body.chunks), title: title.trim() });
      setFile(null);
      setTitle('');
      if (fileInput.current) fileInput.current.value = '';
      router.refresh();
    } catch {
      setError({ code: 'upload_failed' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-ink flex items-center gap-2">
          <FileText className="w-6 h-6 text-indigo-600" aria-hidden />
          {t('title')}
        </h1>
        <p className="text-sm text-muted max-w-3xl">{t('subtitle')}</p>
      </header>

      <section className="bg-surface border border-border rounded-xl p-5 space-y-4" aria-labelledby="k6-upload">
        <h2 id="k6-upload" className="font-semibold text-ink">
          {t('uploadHeading')}
        </h2>
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void upload(false);
          }}
          aria-busy={busy}
        >
          <label className="block text-sm md:col-span-2">
            <span className="block font-medium text-ink mb-1">{t('fileLabel')}</span>
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf,.pdf"
              data-testid="k6-file"
              disabled={busy}
              onChange={(e) => {
                const picked = e.target.files?.[0] ?? null;
                setFile(picked);
                if (picked && title.trim() === '') setTitle(titleFromFileName(picked.name));
                setError(null);
                setResult(null);
              }}
              className="block w-full text-sm text-ink file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-indigo-700 file:font-semibold"
            />
            <span className="block text-xs text-muted mt-1">{t('fileHint', { maxMb: MAX_MB })}</span>
          </label>
          <label className="block text-sm">
            <span className="block font-medium text-ink mb-1">{t('kindLabel')}</span>
            <select
              value={kind}
              data-testid="k6-kind"
              disabled={busy}
              onChange={(e) => {
                if (isRagUploadKind(e.target.value)) setKind(e.target.value);
                setError(null);
              }}
              className="w-full rounded-md border border-border bg-ground px-3 py-2 text-ink min-h-[44px]"
            >
              {RAG_UPLOAD_KINDS.map((k) => (
                <option key={k} value={k}>
                  {kindText(k)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="block font-medium text-ink mb-1">{t('titleLabel')}</span>
            <input
              type="text"
              value={title}
              data-testid="k6-title"
              disabled={busy}
              required
              maxLength={RAG_UPLOAD_LIMITS.maxTitleLength}
              onChange={(e) => {
                setTitle(e.target.value);
                setError(null);
              }}
              className="w-full rounded-md border border-border bg-ground px-3 py-2 text-ink min-h-[44px]"
            />
          </label>
          <div className="md:col-span-2 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={!file || busy}
              data-testid="k6-submit"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-indigo-700 px-4 py-2 min-h-[44px] text-sm font-semibold text-white hover:bg-indigo-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 disabled:opacity-50"
            >
              <Upload className="w-4 h-4" aria-hidden />
              {busy ? t('working') : t('uploadButton')}
            </button>
            <p className="text-xs text-muted">{t('costNote')}</p>
          </div>
        </form>
        <p role="status" aria-live="polite" className="text-sm text-ink" data-testid="k6-status">
          {busy ? t('workingDetail') : ''}
        </p>
      </section>

      {error && (
        <div role="alert" data-testid="k6-error" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 space-y-2">
          <p className="font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden />
            {errorText(error)}
          </p>
          {error.message && <p className="font-mono text-xs break-words">{error.message}</p>}
          {error.code === 'duplicate' && error.existing && (
            <div className="space-y-2">
              <p className="text-xs">
                {t('duplicateDetail', {
                  chunks: error.existing.chunks,
                  date: formatUtc(error.existing.createdAt),
                })}
              </p>
              <button
                type="button"
                onClick={() => void upload(true)}
                disabled={busy}
                data-testid="k6-upload-anyway"
                className="inline-flex items-center gap-2 rounded-md border border-red-400 bg-white px-3 py-2 min-h-[44px] text-sm font-semibold text-red-900 hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-50"
              >
                {t('uploadAnyway')}
              </button>
            </div>
          )}
        </div>
      )}

      {result && (
        <div data-testid="k6-result" className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950 space-y-1">
          <p className="font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden />
            {t('successHeading')}
          </p>
          <p>{t('successDetail', { title: result.title, chunks: result.chunks })}</p>
          <p className="font-mono text-xs break-all">
            {t('docIdLabel')}: {result.docId}
          </p>
        </div>
      )}

      <section className="bg-surface border border-border rounded-xl p-5 space-y-3" aria-labelledby="k6-current">
        <h2 id="k6-current" className="font-semibold text-ink">
          {t('currentHeading', { total })}
        </h2>
        {loadError ? (
          <p className="text-sm text-red-800">{t('loadError')}</p>
        ) : documents.length === 0 ? (
          <p className="text-sm text-muted">{t('empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs" data-testid="k6-list">
              {total > documents.length && (
                <caption className="text-left text-muted pb-2">{t('listCaption', { shown: documents.length, total })}</caption>
              )}
              <thead>
                <tr className="text-left text-muted border-b border-border">
                  <th scope="col" className="py-2 pr-3">{t('cols.title')}</th>
                  <th scope="col" className="py-2 pr-3">{t('cols.kind')}</th>
                  <th scope="col" className="py-2 pr-3 text-right">{t('cols.chunks')}</th>
                  <th scope="col" className="py-2 pr-3">{t('cols.uploaded')}</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((d) => (
                  <tr key={d.id} className="border-b border-border/60 align-top">
                    <td className="py-1.5 pr-3 text-ink break-words min-w-[10rem]">{d.title}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">{kindText(d.kind)}</td>
                    <td className="py-1.5 pr-3 text-right">{d.chunks}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">{formatUtc(d.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
