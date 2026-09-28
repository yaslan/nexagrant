import React from 'react';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';

export default async function ForbiddenPage() {
  // This boundary sits above the `[locale]` segment, so there is no route param
  // to read the language from: `getRequestConfig` resolves the request locale
  // and falls back to the default one. `getTranslations` works server-side
  // without a NextIntlClientProvider, which the root layout does not render.
  const locale = await getLocale();
  const t = await getTranslations('Forbidden');

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 font-sans">
      <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-2xl p-8 text-center shadow-xl space-y-4">
        <div className="w-16 h-16 bg-blue-600/20 border border-blue-500/40 rounded-full flex items-center justify-center mx-auto text-blue-400 font-bold text-2xl font-mono">
          403
        </div>
        <h1 className="text-2xl font-bold font-heading text-white">{t('title')}</h1>
        <p className="text-slate-400 text-sm leading-relaxed">
          {t('description')}
        </p>
        <div className="pt-4">
          <Link
            href={`/${locale}`}
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded-lg transition shadow-sm text-sm"
          >
            {t('backHome')}
          </Link>
        </div>
      </div>
    </div>
  );
}
