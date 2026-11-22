'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { importCommitAction, importPreviewAction } from '../actions';

/**
 * CSV import wizard (NG-135 / F3, `/import`). Pick a file → the server maps the headers and
 * previews the plan → the user adjusts the column mapping → import. Every preview and the
 * commit go through the server, which re-parses the text: nothing trusted is kept here.
 */

const FIELDS = ['name', 'legalName', 'provinceCode', 'website', 'sizeBand'] as const;
type Field = (typeof FIELDS)[number];
type Mapping = Partial<Record<Field, string>>;

interface PreviewState {
  headers: string[];
  mapping: Mapping;
  summary: {
    total: number;
    validCount: number;
    invalidCount: number;
    duplicateCount: number;
    invalid: { line: number; fields: string[] }[];
    duplicates: { line: number; name: string; reason: 'FILE' | 'EXISTING' }[];
  };
}

const inputClass =
  'mt-1 rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-2 focus:outline-offset-2 focus:outline-sky-600';
const buttonClass =
  'rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50';

export function ImportWizard() {
  const t = useTranslations('m18.import');
  const tErr = useTranslations('m18.errors');
  const router = useRouter();
  const [csv, setCsv] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const runPreview = (text: string, mapping?: Mapping) =>
    start(async () => {
      setError(null);
      setResult(null);
      const res = await importPreviewAction({ csv: text, mapping });
      if (!res.ok) {
        setPreview(null);
        setError(tErr(res.code));
        return;
      }
      setPreview({ headers: res.data!.headers, mapping: res.data!.mapping, summary: res.data!.summary });
    });

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    setCsv(text);
    runPreview(text);
  };

  const onMapping = (field: Field, header: string) => {
    if (!csv || !preview) return;
    const next: Mapping = { ...preview.mapping };
    if (header) next[field] = header;
    else delete next[field];
    runPreview(csv, next);
  };

  const onImport = () => {
    if (!csv || !preview) return;
    start(async () => {
      setError(null);
      const res = await importCommitAction({ csv, mapping: preview.mapping });
      if (!res.ok) {
        setError(tErr(res.code));
        return;
      }
      setResult(t('imported', { created: res.data!.created, skipped: res.data!.skipped, invalid: res.data!.invalid }));
      setPreview(null);
      setCsv(null);
      router.refresh();
    });
  };

  const s = preview?.summary;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="import-file">
          {t('fileLabel')}
        </label>
        <input
          id="import-file"
          type="file"
          accept=".csv,text/csv"
          disabled={pending}
          onChange={(e) => void onFile(e.target.files?.[0])}
          className="text-sm"
        />
        <p className="text-xs text-slate-600">{t('fileHelp')}</p>
      </div>

      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      {result ? <p role="status" className="text-sm text-emerald-700">{result}</p> : null}

      {preview && s ? (
        <div className="space-y-6">
          <fieldset className="space-y-3 rounded border border-slate-200 p-4">
            <legend className="px-1 text-base font-semibold">{t('mappingHeading')}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {FIELDS.map((field) => (
                <label key={field} className="text-sm font-medium">
                  {t(`field.${field}`)}
                  <select
                    value={preview.mapping[field] ?? ''}
                    disabled={pending}
                    onChange={(e) => onMapping(field, e.target.value)}
                    className={`${inputClass} w-full`}
                  >
                    <option value="">{t('notMapped')}</option>
                    {preview.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </fieldset>

          <ul className="flex flex-wrap gap-4 text-sm" aria-live="polite">
            <li>{t('countTotal', { count: s.total })}</li>
            <li className="font-medium">{t('countValid', { count: s.validCount })}</li>
            <li>{t('countInvalid', { count: s.invalidCount })}</li>
            <li>{t('countDuplicate', { count: s.duplicateCount })}</li>
          </ul>

          {s.invalid.length > 0 ? (
            <section aria-labelledby="import-invalid">
              <h2 id="import-invalid" className="mb-2 text-base font-semibold">{t('invalidHeading')}</h2>
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-300">
                    <th scope="col" className="py-2 pr-4">{t('colRow')}</th>
                    <th scope="col" className="py-2">{t('colFields')}</th>
                  </tr>
                </thead>
                <tbody>
                  {s.invalid.map((row) => (
                    <tr key={row.line} className="border-b border-slate-100">
                      <td className="py-2 pr-4">{row.line}</td>
                      <td className="py-2">{row.fields.map((f) => (FIELDS.includes(f as Field) ? t(`field.${f}`) : f)).join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}

          {s.duplicates.length > 0 ? (
            <section aria-labelledby="import-duplicate">
              <h2 id="import-duplicate" className="mb-2 text-base font-semibold">{t('duplicateHeading')}</h2>
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-300">
                    <th scope="col" className="py-2 pr-4">{t('colRow')}</th>
                    <th scope="col" className="py-2 pr-4">{t('colName')}</th>
                    <th scope="col" className="py-2">{t('colReason')}</th>
                  </tr>
                </thead>
                <tbody>
                  {s.duplicates.map((row) => (
                    <tr key={row.line} className="border-b border-slate-100">
                      <td className="py-2 pr-4">{row.line}</td>
                      <td className="py-2 pr-4">{row.name}</td>
                      <td className="py-2">{t(`reason.${row.reason}`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}

          <button type="button" onClick={onImport} disabled={pending || s.validCount === 0} className={buttonClass}>
            {t('submit', { count: s.validCount })}
          </button>
        </div>
      ) : null}
    </div>
  );
}
