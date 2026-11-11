'use client';

import React, { useEffect, useState } from 'react';

type Locale = 'tr' | 'en';

interface GlobalErrorMessages {
  title: string;
  description: string;
  unknownError: string;
  retry: string;
}

/**
 * Shown only while the catalog is loading or when it failed to load. Mirrors the
 * `globalError` block of the catalogs, so the screen is never blank.
 */
const fallbackMessages: Record<Locale, GlobalErrorMessages> = {
  tr: {
    title: 'Bir Hata Oluştu',
    description: 'Sistemde beklenmeyen bir hata meydana geldi:',
    unknownError: 'Bilinmeyen Hata',
    retry: 'Yeniden Dene',
  },
  en: {
    title: 'Something went wrong',
    description: 'An unexpected error occurred in the system:',
    unknownError: 'Unknown error',
    retry: 'Try again',
  },
};

/**
 * This page replaces the root layout, so next-intl's provider is not mounted here and
 * `useTranslations` cannot be used. The catalog is loaded directly instead, one language
 * at a time and only once an error actually happens: each catalog is ~290 KB, which must
 * not be part of the main bundle.
 */
const catalogLoaders: Record<Locale, () => Promise<{ default: unknown }>> = {
  tr: () => import('../../messages/tr.json'),
  en: () => import('../../messages/en.json'),
};

/** Locale from the URL prefix (`/tr/...`, `/en/...`), else from the browser language. */
function resolveLocale(): Locale {
  const prefix = window.location.pathname.split('/')[1];
  if (prefix === 'tr' || prefix === 'en') return prefix;
  return navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'tr';
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [locale, setLocale] = useState<Locale>('tr');
  const [messages, setMessages] = useState<GlobalErrorMessages | null>(null);
  const text = messages ?? fallbackMessages[locale];

  useEffect(() => {
    const picked = resolveLocale();
    let cancelled = false;
    catalogLoaders[picked]()
      .then((mod) => {
        if (cancelled) return;
        setLocale(picked);
        setMessages((mod.default as { globalError: GlobalErrorMessages }).globalError);
      })
      .catch(() => {
        // The catalog chunk did not load (e.g. a deploy happened in between). The error
        // screen still renders its icon and reset control; the texts stay empty.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <html lang={locale}>
      <body className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-2xl p-8 text-center shadow-xl space-y-4">
          <div className="w-16 h-16 bg-red-600/20 border border-red-500/40 rounded-full flex items-center justify-center mx-auto text-red-400 font-bold text-2xl font-mono">
            !
          </div>
          <h1 className="text-2xl font-bold font-heading text-white">{text.title}</h1>
          <p className="text-slate-400 text-sm leading-relaxed">
            {text.description} <span className="font-mono text-red-300 text-xs block mt-1">{error.message || text.unknownError}</span>
          </p>
          <div className="pt-4">
            <button
              onClick={() => reset()}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded-lg transition shadow-sm text-sm"
            >
              {text.retry}
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
