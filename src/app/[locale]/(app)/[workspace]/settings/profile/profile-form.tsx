'use client';

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Building, Sparkles, Key, CheckCircle, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { getWorkspaceRoute } from '@/lib/routes';
import { updateTenantProfile } from './actions';

/** The tenant's stored profile, read by page.tsx; null when it has never saved one. */
export interface StoredTenantProfile {
  capabilities: string;
  keywords: string[];
  trlRange: number[];
}

export default function TenantProfileForm({ initial }: { initial: StoredTenantProfile | null }) {
  const params = useParams();
  const locale = (params?.locale as string) || 'tr';
  const workspace = (params?.workspace as string) || 'default';
  const t = useTranslations('Profile');

  const [capabilities, setCapabilities] = useState(
    initial?.capabilities ?? t('capabilitiesDefaultText')
  );
  const [keywords, setKeywords] = useState(
    initial ? initial.keywords.join(', ') : t('keywordsDefaultText')
  );
  const [trlMin, setTrlMin] = useState(initial?.trlRange[0] ?? 3);
  const [trlMax, setTrlMax] = useState(initial?.trlRange[1] ?? 8);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedSuccess(false);
    setError('');

    const result = await updateTenantProfile({
      capabilities,
      keywords,
      trlMin,
      trlMax,
    });

    setSaving(false);

    if (result.ok) {
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 4000);
    } else {
      const errorMessages: Record<string, string> = {
        forbidden: t('errorForbidden'),
        invalid: t('errorInvalid'),
        failed: t('errorFailed'),
        pilotExpired: t('errorPilotExpired'),
      };
      setError(errorMessages[result.error] || t('errorGeneric'));
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8 sm:px-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs font-medium text-muted mb-4">
        <Link href={getWorkspaceRoute('dashboard', locale, workspace)} className="hover:text-ink transition-colors">
          {t('breadcrumbDashboard')}
        </Link>
        <span>/</span>
        <Link href={getWorkspaceRoute('settingsModules', locale, workspace)} className="hover:text-ink transition-colors">
          {t('breadcrumbSettings')}
        </Link>
        <span>/</span>
        <span className="text-accent font-semibold">{t('breadcrumbCurrent')}</span>
      </div>

      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold font-heading text-ink">
            {t('title')}
          </h1>
          <p className="text-xs md:text-sm text-muted mt-1 max-w-2xl">
            {t('description')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={getWorkspaceRoute('settingsBilling', locale, workspace)}
            className="text-xs font-semibold text-ink-2 bg-surface hover:bg-surface-hover border border-border px-3 py-2 rounded-lg transition shadow-2xs"
          >
            {t('buttonBilling')}
          </Link>
          <Link
            href={getWorkspaceRoute('settingsApiKeys', locale, workspace)}
            className="text-xs font-semibold text-accent-ink bg-accent/10 hover:bg-accent/20 border border-accent/30 px-3 py-2 rounded-lg transition shadow-2xs"
          >
            {t('buttonApiKeys')}
          </Link>
        </div>
      </div>

      {savedSuccess && (
        <div className="mb-6 p-4 rounded-xl bg-ok/10 border border-ok/30 text-ok flex items-center gap-3 text-xs font-semibold animate-in fade-in">
          <CheckCircle className="w-4 h-4 text-ok shrink-0" />
          <span>{t('successMessage')}</span>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-bad/10 border border-bad/30 text-bad flex items-center gap-3 text-xs font-semibold animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-bad shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6 bg-surface p-6 md:p-8 rounded-2xl border border-border shadow-xs">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-ink mb-1.5 flex items-center gap-2">
            <Building className="w-3.5 h-3.5 text-accent" />
            <span>{t('capabilitiesLabel')}</span>
          </label>
          <textarea
            required
            rows={5}
            value={capabilities}
            onChange={(e) => setCapabilities(e.target.value)}
            className="w-full bg-ground border border-border p-3 rounded-xl text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent leading-relaxed"
            placeholder={t('capabilitiesPlaceholder')}
          />
          <p className="text-[11px] text-muted mt-1">
            {t('capabilitiesHelper')}
          </p>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-ink mb-1.5 flex items-center gap-2">
            <Key className="w-3.5 h-3.5 text-accent" />
            <span>{t('keywordsLabel')}</span>
          </label>
          <input
            type="text"
            required
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            className="w-full bg-ground border border-border p-3 rounded-xl text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder={t('keywordsPlaceholder')}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 bg-ground border border-border rounded-xl">
            <label className="block text-xs font-bold text-ink mb-1">
              {t('trlMinLabel')}
            </label>
            <input
              type="number"
              min="1"
              max="9"
              value={trlMin}
              onChange={(e) => setTrlMin(Number(e.target.value))}
              className="w-full bg-surface border border-border p-2.5 rounded-lg text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent font-mono font-bold"
            />
            <p className="text-[10px] text-muted mt-1">
              {t('trlMinDescription')}
            </p>
          </div>

          <div className="p-4 bg-ground border border-border rounded-xl">
            <label className="block text-xs font-bold text-ink mb-1">
              {t('trlMaxLabel')}
            </label>
            <input
              type="number"
              min="1"
              max="9"
              value={trlMax}
              onChange={(e) => setTrlMax(Number(e.target.value))}
              className="w-full bg-surface border border-border p-2.5 rounded-lg text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent font-mono font-bold"
            />
            <p className="text-[10px] text-muted mt-1">
              {t('trlMaxDescription')}
            </p>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="bg-accent text-white font-semibold text-xs py-2.5 px-6 rounded-xl hover:opacity-90 transition disabled:opacity-50 flex items-center gap-2 shadow-2xs cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              {saving ? t('savingButton') : t('saveButton')}
            </span>
          </button>
        </div>
      </form>
    </div>
  );
}
