'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Download, ShieldAlert, Clock, RotateCcw, FileText, AlertTriangle } from 'lucide-react';
import { getWorkspaceRoute } from '@/lib/routes';

interface DeletionStatus {
  pending: boolean;
  requestedAt?: string;
  purgeAt?: string;
}

interface Props {
  locale: string;
  workspace: string;
  initialStatus: DeletionStatus;
}

export default function PrivacySettingsClient({ locale, workspace, initialStatus }: Props) {
  const t = useTranslations('settings.privacy');
  const isTr = locale === 'tr';
  const [status, setStatus] = useState<DeletionStatus>(initialStatus);
  const [exporting, setExporting] = useState(false);
  const [working, setWorking] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const formatDate = (iso?: string) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(isTr ? 'tr-TR' : 'en-GB', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const handleExport = async () => {
    setExporting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/user/export', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fabrika-data-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setMessage({
        kind: 'ok',
        text: t('exportOk'),
      });
    } catch (error) {
      setMessage({
        kind: 'err',
        text: `${t('exportFailed')}: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setExporting(false);
    }
  };

  const handleRequestDeletion = async () => {
    setWorking(true);
    setMessage(null);
    try {
      const res = await fetch('/api/user/request-deletion', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);

      setStatus({
        pending: true,
        requestedAt: new Date().toISOString(),
        purgeAt: body.deletedAt,
      });
      setConfirmOpen(false);
      setMessage({
        kind: 'ok',
        text: t('deleteRequestedOk'),
      });
    } catch (error) {
      setMessage({
        kind: 'err',
        text: `${t('deleteFailed')}: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setWorking(false);
    }
  };

  const handleCancelDeletion = async () => {
    setWorking(true);
    setMessage(null);
    try {
      const res = await fetch('/api/user/request-deletion', { method: 'DELETE' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);

      setStatus({ pending: false });
      setMessage({
        kind: 'ok',
        text: t('cancelledOk'),
      });
    } catch (error) {
      setMessage({
        kind: 'err',
        text: `${t('cancelFailed')}: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8 sm:px-4 space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs font-medium text-muted" aria-label="Breadcrumb">
        <Link href={getWorkspaceRoute('dashboard', locale, workspace)} className="hover:text-ink transition-colors">
          {t('breadcrumbHome')}
        </Link>
        <span>/</span>
        <span className="text-ink">{t('title')}</span>
      </nav>

      <header className="space-y-2">
        <h1 className="text-2xl font-bold font-heading text-ink">
          {t('title')}
        </h1>
        <p className="text-sm text-ink-2">
          {t('intro')}
        </p>
      </header>

      {message && (
        <div
          role="status"
          className={`rounded-lg border px-4 py-3 text-sm ${
            message.kind === 'ok'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700'
              : 'border-red-500/40 bg-red-500/10 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Status */}
      <section className="bg-surface border border-border rounded-xl p-6 space-y-3">
        <h2 className="text-base font-semibold text-ink flex items-center gap-2">
          <Clock className="w-4 h-4 text-accent" aria-hidden="true" />
          {t('statusHeading')}
        </h2>
        {status.pending ? (
          <div className="space-y-3">
            <p className="text-sm text-amber-700 font-medium">
              {t('statusPending', { date: formatDate(status.purgeAt) })}
            </p>
            <button
              onClick={handleCancelDeletion}
              disabled={working}
              className="inline-flex items-center gap-2 text-xs font-semibold border border-border px-4 py-2 rounded-lg text-ink hover:bg-ground transition-colors disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              {t('cancelDeletion')}
            </button>
          </div>
        ) : (
          <p className="text-sm text-emerald-700 font-medium">{t('statusActive')}</p>
        )}
      </section>

      {/* Export */}
      <section className="bg-surface border border-border rounded-xl p-6 space-y-3">
        <h2 className="text-base font-semibold text-ink flex items-center gap-2">
          <Download className="w-4 h-4 text-accent" aria-hidden="true" />
          {t('exportHeading')}
        </h2>
        <p className="text-sm text-ink-2">
          {t('exportDescription')}
        </p>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="inline-flex items-center gap-2 text-xs font-semibold bg-accent-strong text-white px-4 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          {exporting ? t('exportPreparing') : t('exportButton')}
        </button>
      </section>

      {/* Deletion */}
      <section className="bg-surface border border-red-500/30 rounded-xl p-6 space-y-3">
        <h2 className="text-base font-semibold text-ink flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-red-600" aria-hidden="true" />
          {t('deleteHeading')}
        </h2>
        <p className="text-sm text-ink-2">
          {t('deleteDescription')}
        </p>
        <button
          onClick={() => setConfirmOpen(true)}
          disabled={status.pending || working}
          className="inline-flex items-center gap-2 text-xs font-semibold border border-red-500/50 text-red-700 px-4 py-2 rounded-lg hover:bg-red-500/10 transition-colors disabled:opacity-40"
        >
          {t('deleteButton')}
        </button>
      </section>

      {/* Legal links */}
      <section className="bg-surface border border-border rounded-xl p-6 space-y-3">
        <h2 className="text-base font-semibold text-ink flex items-center gap-2">
          <FileText className="w-4 h-4 text-accent" aria-hidden="true" />
          {t('legalHeading')}
        </h2>
        <ul className="text-sm space-y-2">
          <li>
            <Link href={`/${locale}/privacy`} className="text-accent underline hover:no-underline">
              {t('legalPrivacy')}
            </Link>
          </li>
          <li>
            <Link href={`/${locale}/terms`} className="text-accent underline hover:no-underline">
              {t('legalTerms')}
            </Link>
          </li>
          <li>
            <Link href={`/${locale}/compliance/dpa`} className="text-accent underline hover:no-underline">
              {t('legalDpa')}
            </Link>
          </li>
        </ul>
      </section>

      {/* Confirmation modal */}
      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-confirm-title"
        >
          <div className="bg-surface border border-border rounded-xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 id="delete-confirm-title" className="text-lg font-bold text-ink flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" aria-hidden="true" />
              {t('confirmTitle')}
            </h3>
            <p className="text-sm text-ink-2">
              {t('confirmBody')}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={working}
                className="text-xs font-semibold border border-border px-4 py-2 rounded-lg text-ink-2 hover:text-ink transition-colors"
              >
                {t('confirmCancel')}
              </button>
              <button
                onClick={handleRequestDeletion}
                disabled={working}
                className="text-xs font-semibold bg-red-600 text-white px-4 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {working ? t('confirmSubmitting') : t('confirmAccept')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
