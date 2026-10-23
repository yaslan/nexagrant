'use client';

import React, { useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

interface PartnerFiltersProps {
  initialFilters: {
    q: string;
    country: string;
    activityType: string;
    isTurkish: boolean;
    minProjects: number;
    isInterreg?: boolean;
  };
}

export function PartnerFilters({ initialFilters }: PartnerFiltersProps) {
  const t = useTranslations('partnersPage');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [q, setQ] = useState(initialFilters.q);
  const [country, setCountry] = useState(initialFilters.country);
  const [activityType, setActivityType] = useState(initialFilters.activityType);
  const [isTurkish, setIsTurkish] = useState(initialFilters.isTurkish);
  const [minProjects, setMinProjects] = useState(initialFilters.minProjects.toString());
  const [isInterreg, setIsInterreg] = useState(Boolean(initialFilters.isInterreg));

  const handleApplyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());

    if (q.trim()) params.set('q', q.trim());
    else params.delete('q');

    if (country.trim()) params.set('country', country.trim().toUpperCase());
    else params.delete('country');

    if (activityType.trim()) params.set('activity_type', activityType.trim().toUpperCase());
    else params.delete('activity_type');

    if (isTurkish) params.set('is_turkish', 'true');
    else params.delete('is_turkish');

    if (isInterreg) params.set('is_interreg', 'true');
    else params.delete('is_interreg');

    if (parseInt(minProjects, 10) > 0) params.set('min_projects', minProjects);
    else params.delete('min_projects');

    params.delete('page');

    router.push(`${pathname}?${params.toString()}`);
  };

  const handleReset = () => {
    setQ('');
    setCountry('');
    setActivityType('');
    setIsTurkish(false);
    setIsInterreg(false);
    setMinProjects('0');
    router.push(pathname);
  };

  return (
    <form onSubmit={handleApplyFilters} className="bg-surface border border-border p-4 rounded-2xl shadow-xs space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 text-xs">
        {/* Search Query */}
        <div className="md:col-span-2">
          <label className="font-semibold text-ink-2 block mb-1">
            {t('filterNameLabel')}
          </label>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('filterNamePlaceholder')}
            className="w-full border border-border rounded-xl px-3 py-2 text-xs bg-ground text-ink font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Country */}
        <div>
          <label className="font-semibold text-ink-2 block mb-1">{t('filterCountryLabel')}</label>
          <input
            type="text"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="Örn: TR, DE, FR, ES..."
            className="w-full border border-border rounded-xl px-3 py-2 text-xs bg-ground text-ink font-mono font-semibold uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Activity Type */}
        <div>
          <label className="font-semibold text-ink-2 block mb-1">{t('filterTypeLabel')}</label>
          <select
            value={activityType}
            onChange={(e) => setActivityType(e.target.value)}
            className="w-full border border-border rounded-xl px-3 py-2 text-xs bg-ground text-ink font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">{t('filterTypeAll')}</option>
            <option value="HES">HES (Higher Education / Üniversite)</option>
            <option value="REC">REC (Research / Araştırma)</option>
            <option value="PRC">PRC (Private Company / Özel Şirket)</option>
            <option value="PUB">PUB (Public Body / Kamu Kurumu)</option>
            <option value="OTH">OTH (Other / Diğer)</option>
          </select>
        </div>

        {/* Min Projects */}
        <div>
          <label className="font-semibold text-ink-2 block mb-1">{t('filterMinLabel')}</label>
          <select
            value={minProjects}
            onChange={(e) => setMinProjects(e.target.value)}
            className="w-full border border-border rounded-xl px-3 py-2 text-xs bg-ground text-ink font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="0">{t('filterMinAny')}</option>
            <option value="1">{t('minProjectsOption', { count: 1 })}</option>
            <option value="5">{t('minProjectsOption', { count: 5 })}</option>
            <option value="10">{t('minProjectsOption', { count: 10 })}</option>
            <option value="25">{t('minProjectsOption', { count: 25 })}</option>
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border flex-wrap gap-3">
        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-2 text-xs font-semibold text-ink cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isTurkish}
              onChange={(e) => setIsTurkish(e.target.checked)}
              className="rounded border-border text-blue-600 focus:ring-blue-500"
            />
            <span>🇹🇷 {t('filterTurkishOnly')}</span>
          </label>

          <label className="flex items-center gap-2 text-xs font-semibold text-ink cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isInterreg}
              onChange={(e) => setIsInterreg(e.target.checked)}
              className="rounded border-border text-indigo-600 focus:ring-indigo-500"
            />
            <span>🇪🇺 {t('filterInterregOnly')}</span>
          </label>
        </div>

        <div className="flex items-center gap-2">
          {(q || country || activityType || isTurkish || isInterreg || minProjects !== '0') && (
            <button
              type="button"
              onClick={handleReset}
              className="text-xs text-muted hover:text-ink font-semibold px-3 py-2 rounded-xl transition hover:bg-ground"
            >
              {t('clearFilters')}
            </button>
          )}

          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2 rounded-xl transition text-xs shadow-xs"
          >
            {t('filterSubmit')}
          </button>
        </div>
      </div>
    </form>
  );
}
